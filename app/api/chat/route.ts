import { NextRequest } from "next/server";
import { evaluateExchange } from "@/app/lib/agents/evaluator";
import { MultiAgentGameState } from "@/app/lib/types";
import { mistralChat } from "@/app/lib/agents/mistral-client";
import { streamText } from "ai";
import { mistral as vercelMistral } from "@ai-sdk/mistral";

interface ToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ScoreEntry {
  topic: string;
  score: number;
  weight: number;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeWeightedScore(scores: ScoreEntry[]): number {
  if (scores.length === 0) return 0;
  const totalWeight = scores.reduce((acc, s) => acc + (Number(s.weight) || 1), 0);
  if (totalWeight <= 0) return 0;
  const weighted = scores.reduce((acc, s) => acc + (Number(s.score) || 0) * (Number(s.weight) || 1), 0);
  return Math.round(weighted / totalWeight);
}

function sanitizeNarrative(text: string): string {
  // 1. Protect *stage directions* (single asterisks) by temporarily replacing them.
  const stageStore: string[] = [];
  let protected_ = text.replace(/\*\*([^*]+)\*\*/g, "$1"); // Strip **bold** first
  protected_ = protected_.replace(/\*([^*]+)\*/g, (_m, p1: string) => {
    const idx = stageStore.push(p1) - 1;
    return `@@STAGE_${idx}@@`;
  });

  const cleaned = protected_
    .replace(/\b(switch_agent|trigger_event|update_emotion|check_knowledge|conclude_simulation)\b/gi, "")
    .replace(/\b(j[‘’]?appelle|je vais appeler)\s+\?/gi, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();

  // Restore *stage directions*
  const restored = cleaned.replace(/@@STAGE_(\d+)@@/g, (_m, i: string) => `*${stageStore[Number(i)] || ""}*`);
  return restored.replace(
    /(\?.*)\s+Quelle est votre prochaine action\s*\?\s*$/i,
    "$1",
  );
}

function enforcePingPong(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Action immediate. Votre decision ?";
  const clipped = words.slice(0, 15).join(" ").replace(/[.!]+$/g, "").trim();
  if (!clipped.includes("?")) return `${clipped} ?`;
  return clipped;
}

function buildRecentSummary(
  history: Array<{ role: string; content: string; agentId?: string }>,
  agents: MultiAgentGameState["agents"],
): string {
  const recent = history.slice(-10);
  if (recent.length === 0) return "";

  const lines = recent.map((m) => {
    if (m.role === "user") {
      return `Joueur: ${String(m.content || "").slice(0, 150)}`;
    }
    const agentName =
      agents.find((a) => a.agent.id === m.agentId)?.agent.name ||
      "Agent";
    return `${agentName}: ${String(m.content || "").slice(0, 150)}`;
  });

  return `\n## HISTORIQUE RECENT — Les autres agents ont deja pose ces questions. NE REPETE PAS les memes sujets.\n${lines.join("\n")}`;
}

function normalizeQuestionKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestion(text: string): string {
  const clean = String(text || "").trim();
  const qIdx = clean.lastIndexOf("?");
  if (qIdx === -1) return clean;
  const start = clean.lastIndexOf(".", qIdx) + 1;
  return clean.slice(start, qIdx + 1).trim();
}

function buildQALedger(
  history: Array<{ role: "user" | "assistant"; content: string; agentId?: string }>,
  agents: MultiAgentGameState["agents"],
): string {
  const rows: string[] = [];
  for (let i = 0; i < history.length; i += 1) {
    const msg = history[i];
    if (msg.role !== "assistant") continue;
    const question = extractQuestion(msg.content);
    if (!question.includes("?")) continue;
    const nextUser = history.slice(i + 1).find((m) => m.role === "user");
    const agentName =
      agents.find((a) => a.agent.id === msg.agentId)?.agent.name || "Agent";
    rows.push(
      `- ${agentName} a demande: "${question}" | Reponse joueur: "${String(nextUser?.content || "N/A").slice(0, 120)}"`,
    );
  }
  if (rows.length === 0) return "";
  return `\n## MEMOIRE QA (NE PAS REPETER)\n${rows.slice(-8).join("\n")}`;
}

function avoidRepeatedQuestion(
  content: string,
  gameState: MultiAgentGameState,
  activeAgentRole: string,
): string {
  const newQ = extractQuestion(content);
  if (!newQ.includes("?")) return content;
  const newKey = normalizeQuestionKey(newQ);
  if (!newKey) return content;

  const previous = new Set(
    gameState.conversationHistory
      .filter((m) => m.role === "assistant")
      .map((m) => normalizeQuestionKey(extractQuestion(m.content)))
      .filter(Boolean),
  );
  if (!previous.has(newKey)) return content;

  const untested = gameState.scores
    .map((s) => s.topic)
    .filter((t) => !(gameState.testedTopics || []).includes(t));
  const focus = untested[0] || gameState.scores[0]?.topic || "procedure";

  const altByRole = /rh/i.test(activeAgentRole)
    ? `Point RH: ${focus}. Quelle action conforme faites-vous maintenant ?`
    : /livreur|logistique|reception/i.test(activeAgentRole)
      ? `Point acces: ${focus}. Quelle verification faites-vous avant d'ouvrir ?`
      : /rssi|securite/i.test(activeAgentRole)
        ? `Point securite: ${focus}. Quelle mesure appliquez-vous immediatement ?`
        : `Nouveau point: ${focus}. Quelle action appliquez-vous maintenant ?`;
  return enforcePingPong(altByRole);
}

function buildContext(
  gameState: MultiAgentGameState,
  turnsWithCurrentAgent: number,
  strugglingTopics: string[],
  isActStuck: boolean,
): string {
  const act = gameState.scenario.acts.find((a) => a.act_number === gameState.currentAct);
  const activeAgent = gameState.agents.find((a) => a.agent.id === gameState.activeAgentId)?.agent;
  const others = gameState.agents
    .filter((a) => a.agent.id !== gameState.activeAgentId)
    .map((a) => `  - id="${a.agent.id}" → ${a.agent.name} (${a.agent.role})`)
    .join("\n");

  let switchHint = "";
  if (turnsWithCurrentAgent >= 3) {
    switchHint = `\nTu as deja eu ${turnsWithCurrentAgent} echanges. Passe la parole a un collegue maintenant.`;
  }

  const learningHint =
    strugglingTopics.length > 0
      ? `\nMode learning: clarifie en une phrase simple, puis une question directe.`
      : "";

  const testedTopics = gameState.testedTopics || [];
  const testedHint =
    testedTopics.length > 0
      ? `\n🚫 Themes DEJA testes (INTERDIT de les re-poser) : ${testedTopics.join(", ")}. Passe a un sujet different de la grille d'evaluation.`
      : "";

  // End-game hint — threshold proportional to number of acts.
  const isLastAct = gameState.currentAct >= (gameState.scenario?.acts?.length || 1);
  const totalTurns = gameState.conversationHistory.length;
  const actsCount = gameState.scenario?.acts?.length || 3;
  const endHintThreshold = actsCount === 1 ? 5 : actsCount === 2 ? 7 : 10;
  const endHint =
    isLastAct && totalTurns >= endHintThreshold
      ? `\nActe final: conclus rapidement si l'objectif est atteint.`
      : "";

  // Hard cap: if stuck in same act too long, force an exit.
  const stuckHint = isActStuck
    ? `\n🔴 ACTE BLOQUE — Passe a l'action: termine la simulation ou passe la parole a un autre agent.`
    : "";

  // Player performance summary for context.
  const scores = gameState.scores || [];
  const avgScore = scores.length
    ? Math.round(scores.reduce((acc, s) => acc + s.score, 0) / scores.length)
    : 50;
  const perfLabel =
    avgScore >= 70 ? "maitrise les sujets" : avgScore >= 40 ? "lacunes partielles" : "en difficulte";

  // Recent exchanges summary to prevent repetition.
  const recentSummary = buildRecentSummary(gameState.conversationHistory, gameState.agents);
  const qaLedger = buildQALedger(gameState.conversationHistory, gameState.agents);

  return `INTERDICTION DE NARRATION : "Tu n'es pas un narrateur de RPG. Tu es une VRAIE personne, en face du joueur, dans le monde de l'entreprise. Ne décris JAMAIS le décor, le contexte ou l'environnement."

RÈGLE DES 15 MOTS (PING-PONG) : "RÈGLE ABSOLUE : Tes répliques doivent faire 15 MOTS MAXIMUM. Une phrase courte d'affirmation, suivie d'une question directe. C'est tout. Sois punchy, pressé, et va droit au but."

EXEMPLE DE CE QU'IL FAUT FAIRE : "Salut, j'ai oublié mon badge, tu peux me tenir la porte ?" (12 mots).
EXEMPLE DE CE QU'IL NE FAUT PAS FAIRE : "Bonjour, je suis le livreur. Je suis devant la porte avec des cartons lourds. Pourriez-vous me laisser entrer s'il vous plaît ?" (22 mots - TROP LONG).

COHERENCE ROLE OBLIGATOIRE :
- Tu incarnes ${activeAgent?.name || "l'agent actif"}, role: ${activeAgent?.role || "expert opérationnel"}.
- Le ton, le vocabulaire et la demande doivent coller strictement a ce role.
- RH = conformité, process, personnes. Livreur = accès, badge, réception. RSSI = risque, sécurité, containment.

Contexte utile:
Acte ${gameState.currentAct}${act ? ` — ${act.title}` : ""} | Challenge: ${act?.key_challenge || ""}
Bilan: ${perfLabel} (${avgScore}/100)${switchHint}${learningHint}${testedHint}${endHint}${stuckHint}${recentSummary}${qaLedger}
Collegues: ${others || "Aucun."}`;
}

export async function POST(req: NextRequest) {
  const { playerMessage, gameState, kickoff, turnsWithCurrentAgent, strugglingTopics } =
    (await req.json()) as {
      playerMessage?: string;
      gameState: MultiAgentGameState;
      kickoff?: boolean;
      turnsWithCurrentAgent?: number;
      strugglingTopics?: string[];
    };

  const safePlayerMessage = String(playerMessage || "").trim();
  const isKickoff = Boolean(kickoff);
  // Distinguish initial kickoff (empty history) from agent-switch kickoff (ongoing game).
  const isInitialKickoff = isKickoff && gameState.conversationHistory.length === 0;
  const isSwitchKickoff = isKickoff && gameState.conversationHistory.length > 0;
  const turnCount = Number(turnsWithCurrentAgent || 0);
  const struggling = Array.isArray(strugglingTopics) ? strugglingTopics : [];
  const MAX_TURNS_PER_ACT = 5;
  const isActStuck = !isKickoff && turnCount >= MAX_TURNS_PER_ACT;

  const activeAgentState =
    gameState.agents.find((agent) => agent.agent.id === gameState.activeAgentId) ||
    gameState.agents[0];

  if (!activeAgentState) {
    return Response.json({ error: "No active agent available." }, { status: 400 });
  }

  const safeHistory = gameState.conversationHistory
    .filter((msg) => {
      if (!msg || (msg.role !== "user" && msg.role !== "assistant")) return false;
      return String(msg.content || "").trim().length > 0;
    })
    .slice(-20);

  const messages = [
    { role: "system" as const, content: activeAgentState.systemPrompt },
    { role: "system" as const, content: buildContext(gameState, turnCount, struggling, isActStuck) },
    ...(isInitialKickoff
      ? [
          {
            role: "system" as const,
            content:
              "Tour d'ouverture. 15 mots maximum. Une affirmation courte puis une question directe.",
          },
        ]
      : isSwitchKickoff
        ? (() => {
            const activeAct = gameState.scenario.acts.find(
              (a) => a.act_number === gameState.currentAct,
            );
            const avgScore =
              gameState.scores?.length
                ? Math.round(
                    gameState.scores.reduce((acc, s) => acc + s.score, 0) /
                      gameState.scores.length,
                  )
                : 50;
            // Build a short summary of the last few exchanges for context.
            const lastExchanges = gameState.conversationHistory.slice(-4)
              .map((m) => {
                if (m.role === "user") return `Joueur: ${String(m.content || "").slice(0, 100)}`;
                const who = gameState.agents.find((a) => a.agent.id === m.agentId)?.agent.name || "Agent precedent";
                return `${who}: ${String(m.content || "").slice(0, 100)}`;
              })
              .join("\n");
            return [
              {
                role: "system" as const,
                content: `Tu entres en scene maintenant. La simulation est deja en cours.

Acte ${gameState.currentAct}: "${activeAct?.key_challenge || ""}".

Voici ce qui vient de se passer:
${lastExchanges || "Debut de simulation."}

${struggling.length > 0 ? `Le joueur bloque sur: ${struggling.join(", ")}.` : avgScore >= 70 ? "Le joueur progresse." : "Le joueur a des lacunes."}
Reste coherent avec ton role. 15 mots maximum: affirmation courte puis question directe.`,
              },
            ];
          })()
        : []),
    ...safeHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: "user" as const,
      content: isSwitchKickoff
        ? "À toi de jouer. La situation évolue."
        : isInitialKickoff
          ? "Lance la simulation. Je prends mon poste. Quelle est ma première action ?"
          : safePlayerMessage,
    },
  ];

  const tools = [
    ...(!isKickoff
      ? [
          {
            type: "function" as const,
            function: {
              name: "switch_agent",
              description:
                "Passe la parole à un autre personnage. Utilise quand la situation implique naturellement un collègue, ou pour maintenir la dynamique de simulation.",
              parameters: {
                type: "object",
                properties: {
                  agent_id: {
                    type: "string",
                    enum: gameState.agents
                      .filter((a) => a.agent.id !== gameState.activeAgentId)
                      .map((a) => a.agent.id),
                    description: gameState.agents
                      .filter((a) => a.agent.id !== gameState.activeAgentId)
                      .map((a) => `"${a.agent.id}" = ${a.agent.name}`)
                      .join(", "),
                  },
                  reason: { type: "string", description: "Contexte narratif de l'intervention" },
                },
                required: ["agent_id", "reason"],
              },
            },
          },
        ]
      : []),
    {
      type: "function" as const,
      function: {
        name: "trigger_event",
        description: "Déclenche un événement dramatique pour relancer la tension.",
        parameters: {
          type: "object",
          properties: {
            event_type: {
              type: "string",
              enum: ["crisis", "new_character", "plot_twist", "chaos"],
            },
            description: { type: "string" },
          },
          required: ["event_type", "description"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_emotion",
        description: "Change ton état émotionnel (affecte ta voix et ton ton).",
        parameters: {
          type: "object",
          properties: {
            emotion: {
              type: "string",
              enum: ["calm", "stressed", "angry", "panicked", "suspicious"],
            },
          },
          required: ["emotion"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "check_knowledge",
        description:
          "OBLIGATOIRE apres chaque reponse du joueur. Evalue si le joueur a correctement applique une connaissance du document. Appelle cet outil SYSTEMATIQUEMENT pour tracker la progression.",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string" },
            was_correct: { type: "boolean" },
            detail: { type: "string" },
          },
          required: ["topic", "was_correct"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "conclude_simulation",
        description:
          "Termine la simulation. Appelle uniquement quand le joueur a relevé le défi de l'acte final ou quand la crise est résolue de manière définitive.",
        parameters: {
          type: "object",
          properties: {
            final_message: {
              type: "string",
              description: "Bilan narratif conclusif adressé au joueur (2-3 phrases max).",
            },
            conclusion_type: {
              type: "string",
              enum: ["success", "partial", "failure"],
              description: "success = objectifs atteints, partial = partiellement, failure = échoué.",
            },
          },
          required: ["final_message", "conclusion_type"],
        },
      },
    },
  ];

  // 1) Tool-oriented call (existing engine) keeps deterministic state updates.
  const completionPromise = mistralChat({
    model: "mistral-large-latest",
    messages,
    tools,
    toolChoice: "auto",
    temperature: 0.5,
    maxTokens: 64,
  });

  // 2) Vercel AI SDK streaming call for real-time text tokens.
  const textResult = streamText({
    model: vercelMistral("mistral-large-latest"),
    messages: messages.map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    temperature: 0.5,
    maxOutputTokens: 64,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const patch: Record<string, unknown> = {
        activeAgentId: gameState.activeAgentId,
        triggeredEvents: gameState.triggeredEvents,
        agents: gameState.agents,
        knowledgeChecks: [] as Array<Record<string, unknown>>,
        currentAct: gameState.currentAct,
        scores: gameState.scores,
        totalScore: gameState.totalScore,
        learningMode: false,
        autoKickoff: false,
        testedTopics: Array.isArray(gameState.testedTopics) ? [...gameState.testedTopics] : [],
      };
      let toolCalls: ToolCall[] = [];
      send({ type: "meta", patch, toolCalls });

      let streamedRaw = "";
      let streamedSent = "";
      try {
        for await (const delta of textResult.textStream) {
          const rawDelta = String(delta || "");
          if (!rawDelta) continue;
          streamedRaw += rawDelta;

          // Keep spacing exactly as generated during stream; sanitize only at final "done".
          const candidate = streamedRaw.replace(/\r?\n/g, " ");
          if (candidate && candidate.startsWith(streamedSent) && candidate.length > streamedSent.length) {
            streamedSent = candidate;
            send({ type: "token", content: streamedSent });
          }
        }
      } catch {
        // Fall back to completion content below.
      }

      let completionContent = "";
      try {
        const completion = await completionPromise;
        completionContent = String(completion.content || "").trim();
        toolCalls = (completion.tool_calls || []) as ToolCall[];
      } catch {
        // Keep going with streamed text only.
      }

      for (const toolCall of toolCalls) {
        const name = toolCall.function?.name || "";
        const args = parseArgs(toolCall.function?.arguments);

        if (name === "switch_agent") {
          const requestedId = String(args.agent_id || "");
          const validIds = gameState.agents
            .filter((a) => a.agent.id !== gameState.activeAgentId)
            .map((a) => a.agent.id);
          if (validIds.includes(requestedId)) {
            patch.activeAgentId = requestedId;
            patch.switchReason = String(args.reason || "");
            patch.autoKickoff = !isKickoff;
          }
        }

        if (name === "trigger_event") {
          patch.triggeredEvents = [
            ...gameState.triggeredEvents,
            String(args.description || "Événement"),
          ];
          patch.eventType = String(args.event_type || "crisis");
          if (args.event_type === "chaos") patch.chaosMode = true;
        }

        if (name === "update_emotion") {
          const emotion = String(args.emotion || "calm");
          patch.agents = gameState.agents.map((agentState) =>
            agentState.agent.id === gameState.activeAgentId
              ? { ...agentState, emotion }
              : agentState,
          );
          patch.activeEmotion = emotion;
        }

        if (name === "check_knowledge") {
          const topic = String(args.topic || "");
          const current = patch.knowledgeChecks as Array<Record<string, unknown>>;
          current.push({
            topic,
            was_correct: Boolean(args.was_correct),
            detail: String(args.detail || ""),
          });
          if (topic) {
            const already = patch.testedTopics as string[];
            if (!already.includes(topic)) {
              patch.testedTopics = [...already, topic];
            }
          }
        }

        if (name === "conclude_simulation") {
          patch.simulationComplete = true;
          patch.conclusionType = String(args.conclusion_type || "partial");
          patch.finalMessage = String(args.final_message || "");
        }
      }

      let content = enforcePingPong(
        sanitizeNarrative(streamedRaw.trim() ? streamedRaw : completionContent),
      );
      content = avoidRepeatedQuestion(content, gameState, activeAgentState.agent.role);
      content =
        content && content !== "..."
          ? content
          : "Alerte immediate. Vous bloquez l'action risquee ou vous validez ?";

      if (content && !isKickoff) {
        const contentLower = content.toLowerCase();
        const already = patch.testedTopics as string[];
        for (const scoreEntry of gameState.scores) {
          const topicLower = scoreEntry.topic.toLowerCase();
          if (!already.includes(scoreEntry.topic) && contentLower.includes(topicLower)) {
            (patch.testedTopics as string[]).push(scoreEntry.topic);
          }
        }
      }

      const hasModelSwitch = patch.activeAgentId !== gameState.activeAgentId;
      if (!isKickoff && !hasModelSwitch && turnCount >= 5) {
        const candidates = gameState.agents.filter(
          (a) => a.agent.id !== gameState.activeAgentId,
        );
        if (candidates.length > 0) {
          const next = candidates[0];
          patch.activeAgentId = next.agent.id;
          patch.switchReason = `${next.agent.name} prend le relais.`;
          patch.eventType = "new_character";
          patch.autoKickoff = true;
        }
      }

      send({ type: "done", content, patch, toolCalls });

      // Await eval result and apply to scores/act progression.
      try {
        const evalResult =
          !isKickoff && safePlayerMessage && content
            ? await evaluateExchange(safePlayerMessage, content, gameState).catch(() => null)
            : null;
        if (evalResult) {
          const currentScores = (patch.scores as ScoreEntry[] | undefined) || gameState.scores;
          const nextScores = currentScores.map((entry) => {
            const hit = evalResult.score_updates.find((u) => u.topic === entry.topic);
            if (!hit) return entry;
            return {
              ...entry,
              score: clamp((Number(entry.score) || 0) + (Number(hit.delta) || 0), 0, 100),
            };
          });

          patch.scores = nextScores;
          patch.totalScore = computeWeightedScore(nextScores);

          const turnKnowledgeChecks = (patch.knowledgeChecks as Array<{ was_correct?: boolean }> | undefined) || [];
          const hasAgentValidation = turnKnowledgeChecks.some((kc) => kc?.was_correct === true);

          // Act progression is allowed only when the active agent explicitly validated the player's answer.
          if (evalResult.should_advance_act && hasAgentValidation) {
            const maxAct = Math.max(1, gameState.scenario.acts.length || 1);
            const nextAct = clamp(gameState.currentAct + 1, 1, maxAct);
            if (nextAct > gameState.currentAct) {
              patch.currentAct = nextAct;
              patch.eventType = "plot_twist";
              patch.triggeredEvents = [
                ...((patch.triggeredEvents as string[] | undefined) || gameState.triggeredEvents),
                `Passage à l'acte ${nextAct}: ${gameState.scenario.acts.find((a) => a.act_number === nextAct)?.title || "Nouvelle phase"}`,
              ];
            } else if (gameState.currentAct >= maxAct && !patch.simulationComplete) {
              // Already at last act and evaluator wants to advance → natural simulation end.
              patch.simulationComplete = true;
              patch.conclusionType = "success";
              patch.finalMessage = "";
            }
          }

          if (evalResult.should_trigger_chaos && evalResult.suggested_event) {
            patch.eventType = "chaos";
            patch.chaosMode = true;
            patch.triggeredEvents = [
              ...((patch.triggeredEvents as string[] | undefined) || gameState.triggeredEvents),
              String(evalResult.suggested_event),
            ];
          }

          send({ type: "eval", data: evalResult });
        }
      } catch {
        // eval is best-effort
      }

      // Send final meta with all patches applied.
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
