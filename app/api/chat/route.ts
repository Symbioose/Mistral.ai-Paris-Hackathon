import { NextRequest, NextResponse } from "next/server";
import { MultiAgentGameState, QAPair, InteractionState, EmotionState, SharedMemoryNote } from "@/app/lib/types";
import { chatCompletion, streamChatCompletion } from "@/app/lib/agents/openai-client";
import {
  DEFAULT_EMOTION,
  computeNextEmotion,
  emotionToTtsParams,
  emotionToPromptInstruction,
} from "@/app/lib/emotion-engine";
import { createClient } from "@/app/lib/supabase/server";

const MODEL = "gpt-4.1-mini";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeWeightedScore(
  scores: Array<{ topic: string; score: number; weight: number }>,
): number {
  if (scores.length === 0) return 0;
  const totalWeight = scores.reduce((acc, s) => acc + (Number(s.weight) || 1), 0);
  if (totalWeight <= 0) return 0;
  const weighted = scores.reduce(
    (acc, s) => acc + (Number(s.score) || 0) * (Number(s.weight) || 1),
    0,
  );
  return Math.round(weighted / totalWeight);
}

function sanitizeNarrative(text: string): string {
  const stageStore: string[] = [];
  let protected_ = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  protected_ = protected_.replace(/\*([^*]+)\*/g, (_m, p1: string) => {
    const idx = stageStore.push(p1) - 1;
    return `@@STAGE_${idx}@@`;
  });

  const cleaned = protected_
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();

  return cleaned.replace(
    /@@STAGE_(\d+)@@/g,
    (_m, i: string) => `*${stageStore[Number(i)] || ""}*`,
  );
}



const CONFIRM_REGEX =
  /\b(ok|okay|compris|d'accord|oui|ouais|je comprends|je vois|c'est bon|ca marche|entendu|pig[eé]|j'ai compris|bien compris|c'est clair|c'est note|go|allons-y|on continue|parfait|super|genial|top|nickel|merci|d'ac|yep|exact|effectivement|absolument|tout a fait|bien recu|je saisis|impec|cool)\b/i;
// ---------------------------------------------------------------------------
// Q&A State Machine helpers
// ---------------------------------------------------------------------------

function getCurrentQAPair(gameState: MultiAgentGameState): QAPair | null {
  const { gamePlan, interactionState } = gameState;
  if (!gamePlan || !interactionState) return null;
  const category = gamePlan.categories[interactionState.currentCategoryIndex];
  if (!category) return null;
  const qaId = category.qaPairIds[interactionState.currentQAIndex];
  return gamePlan.qaPairs.find((qa) => qa.id === qaId) || null;
}

function getNextQAInfo(gameState: MultiAgentGameState): {
  hasNext: boolean;
  nextCategoryIndex: number;
  nextQAIndex: number;
  categoryChanged: boolean;
} {
  const { gamePlan, interactionState } = gameState;
  if (!gamePlan || !interactionState) {
    return { hasNext: false, nextCategoryIndex: 0, nextQAIndex: 0, categoryChanged: false };
  }

  const cat = gamePlan.categories[interactionState.currentCategoryIndex];
  if (!cat) return { hasNext: false, nextCategoryIndex: 0, nextQAIndex: 0, categoryChanged: false };

  // More Q&As in current category?
  if (interactionState.currentQAIndex + 1 < cat.qaPairIds.length) {
    return {
      hasNext: true,
      nextCategoryIndex: interactionState.currentCategoryIndex,
      nextQAIndex: interactionState.currentQAIndex + 1,
      categoryChanged: false,
    };
  }

  // More categories?
  if (interactionState.currentCategoryIndex + 1 < gamePlan.categories.length) {
    return {
      hasNext: true,
      nextCategoryIndex: interactionState.currentCategoryIndex + 1,
      nextQAIndex: 0,
      categoryChanged: true,
    };
  }

  return { hasNext: false, nextCategoryIndex: 0, nextQAIndex: 0, categoryChanged: false };
}

// ---------------------------------------------------------------------------
// Evaluate player answer against expected answer (grounded in document)
// ---------------------------------------------------------------------------

