import { NextRequest } from "next/server";
import { MultiAgentGameState, QAPair, InteractionState, AgentEmotion } from "@/app/lib/types";
import { mistralChat } from "@/app/lib/agents/mistral-client";
import { streamText } from "ai";
import { mistral as vercelMistral } from "@ai-sdk/mistral";

// ---------------------------------------------------------------------------
// Mistral Function Calling — Tools for agent orchestration
// ---------------------------------------------------------------------------

const ORCHESTRATION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "update_emotion",
      description:
        "Change l'état émotionnel de l'agent actif. Affecte la voix TTS et les animations.",
      parameters: {
        type: "object",
        properties: {
          emotion: {
            type: "string",
            enum: ["calm", "stressed", "angry", "panicked", "suspicious"],
            description: "La nouvelle émotion de l'agent",
          },
          reason: {
            type: "string",
            description: "Courte raison du changement émotionnel (1 phrase)",
          },
        },
        required: ["emotion", "reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "trigger_event",
      description:
        "Déclenche un événement narratif dramatique dans la simulation (alarme, appel urgent, panne, intrusion, etc.)",
      parameters: {
        type: "object",
        properties: {
          event_type: {
            type: "string",
            enum: ["alert", "complication", "revelation", "time_pressure", "plot_twist"],
            description: "Type d'événement narratif",
          },
          description: {
            type: "string",
            description: "Description courte de l'événement (1 phrase)",
          },
        },
        required: ["event_type", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "agent_note",
      description:
        "L'agent envoie une note interne aux autres agents (inter-agent communication). Visible dans le journal de mission.",
      parameters: {
        type: "object",
        properties: {
          to_agent: {
            type: "string",
            description: "Nom de l'agent destinataire",
          },
          note: {
            type: "string",
            description: "Message interne entre agents (1-2 phrases)",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Priorité du message",
          },
        },
        required: ["to_agent", "note", "priority"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Parallel orchestration — runs alongside streaming for agent drama
// ---------------------------------------------------------------------------

interface OrchestrationResult {
  emotionUpdate?: { emotion: AgentEmotion; reason: string };
  triggeredEvent?: { event_type: string; description: string };
  agentNote?: { to_agent: string; note: string; priority: string };
}

async function runOrchestration(
  agentName: string,
  agentRole: string,
  playerMessage: string,
  phase: string,
  currentScore: number,
  scenarioContext: string,
): Promise<OrchestrationResult> {
  try {
    const message = await mistralChat({
      model: "mistral-large-latest",
      messages: [
        {
          role: "system",
          content: `Tu es le moteur d'orchestration d'une simulation RPG de formation.
Agent actif: ${agentName} (${agentRole})
Phase: ${phase} | Score joueur: ${currentScore}/100
Contexte: ${scenarioContext}

Analyse la situation et utilise les outils disponibles si pertinent:
- update_emotion: change l'émotion de l'agent si la situation le justifie
- trigger_event: déclenche un événement narratif si la tension le permet (max 1 événement toutes les 3 interactions)
- agent_note: envoie un message inter-agent si utile (ex: alerter un collègue, demander un avis)

Tu peux utiliser 0, 1 ou 2 outils. Ne force pas — n'utilise que si c'est pertinent.`,
        },
        {
          role: "user",
          content: playerMessage
            ? `Le joueur a dit: "${playerMessage}"`
            : "Début d'interaction — l'agent prend la parole.",
        },
      ],
      tools: ORCHESTRATION_TOOLS,
      toolChoice: "auto",
      temperature: 0.6,
      maxTokens: 300,
      timeoutMs: 8000,
    });

    const result: OrchestrationResult = {};

    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        const fn = tc?.function;
        if (!fn?.name) continue;
        let args: Record<string, unknown> = {};
        try {
          args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments || {};
        } catch {
          continue;
        }

        if (fn.name === "update_emotion" && args.emotion) {
          result.emotionUpdate = {
            emotion: String(args.emotion) as AgentEmotion,
            reason: String(args.reason || ""),
          };
        } else if (fn.name === "trigger_event" && args.event_type) {
          result.triggeredEvent = {
            event_type: String(args.event_type),
            description: String(args.description || ""),
          };
        } else if (fn.name === "agent_note" && args.to_agent) {
          result.agentNote = {
            to_agent: String(args.to_agent),
            note: String(args.note || ""),
            priority: String(args.priority || "low"),
          };
        }
      }
    }

    return result;
  } catch {
    // Orchestration is non-critical — fail silently
    return {};
  }
}

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
  /\b(ok|compris|d'accord|oui|je comprends|c'est bon|entendu|pig[eé]|j'ai compris|bien compris|c'est clair|go|allons-y|on continue)\b/i;

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
// Evaluate player answer against expected answer
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
    const message = await mistralChat({
      model: "mistral-large-latest",
      messages: [
        {
          role: "system",
          content: `Tu es un evaluateur de formation. Compare la reponse du joueur avec la reponse attendue.

QUESTION: ${qa.question}
REPONSE ATTENDUE: ${qa.expected_answer}
MOTS-CLES ATTENDUS: ${qa.keywords.join(", ")}

CRITERES:
- Le joueur doit mentionner au moins 1 mot-cle OU couvrir l'idee principale
- Synonymes et reformulations sont acceptes
- Une reponse partielle mais dans la bonne direction = correct
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
      // Keyword fallback
      const lower = playerMessage.toLowerCase();
      const matched = qa.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
      return {
        correct: matched.length >= 1,
        feedback: matched.length >= 1 ? "Mots-cles detectes" : "Aucun mot-cle trouve",
      };
    }
  } catch {
    // On error, be generous
    return { correct: true, feedback: "Evaluation indisponible" };
  }
}

// ---------------------------------------------------------------------------
// POST handler — Q&A State Machine
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { playerMessage, gameState, kickoff } = (await req.json()) as {
    playerMessage?: string;
    gameState: MultiAgentGameState;
    kickoff?: boolean;
  };

  const safePlayerMessage = String(playerMessage || "").trim();
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

  // ---------------------------------------------------------------------------
  // Determine what prompt to give the agent
  // ---------------------------------------------------------------------------

  let agentPrompt = "";
  const nextState: Partial<InteractionState> = {};
  let scoreUpdate: { categoryName: string; delta: number } | null = null;
  let shouldSwitchAgent = false;
  let switchToAgentId = "";
  let shouldAdvanceAct = false;
  let simulationComplete = false;

  if (!gamePlan || !interactionState || !currentQA) {
    // Fallback: no game plan, just have the agent talk
    agentPrompt = isKickoff
      ? "Presente-toi brievement et pose une premiere question au joueur. 2 phrases max."
      : `Le joueur a dit: "${safePlayerMessage}". Reagis brievement et pose une question. 2 phrases max.`;
  } else if (phase === "COMPLETE") {
    agentPrompt = "La simulation est terminee. Donne un bilan encourageant en 2 phrases.";
    simulationComplete = true;
  } else if (phase === "LEARNING") {
    // Learning mode: check if player confirmed understanding
    if (!isKickoff && CONFIRM_REGEX.test(safePlayerMessage)) {
      // Player understood — switch back to category agent, re-ask
      const catAgent = gamePlan.agents[interactionState.currentCategoryIndex];
      if (catAgent) {
        shouldSwitchAgent = true;
        switchToAgentId = catAgent.id;
        nextState.phase = "RE_ASKING";
        nextState.failCount = 2; // keep fail count for scoring
        agentPrompt = `Le joueur vient d'apprendre la reponse. Repose cette question differemment: "${currentQA.question}". Mets-le en situation avec: ${currentQA.situation}. 2 phrases max.`;
      }
    } else if (isKickoff) {
      // Learning agent kickoff — explain the answer
      agentPrompt = `Le joueur n'a pas reussi a repondre a cette question: "${currentQA.question}"

La bonne reponse est: "${currentQA.expected_answer}"

Explique clairement pourquoi c'est la bonne reponse. Sois pedagogique et bienveillant. 3 phrases max. Termine par "Dites-moi quand vous avez compris" ou equivalent.`;
    } else {
      // Player said something but didn't confirm — continue explaining
      agentPrompt = `Le joueur a dit: "${safePlayerMessage}". Il n'a pas encore confirme qu'il a compris.
La question etait: "${currentQA.question}" et la reponse: "${currentQA.expected_answer}".
Continue a expliquer differemment. Sois patient. 2 phrases max. Redemande s'il a compris.`;
    }
  } else if (isKickoff) {
    // ASKING or RE_ASKING kickoff — agent poses the question
    const isFirst = gameState.conversationHistory.length === 0;
    if (isFirst) {
      agentPrompt = `Tu commences la simulation. Presente-toi en une phrase courte, puis mets le joueur en situation.

Voici la situation a jouer: ${currentQA.situation}

Pose cette question dans ton style personnel: "${currentQA.question}"

IMPORTANT: Ne donne JAMAIS la reponse. Decris la situation, pose la question. 3 phrases max.`;
    } else {
      agentPrompt = `Tu prends la parole dans la simulation en cours.

Voici la situation a jouer: ${currentQA.situation}

Pose cette question dans ton style personnel: "${currentQA.question}"

IMPORTANT: Ne donne JAMAIS la reponse. 2 phrases max.`;
    }
  } else {
    // ASKING or RE_ASKING — player answered, evaluate
    const evalResult = await evaluateAnswer(safePlayerMessage, currentQA);
    const isReAsking = phase === "RE_ASKING";

    if (evalResult.correct) {
      // Correct answer!
      const scoreDelta = interactionState.failCount === 0 ? 15 : interactionState.failCount === 1 ? 8 : 3;
      const cat = gamePlan.categories[interactionState.currentCategoryIndex];
      if (cat) scoreUpdate = { categoryName: cat.name, delta: scoreDelta };

      nextState.completedQAs = [...interactionState.completedQAs, currentQA.id];
      nextState.failCount = 0;

      const next = getNextQAInfo(gameState);

      if (!next.hasNext) {
        // All done!
        nextState.phase = "COMPLETE";
        simulationComplete = true;
        agentPrompt = `Le joueur a bien repondu. Felicite-le brievement. La simulation est terminee. Donne un bilan positif en 2 phrases.`;
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

        agentPrompt = `Le joueur a bien repondu a la derniere question de ta categorie. Felicite-le en une phrase courte. *Une nouvelle phase commence.*`;
      } else {
        // Next Q&A in same category
        nextState.currentQAIndex = next.nextQAIndex;
        const nextQAId = cat?.qaPairIds[next.nextQAIndex] || "";
        nextState.currentQAPairId = nextQAId;
        nextState.phase = "ASKING";
        const nextQA = gamePlan.qaPairs.find((qa) => qa.id === nextQAId);

        agentPrompt = `Le joueur a bien repondu. Reagis positivement en quelques mots, puis enchaine directement.

Prochaine situation: ${nextQA?.situation || ""}
Prochaine question a poser: "${nextQA?.question || ""}"

Enchaine naturellement. 2-3 phrases max. Ne donne JAMAIS la reponse.`;
      }
    } else {
      // Wrong answer
      if (isReAsking) {
        // Already in re-asking after learning — be generous, advance anyway
        const cat = gamePlan.categories[interactionState.currentCategoryIndex];
        if (cat) scoreUpdate = { categoryName: cat.name, delta: -2 };
        nextState.completedQAs = [...interactionState.completedQAs, currentQA.id];
        nextState.failCount = 0;

        const next = getNextQAInfo(gameState);
        if (!next.hasNext) {
          nextState.phase = "COMPLETE";
          simulationComplete = true;
          agentPrompt = "Ce n'est pas exactement ca, mais tu as fait de ton mieux. La simulation est terminee. Bilan en 2 phrases.";
        } else if (next.categoryChanged) {
          nextState.currentCategoryIndex = next.nextCategoryIndex;
          nextState.currentQAIndex = next.nextQAIndex;
          nextState.currentQAPairId = gamePlan.categories[next.nextCategoryIndex]?.qaPairIds[0] || "";
          nextState.phase = "ASKING";
          shouldAdvanceAct = true;
          const nextAgent = gamePlan.agents[next.nextCategoryIndex];
          if (nextAgent) { shouldSwitchAgent = true; switchToAgentId = nextAgent.id; }
          agentPrompt = "Pas grave, on avance. *Transition vers une nouvelle phase.* Dis au joueur qu'on passe a la suite.";
        } else {
          nextState.currentQAIndex = next.nextQAIndex;
          const nextQAId = gamePlan.categories[interactionState.currentCategoryIndex]?.qaPairIds[next.nextQAIndex] || "";
          nextState.currentQAPairId = nextQAId;
          nextState.phase = "ASKING";
          const nextQA = gamePlan.qaPairs.find((qa) => qa.id === nextQAId);
          agentPrompt = `Pas grave, on continue. Prochaine situation: ${nextQA?.situation || ""}. Question: "${nextQA?.question || ""}". 2 phrases max.`;
        }
      } else if (interactionState.failCount === 0) {
        // First fail — rephrase
        const cat = gamePlan.categories[interactionState.currentCategoryIndex];
        if (cat) scoreUpdate = { categoryName: cat.name, delta: -3 };
        nextState.failCount = 1;
        nextState.phase = "REPHRASING";

        agentPrompt = `Le joueur n'a pas bien repondu (${evalResult.feedback}). Dis "Pas tout a fait" ou equivalent, puis reformule la MEME question differemment.

Question originale: "${currentQA.question}"
Reformule de maniere plus simple et concrete. Donne un indice subtil SANS donner la reponse. 2 phrases max.`;
      } else {
        // Second fail — switch to learning mode
        const cat = gamePlan.categories[interactionState.currentCategoryIndex];
        if (cat) scoreUpdate = { categoryName: cat.name, delta: -5 };
        nextState.failCount = 2;
        nextState.phase = "LEARNING";
        nextState.failedQAs = [...interactionState.failedQAs, currentQA.id];

        shouldSwitchAgent = true;
        switchToAgentId = gamePlan.learningAgent.id;

        agentPrompt = `Le joueur s'est trompe une deuxieme fois. Dis quelque chose comme "On va demander de l'aide" ou "Je passe la parole a la formatrice". 1 phrase max.`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build patch
  // ---------------------------------------------------------------------------

  const patch: Record<string, unknown> = {
    activeAgentId: shouldSwitchAgent ? switchToAgentId : gameState.activeAgentId,
    triggeredEvents: gameState.triggeredEvents,
    agents: gameState.agents,
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
  // Launch parallel orchestration (function calling) + streaming
  // ---------------------------------------------------------------------------

  const orchestrationPromise = runOrchestration(
    activeAgentState.agent.name,
    activeAgentState.agent.role,
    safePlayerMessage,
    phase,
    gameState.totalScore,
    gameState.scenario?.initial_situation || "",
  );

  const messages = [
    { role: "system" as const, content: activeAgentState.systemPrompt },
    {
      role: "system" as const,
      content: `REGLES: 3 phrases MAX. Pas de markdown. Utilise *asterisques* uniquement pour les descriptions de scene (ex: *Le telephone sonne*). Ne donne JAMAIS la reponse dans ta question.`,
    },
    ...safeHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "system" as const, content: agentPrompt },
    {
      role: "user" as const,
      content: isKickoff
        ? "A toi de jouer."
        : safePlayerMessage || "...",
    },
  ];

  const textResult = streamText({
    model: vercelMistral("mistral-large-latest"),
    messages: messages.map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    temperature: 0.5,
    maxOutputTokens: 150,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Wait for orchestration result (runs in parallel with streaming)
      const orchResult = await orchestrationPromise;

      // Apply orchestration results to patch
      const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

      if (orchResult.emotionUpdate) {
        const updatedAgents = gameState.agents.map((a) => {
          if (a.agent.id === gameState.activeAgentId) {
            return { ...a, emotion: orchResult.emotionUpdate!.emotion };
          }
          return a;
        });
        patch.agents = updatedAgents;
        toolCalls.push({
          name: "update_emotion",
          args: { emotion: orchResult.emotionUpdate.emotion, reason: orchResult.emotionUpdate.reason },
        });
      }

      if (orchResult.triggeredEvent) {
        patch.triggeredEvents = [
          ...(patch.triggeredEvents as string[] || gameState.triggeredEvents),
          orchResult.triggeredEvent.description,
        ];
        patch.eventType = orchResult.triggeredEvent.event_type;
        toolCalls.push({
          name: "trigger_event",
          args: { event_type: orchResult.triggeredEvent.event_type, description: orchResult.triggeredEvent.description },
        });
      }

      if (orchResult.agentNote) {
        toolCalls.push({
          name: "agent_note",
          args: { to_agent: orchResult.agentNote.to_agent, note: orchResult.agentNote.note, priority: orchResult.agentNote.priority },
        });
      }

      send({ type: "meta", patch, toolCalls });

      let streamedRaw = "";
      let streamedSent = "";
      let tokenEventCount = 0;

      try {
        for await (const delta of textResult.textStream) {
          const rawDelta = String(delta || "");
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

      send({ type: "done", content: normalizedFinal, patch, toolCalls });
      send({ type: "meta", patch, toolCalls });

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