interface EvalResult {
  correct: boolean;
  feedback: string;
}

async function evaluateAnswer(
  playerMessage: string,
  qa: QAPair,
): Promise<EvalResult> {
  try {
    const sourceContext = qa.source_excerpt
      ? `\nEXTRAIT DU DOCUMENT SOURCE: "${qa.source_excerpt}"`
      : "";

    const message = await chatCompletion({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Tu es un evaluateur de formation professionnelle. Compare la reponse du joueur avec la reponse attendue du DOCUMENT DE FORMATION.

QUESTION: ${qa.question}
REPONSE ATTENDUE (issue du document): ${qa.expected_answer}
MOTS-CLES DU DOCUMENT: ${qa.keywords.join(", ")}${sourceContext}

CRITERES D'EVALUATION (bases UNIQUEMENT sur le contenu du document):
- Le joueur doit mentionner au moins 1 mot-cle OU couvrir l'idee principale TELLE QUE DECRITE DANS LE DOCUMENT
- Synonymes et reformulations sont acceptes, mais l'idee doit correspondre au document
- Une reponse partielle mais dans la bonne direction (selon le document) = correct
- Une reponse basee sur des connaissances generales mais qui ne correspond PAS au document = incorrect
- Hors sujet ou contraire a la reponse attendue = incorrect

JSON strict uniquement:
{ "correct": true, "feedback": "Courte note pour l'agent (1 phrase)" }`,
        },
        { role: "user", content: `Reponse du joueur: "${playerMessage}"` },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      maxTokens: 200,
      timeoutMs: 10000,
    });

    const raw = String(message.content || "").trim();
    try {
      const parsed = JSON.parse(raw) as EvalResult;
      return {
        correct: Boolean(parsed.correct),
        feedback: String(parsed.feedback || ""),
      };
    } catch {
      // Keyword fallback — require minimum answer length + keyword presence
      const lower = playerMessage.toLowerCase();
      const matched = qa.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
      const hasMinLength = playerMessage.trim().length >= 15;
      const hasEnoughKeywords = matched.length >= Math.min(2, qa.keywords.length);
      const isCorrect = hasMinLength && (hasEnoughKeywords || (matched.length >= 1 && playerMessage.trim().length >= 30));
      return {
        correct: isCorrect,
        feedback: isCorrect ? "Mots-cles detectes" : "Reponse insuffisante",
      };
    }
  } catch (err) {
    console.error("[evaluateAnswer] API error, falling back to keyword match:", err);
    const lower = playerMessage.toLowerCase();
    const matched = qa.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    const hasMinLength = playerMessage.trim().length >= 15;
    const hasEnoughKeywords = matched.length >= Math.min(2, qa.keywords.length);
    const isCorrect = hasMinLength && (hasEnoughKeywords || (matched.length >= 1 && playerMessage.trim().length >= 30));
    return {
      correct: isCorrect,
      feedback: isCorrect ? "Mots-cles detectes (mode secours)" : "Evaluation indisponible — reponse insuffisante",
    };
  }
}

// ---------------------------------------------------------------------------
// POST handler — Q&A State Machine with Deterministic Emotion Engine
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let body: { playerMessage?: string; gameState?: MultiAgentGameState; kickoff?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { playerMessage, gameState, kickoff } = body as {
    playerMessage?: string;
    gameState: MultiAgentGameState;
    kickoff?: boolean;
  };

  if (!gameState || !Array.isArray(gameState.agents) || !gameState.scenario) {
    return Response.json({ error: "Invalid gameState: missing required fields." }, { status: 400 });
  }

  // SEC-08: Prevent oversized payloads that could exhaust memory
  if (gameState.agents.length > 10) {
    return Response.json({ error: "Too many agents." }, { status: 400 });
  }
  if (gameState.conversationHistory && gameState.conversationHistory.length > 200) {
    return Response.json({ error: "Conversation history too long." }, { status: 400 });
  }
  if (gameState.scores && gameState.scores.length > 20) {
    return Response.json({ error: "Too many score entries." }, { status: 400 });
  }

  const safePlayerMessage = String(playerMessage || "").trim().slice(0, 2000);
  const isKickoff = Boolean(kickoff);
  const { gamePlan, interactionState } = gameState;

  const activeAgentState =
    gameState.agents.find((a) => a.agent.id === gameState.activeAgentId) ||
    gameState.agents[0];

  if (!activeAgentState) {
    return Response.json({ error: "No active agent." }, { status: 400 });
  }

  // Build conversation context (last 10 messages for continuity)
  const safeHistory = gameState.conversationHistory
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim())
    .slice(-10);

  const currentQA = getCurrentQAPair(gameState);
  const phase = interactionState?.phase || "ASKING";

  // Current emotion state (from game state or default)
  let currentEmotion: EmotionState = gameState.emotionState || DEFAULT_EMOTION;

  // ---------------------------------------------------------------------------
  // Determine what prompt to give the agent + compute emotion
  // ---------------------------------------------------------------------------

  let agentPrompt = "";
  const nextState: Partial<InteractionState> = {};
  let scoreUpdate: { categoryName: string; delta: number } | null = null;
  let shouldSwitchAgent = false;
  let switchToAgentId = "";
  let shouldAdvanceAct = false;
  let simulationComplete = false;
  let speakerType: "narrator" | "client" | "learning" = "client";

  if (!gamePlan || !interactionState || !currentQA) {
    // GAME-02: Fallback with turn limit to prevent infinite loop
    const fallbackTurnCount = gameState.conversationHistory.filter((m) => m.role === "user").length;
    if (fallbackTurnCount >= 10) {
      simulationComplete = true;
      agentPrompt = "La simulation est terminee. Remercie le joueur chaleureusement en 2 phrases.";
    } else {
      agentPrompt = isKickoff
        ? "Presente-toi en une phrase et pose une premiere question au joueur. Sois naturel et engageant."
        : `Le joueur a dit: "${safePlayerMessage}". Reagis naturellement et pose une question de suivi.`;
    }
  } else if (phase === "COMPLETE") {
    const totalQAs = gamePlan.qaPairs.length;
    const completedCount = interactionState.completedQAs.length;
    const failedCount = interactionState.failedQAs.length;
    const categoryNames = gamePlan.categories.map((c) => c.name).join(", ");
    const totalCategories = gamePlan.categories.length;
    const overallScore = computeWeightedScore(gameState.scores);
    agentPrompt = `La simulation est terminee. Voici les donnees de la session :
- Questions reussies : ${completedCount}/${totalQAs}
- Questions echouees (passees au learning) : ${failedCount}
- Themes abordes (${totalCategories}) : ${categoryNames}
- Score global : ${overallScore}/100

Fais un bilan en 2-3 phrases dans le ton de ton personnage — pas de felicitations scolaires. Mentionne au moins un theme aborde et reste naturel. Si le score est eleve, montre que tu es impressionne a ta maniere. Si le score est moyen, reste encourageant sans condescendance.`;
    simulationComplete = true;
  } else if (phase === "LEARNING") {
    speakerType = "learning";
    const currentLearningTurns = interactionState.learningTurns ?? 0;
    // Learning mode: check if player confirmed understanding OR auto-advance after 3 turns
    if (!isKickoff && (CONFIRM_REGEX.test(safePlayerMessage) || currentLearningTurns >= 2)) {
      // Player understood (or 3 exchanges reached) — switch back to category agent, re-ask
      const catAgent = gamePlan.agents[interactionState.currentCategoryIndex];
      if (catAgent) {
        shouldSwitchAgent = true;
        switchToAgentId = catAgent.id;
        nextState.phase = "RE_ASKING";
        nextState.failCount = 2; // keep fail count for scoring
        nextState.learningTurns = 0;
        agentPrompt = `Le joueur a compris l'explication. Encourage-le brievement et fais une transition naturelle vers ${catAgent.name} qui va reprendre. Exemple : "Tres bien, vous avez saisi l'essentiel ! Je vous laisse avec ${catAgent.name} pour continuer."`;

        // Emotion: learning complete
        currentEmotion = computeNextEmotion(currentEmotion, { type: "learning_complete" });
      }
    } else if (isKickoff) {
      // Learning agent kickoff — explain the answer grounded in the document
      nextState.learningTurns = 0;
      const sourceRef = currentQA.source_excerpt
        ? `\n\nEXTRAIT DU DOCUMENT SOURCE: "${currentQA.source_excerpt}"\n\nBase ton explication UNIQUEMENT sur cet extrait du document. Ne donne pas d'information qui n'est pas dans le document.`
        : "";
      agentPrompt = `Le joueur s'est trompe sur: "${currentQA.question}". La bonne reponse selon le document est: "${currentQA.expected_answer}".${sourceRef}\nExplique clairement pourquoi en citant le document. Sois pedagogique et bienveillante. Termine en demandant si c'est clair pour lui.\n\nINTERDICTION ABSOLUE: ne pose AUCUNE nouvelle question de formation, de reflexion ou de mise en situation. Tu dois UNIQUEMENT expliquer la reponse et verifier que le joueur a compris CE point precis. Pas de "Pourquoi penses-tu que...", pas de "A ton avis...", pas de question supplementaire.`;
    } else {
      // Player said something but didn't confirm — continue explaining
      nextState.learningTurns = currentLearningTurns + 1;
      const sourceRef = currentQA.source_excerpt
        ? ` Rappel — le document dit: "${currentQA.source_excerpt}".`
        : "";
      agentPrompt = `Le joueur a dit: "${safePlayerMessage}". Continue l'explication en te basant sur le document.${sourceRef} Reformule si besoin pour etre plus claire. Redemande si c'est clair.\n\nINTERDICTION ABSOLUE: ne pose AUCUNE nouvelle question de formation, de reflexion ou de mise en situation. Tu expliques UNIQUEMENT ce point precis, rien d'autre.`;
    }
  } else if (isKickoff) {
    // ASKING or RE_ASKING kickoff — agent poses the question
    const isFirst = gameState.conversationHistory.length === 0;
    const situation = currentQA.situation ? `CONTEXTE DE LA SCENE: ${currentQA.situation}` : "";

    if (isFirst) {
      const globalSetting = gamePlan.scenario?.setting || "";
      const globalSituation = gamePlan.scenario?.initial_situation || "";
      agentPrompt = `CADRE GENERAL: ${globalSetting} ${globalSituation}\n${situation}\nCommence par une didascalie entre *asterisques* qui plante le decor de maniere immersive (lieu, ambiance, details sensoriels — 2 a 3 phrases). Pose le cadre general pour que le joueur comprenne OU il est, POURQUOI il est la et QUEL est son role. Puis presente-toi naturellement et amene la question: "${currentQA.question}". RAPPEL: ne revele JAMAIS la reponse, tu la poses, tu ne la donnes pas.`;
    } else {
      agentPrompt = `${situation}\nCommence par une didascalie entre *asterisques* qui fait avancer la scene (transition, nouveau detail d'ambiance, action d'un personnage — 1 a 2 phrases). Puis enchaine naturellement avec la question: "${currentQA.question}". RAPPEL: ne revele JAMAIS la reponse.`;
    }
  } else {
    // ASKING or RE_ASKING — player answered, evaluate
    const evalResult = await evaluateAnswer(safePlayerMessage, currentQA);
    const isReAsking = phase === "RE_ASKING";

    if (evalResult.correct) {
      // Correct answer!
      const cat = gamePlan.categories[interactionState.currentCategoryIndex];
      const numQuestions = Math.max(1, cat?.qaPairIds?.length || 0);
      const maxPointsPerQuestion = 100 / numQuestions;

      // first try: full points, second: 60%, third (after learning): 30%
      const multiplier = interactionState.failCount === 0 ? 1.0 : interactionState.failCount === 1 ? 0.6 : 0.3;
      const scoreDelta = Math.round(maxPointsPerQuestion * multiplier);

      if (cat) scoreUpdate = { categoryName: cat.name, delta: scoreDelta };

      nextState.completedQAs = [...interactionState.completedQAs, currentQA.id];
      nextState.failCount = 0;

      // Emotion: correct answer
      currentEmotion = computeNextEmotion(currentEmotion, {
        type: "correct_answer",
        firstTry: interactionState.failCount === 0,
      });

      const next = getNextQAInfo(gameState);

      if (!next.hasNext) {
        // All done!
        nextState.phase = "COMPLETE";
        simulationComplete = true;
        agentPrompt = `La reponse du joueur est correcte et la simulation touche a sa fin. *Didascalie de fin de scene qui conclut l'histoire*. Conclus la scene de maniere coherente avec ton personnage — reagis comme tu le ferais dans la vraie vie, pas avec des felicitations de prof. Termine la scene naturellement.`;
      } else if (next.categoryChanged) {
        // Category done — switch agent
        nextState.currentCategoryIndex = next.nextCategoryIndex;
        nextState.currentQAIndex = next.nextQAIndex;
        const nextCat = gamePlan.categories[next.nextCategoryIndex];
        nextState.currentQAPairId = nextCat?.qaPairIds[0] || "";
        nextState.phase = "ASKING";
        shouldAdvanceAct = true;

        const nextAgent = gamePlan.agents[next.nextCategoryIndex];
        if (nextAgent) {
          shouldSwitchAgent = true;
          switchToAgentId = nextAgent.id;
        }

        // Emotion resets on act change
        currentEmotion = computeNextEmotion(currentEmotion, { type: "act_change" });

        agentPrompt = `La reponse du joueur est correcte. Reagis brievement comme ton personnage le ferait (pas de felicitations scolaires). Puis fais arriver ${nextAgent?.name || "le personnage suivant"} (${nextAgent?.role || ""}) dans la scene avec une didascalie — il entre, il arrive, il intervient. Tu peux le signaler au joueur ("Ah tiens, voila ${nextAgent?.name || "quelqu'un"}"). INTERDICTIONS: ne pose AUCUNE question a ${nextAgent?.name || "ce personnage"}, ne lui demande PAS d'expliquer ou d'aider. Tu annonces juste son arrivee.`;
      } else {
        // Next Q&A in same category
        nextState.currentQAIndex = next.nextQAIndex;
        const nextQAId = cat?.qaPairIds[next.nextQAIndex] || "";
        nextState.currentQAPairId = nextQAId;
        nextState.phase = "ASKING";
        const nextQA = gamePlan.qaPairs.find((qa) => qa.id === nextQAId);

        const nextSituation = nextQA?.situation ? `CONTEXTE: ${nextQA.situation}` : "";
        agentPrompt = `La reponse du joueur est correcte. Reagis de maniere coherente avec ton personnage et la situation — pas de "bravo" ou de felicitations scolaires, reste dans le ton de la scene (un client mecontent peut simplement acquiescer, un collegue presse peut enchainer directement, etc.). ${nextSituation}\n*Didascalie qui fait avancer la scene*. Puis enchaine naturellement avec la question suivante: "${nextQA?.question || ""}". RAPPEL: ne revele JAMAIS la reponse.`;
      }
    } else {
      // Wrong answer
      const cat = gamePlan.categories[interactionState.currentCategoryIndex];
      const numQuestions = Math.max(1, cat?.qaPairIds?.length || 0);
      const maxPointsPerQuestion = 100 / numQuestions;

      if (isReAsking) {
        // Already in re-asking after learning — be generous, advance anyway
        if (cat) scoreUpdate = { categoryName: cat.name, delta: -Math.round(maxPointsPerQuestion * 0.15) };
        nextState.completedQAs = [...interactionState.completedQAs, currentQA.id];
        nextState.failCount = 0;

        // Emotion: still wrong but we move on
        currentEmotion = computeNextEmotion(currentEmotion, { type: "wrong_answer", failCount: 3 });

        const next = getNextQAInfo(gameState);
        if (!next.hasNext) {
          nextState.phase = "COMPLETE";
          simulationComplete = true;
          agentPrompt = "La simulation touche a sa fin. *Didascalie de conclusion*. Conclus la scene naturellement dans le ton de ton personnage. Mets en valeur ce qui a ete vu ensemble sans insister sur les erreurs.";
        } else if (next.categoryChanged) {
          nextState.currentCategoryIndex = next.nextCategoryIndex;
          nextState.currentQAIndex = next.nextQAIndex;
          nextState.currentQAPairId = gamePlan.categories[next.nextCategoryIndex]?.qaPairIds[0] || "";
          nextState.phase = "ASKING";
          shouldAdvanceAct = true;
          const nextAgent = gamePlan.agents[next.nextCategoryIndex];
          if (nextAgent) { shouldSwitchAgent = true; switchToAgentId = nextAgent.id; }
          currentEmotion = computeNextEmotion(currentEmotion, { type: "act_change" });
          agentPrompt = `Fais une transition sans mentionner l'erreur. Fais arriver ${nextAgent?.name || "le personnage suivant"} (${nextAgent?.role || ""}) dans la scene avec une didascalie — il entre, il arrive, il intervient. Tu peux le signaler au joueur. INTERDICTIONS: ne pose AUCUNE question a ${nextAgent?.name || "ce personnage"}, ne lui demande PAS d'expliquer ou d'aider. Tu annonces juste son arrivee.`;
        } else {
          nextState.currentQAIndex = next.nextQAIndex;
          const nextQAId = gamePlan.categories[interactionState.currentCategoryIndex]?.qaPairIds[next.nextQAIndex] || "";
          nextState.currentQAPairId = nextQAId;
          nextState.phase = "ASKING";
          const nextQA = gamePlan.qaPairs.find((qa) => qa.id === nextQAId);
          const nextSituation = nextQA?.situation ? `CONTEXTE: ${nextQA.situation}` : "";
          agentPrompt = `Enchaine naturellement sans commenter l'erreur. ${nextSituation}\n*Courte didascalie de transition*. Amene la question suivante: "${nextQA?.question || ""}". RAPPEL: ne revele JAMAIS la reponse.`;
        }
      } else if (interactionState.failCount === 0) {
        // First fail — rephrase
        if (cat) scoreUpdate = { categoryName: cat.name, delta: -Math.round(maxPointsPerQuestion * 0.2) };
        nextState.failCount = 1;
        nextState.phase = "REPHRASING";

        // Emotion: first wrong answer
        currentEmotion = computeNextEmotion(currentEmotion, { type: "wrong_answer", failCount: 1 });

        const situation = currentQA.situation ? `CONTEXTE: ${currentQA.situation}` : "";
        const keywordsHint = currentQA.keywords.length > 0
          ? `\nOriente le joueur vers les concepts suivants SANS les nommer directement : [${currentQA.keywords.join(", ")}].`
          : "";
        agentPrompt = `Le joueur n'a pas bien repondu. ${situation}\n*Courte reaction en didascalie*. Reagis avec empathie, donne un indice ou une piste de reflexion, puis reformule la question differemment: "${currentQA.question}". INTERDIT de donner la reponse, meme partiellement. Oriente la reflexion du joueur sans reveler la solution.${keywordsHint}`;
      } else {
        // Second fail — switch to learning mode
        if (cat) scoreUpdate = { categoryName: cat.name, delta: -Math.round(maxPointsPerQuestion * 0.3) };
        nextState.failCount = 2;
        nextState.phase = "LEARNING";
        nextState.failedQAs = [...interactionState.failedQAs, currentQA.id];

        // Emotion: second wrong answer — angry
        currentEmotion = computeNextEmotion(currentEmotion, { type: "wrong_answer", failCount: 2 });

        shouldSwitchAgent = true;
        switchToAgentId = gamePlan.learningAgent.id;

        agentPrompt = `Le joueur s'est trompe 2 fois. *Courte didascalie de reaction coherente avec ta personnalite (1 phrase max)*. Passe la main a ${gamePlan.learningAgent.name} qui va prendre le relais. INTERDICTIONS: ne revele PAS la reponse, ne pose AUCUNE question, ne donne AUCUN indice. Tu fais UNIQUEMENT une courte reaction puis tu laisses ${gamePlan.learningAgent.name} parler.`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Map emotion to legacy AgentEmotion for agent state compatibility
  // ---------------------------------------------------------------------------

  const ttsEmotionResult = emotionToTtsParams(currentEmotion);

  // ---------------------------------------------------------------------------
  // Build patch
  // ---------------------------------------------------------------------------

  // Update agent emotion in agents array
  const updatedAgents = gameState.agents.map((a) => {
    if (a.agent.id === (shouldSwitchAgent ? switchToAgentId : gameState.activeAgentId)) {
      return { ...a, emotion: ttsEmotionResult.emotion };
    }
    return a;
  });

  // Compute progress info
  const mergedInteraction = { ...interactionState, ...nextState };
  const progressCurrentQuestion = (mergedInteraction.completedQAs?.length ?? interactionState?.completedQAs?.length ?? 0) + 1;
  const progressTotalQuestions = gamePlan?.qaPairs?.length ?? 0;
  const progressCurrentCategoryIndex = mergedInteraction.currentCategoryIndex ?? interactionState?.currentCategoryIndex ?? 0;
  const progressCurrentCategory = gamePlan?.categories?.[progressCurrentCategoryIndex]?.name ?? "";
  const progressTotalCategories = gamePlan?.categories?.length ?? 0;

  const patch: Record<string, unknown> = {
    activeAgentId: shouldSwitchAgent ? switchToAgentId : gameState.activeAgentId,
    triggeredEvents: gameState.triggeredEvents,
    agents: updatedAgents,
    currentAct: shouldAdvanceAct
      ? clamp(gameState.currentAct + 1, 1, gamePlan?.categories.length || 1)
      : gameState.currentAct,
    scores: gameState.scores,
    totalScore: gameState.totalScore,
    autoKickoff: shouldSwitchAgent,
    interactionState: {
      ...interactionState,
      ...nextState,
    },
    emotionState: currentEmotion,
    progress: {
      currentQuestion: Math.min(progressCurrentQuestion, progressTotalQuestions),
      totalQuestions: progressTotalQuestions,
      currentCategory: progressCurrentCategory,
      totalCategories: progressTotalCategories,
    },
  };

  // Apply score update
  if (scoreUpdate) {
    const updatedScores = gameState.scores.map((s) => {
      if (s.topic === scoreUpdate!.categoryName) {
        return { ...s, score: clamp(s.score + scoreUpdate!.delta, 0, 100) };
      }
      return s;
    });
    patch.scores = updatedScores;
    patch.totalScore = computeWeightedScore(updatedScores);
  }

  // Act advancement event
  if (shouldAdvanceAct) {
    const nextActNum = (gameState.currentAct || 1) + 1;
    const nextActInfo = gameState.scenario.acts.find((a) => a.act_number === nextActNum);
    patch.triggeredEvents = [
      ...gameState.triggeredEvents,
      `Passage a l'acte ${nextActNum}: ${nextActInfo?.title || "Nouvelle phase"}`,
    ];
    patch.eventType = "plot_twist";
  }

  if (simulationComplete) {
    patch.simulationComplete = true;
    patch.conclusionType = computeWeightedScore(
      (patch.scores as typeof gameState.scores) || gameState.scores,
    ) >= 60 ? "success" : "partial";
    patch.finalMessage = "";
  }

  // Switch reason for UI
  if (shouldSwitchAgent) {
    const switchTarget = gameState.agents.find((a) => a.agent.id === switchToAgentId);
    patch.switchReason = switchTarget
      ? `${switchTarget.agent.name} prend la parole.`
      : "Changement d'interlocuteur.";
  }

  // ---------------------------------------------------------------------------
  // Build system prompt with emotion injection
  // ---------------------------------------------------------------------------

  const emotionInstruction = emotionToPromptInstruction(currentEmotion);

  // Build shared memory context for the active agent
  const sharedMemoryNotes = (gameState.sharedMemory || [])
    .filter((n: SharedMemoryNote) => n.toAgent === activeAgentState.agent.name || n.toAgent === "all")
    .slice(-5);
  const sharedMemoryContext = sharedMemoryNotes.length > 0
    ? `\nNOTES INTERNES recues de tes collegues:\n${sharedMemoryNotes.map((n: SharedMemoryNote) => `- [${n.priority.toUpperCase()}] ${n.fromAgent}: "${n.note}"`).join("\n")}\nUtilise ces notes pour adapter ton comportement.`
    : "";

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: activeAgentState.systemPrompt },
    {
      role: "system",
      content: `ETAT EMOTIONNEL ACTUEL: ${currentEmotion.current.toUpperCase()} (intensite: ${currentEmotion.intensity.toFixed(1)}, trajectoire: ${currentEmotion.trajectory}) — ${emotionInstruction} Adapte IMPERATIVEMENT ton style a cet etat.`,
    },
    {
      role: "system",
      content: `REGLES DE FORMAT:
- Pas de markdown.
- Utilise des *asterisques* pour les didascalies: ambiance, decor, sons, gestes, details de scene (ex: *Le telephone sonne sur le bureau encombre de dossiers*, *Il fronce les sourcils en parcourant le rapport*). Les didascalies peuvent decrire l'environnement pour immerger le joueur dans une situation d'entreprise realiste.
- Tes PAROLES de personnage vont HORS asterisques, sans guillemets.
- INTERDICTION ABSOLUE : ne revele jamais la reponse attendue dans tes paroles. Tu poses des questions, tu ne donnes pas les solutions.
- 80 MOTS MAXIMUM au total (didascalies + paroles).${sharedMemoryContext}`,
    },
    ...safeHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "system", content: agentPrompt },
    {
      role: "user",
      content: isKickoff
        ? "A toi de jouer."
        : safePlayerMessage || "...",
    },
  ];

  const streamModel = MODEL;

  const textStream = streamChatCompletion({
    model: streamModel,
    messages,
    temperature: 0.6,
    maxTokens: 400,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Send initial meta with emotion (no waiting for orchestration)
      send({
        type: "meta",
        patch,
        emotion: {
          current: currentEmotion.current,
          intensity: currentEmotion.intensity,
          trajectory: currentEmotion.trajectory,
          reason: currentEmotion.reason,
        },
        speakerType,
      });

      let streamedRaw = "";
      let streamedSent = "";
      let tokenEventCount = 0;

      try {
        const reader = textStream.getReader();
        const streamStart = Date.now();
        const STREAM_TIMEOUT_MS = 30000;
        while (true) {
          // GAME-05: Abort if stream stalls for too long
          if (Date.now() - streamStart > STREAM_TIMEOUT_MS) {
            console.warn("[chat] Stream timeout after 30s");
            reader.cancel();
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
          const rawDelta = String(value || "");
          if (!rawDelta) continue;
          streamedRaw += rawDelta;

          const candidate = streamedRaw.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
          if (candidate && candidate.startsWith(streamedSent) && candidate.length > streamedSent.length) {
            streamedSent = candidate;
            tokenEventCount += 1;
            send({ type: "token", content: streamedSent });
          }
        }
      } catch {
        // Streaming failed — use fallback text
      }

      const content = sanitizeNarrative(streamedRaw.trim()) || "Situation critique. Votre decision ?";
      const normalizedFinal = content.replace(/\s+/g, " ").trim();

      // Synthesize tokens if streaming produced nothing
      if (tokenEventCount === 0 && normalizedFinal) {
        const words = normalizedFinal.split(" ");
        let acc = "";
        for (const word of words) {
          acc = acc ? `${acc} ${word}` : word;
          send({ type: "token", content: acc });
          await new Promise((resolve) => setTimeout(resolve, 14));
        }
      }

      send({
        type: "done",
        content: normalizedFinal,
        patch,
        emotion: {
          current: currentEmotion.current,
          intensity: currentEmotion.intensity,
          trajectory: currentEmotion.trajectory,
          reason: currentEmotion.reason,
        },
        speakerType,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
