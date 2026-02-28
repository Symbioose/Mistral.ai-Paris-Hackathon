import { NextRequest } from "next/server";
import { evaluateExchange } from "@/app/lib/agents/evaluator";
import { MultiAgentGameState } from "@/app/lib/types";
import { mistralChat } from "@/app/lib/agents/mistral-client";

interface ToolCall {
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

function buildContext(
  gameState: MultiAgentGameState,
  turnsWithCurrentAgent: number,
  strugglingTopics: string[],
): string {
  const act = gameState.scenario.acts.find((a) => a.act_number === gameState.currentAct);
  const others = gameState.agents
    .filter((a) => a.agent.id !== gameState.activeAgentId)
    .map((a) => `  - id="${a.agent.id}" → ${a.agent.name} (${a.agent.role})`)
    .join("\n");

  let switchHint = "";
  if (turnsWithCurrentAgent >= 2) {
    switchHint = `\n🔴 OBLIGATOIRE: Tu parles depuis ${turnsWithCurrentAgent} tours consécutifs. Tu DOIS appeler switch_agent maintenant pour passer la parole à un collègue. Sans rotation, la simulation perd en dynamisme.`;
  } else if (turnsWithCurrentAgent >= 1) {
    switchHint = `\n⚠ Tu interviens depuis 1 tour. Si la situation peut impliquer un collègue, utilise switch_agent dès maintenant.`;
  }

  const learningHint =
    strugglingTopics.length > 0
      ? `\n📚 Le joueur bloque sur : ${strugglingTopics.join(", ")}. Guide-le naturellement — sans donner la réponse directement.`
      : "";

  const testedTopics = gameState.testedTopics || [];
  const testedHint =
    testedTopics.length > 0
      ? `\n🚫 Thèmes déjà testés — ne PAS répéter ces questions : ${testedTopics.join(", ")}. Teste autre chose ou approfondis un angle différent.`
      : "";

  return `## Contexte de simulation
Acte ${gameState.currentAct}${act ? ` — ${act.title}` : ""}: ${act?.key_challenge || "Appliquer les procédures."}
Événements: ${gameState.triggeredEvents.join(", ") || "aucun"}${switchHint}${learningHint}${testedHint}

## Autres personnages disponibles (switch_agent)
${others || "Aucun autre personnage disponible."}

## Règle absolue
Termine TOUJOURS par une question directe ou un défi concret au joueur.

## Format
- Dialogue direct, aucune parenthèse.
- Didascalies entre *asterisques* uniquement.`;
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
    { role: "system" as const, content: buildContext(gameState, turnCount, struggling) },
    ...(isInitialKickoff
      ? [
          {
            role: "system" as const,
            content:
              "Tour d'ouverture: initie la simulation immédiatement. Présente-toi brièvement, cadre la situation d'urgence, donne une priorité concrète, termine par une question d'action.",
          },
        ]
      : isSwitchKickoff
        ? [
            {
              role: "system" as const,
              content:
                "Tu entres en scène maintenant. La simulation est déjà en cours — ne recommence pas depuis zéro. Réagis à la situation actuelle, présente-toi en une phrase, puis pose immédiatement un défi ou une question concrète au joueur, dans la continuité de ce qui s'est passé.",
            },
          ]
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

  const completion = await mistralChat({
    model: "mistral-large-latest",
    messages,
    tools: [
      {
        type: "function",
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
      {
        type: "function",
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
        type: "function",
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
        type: "function",
        function: {
          name: "check_knowledge",
          description:
            "Vérifie si le joueur a correctement appliqué une connaissance du document.",
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
    ],
    toolChoice: "auto",
    temperature: 0.65,
    maxTokens: 450,
  });

  const content = String(completion.content || "").trim();
  const toolCalls = (completion.tool_calls || []) as ToolCall[];

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
        // Only auto-kickoff on non-kickoff turns to prevent loops
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
      // Record this topic so subsequent agents don't repeat the same question.
      if (topic) {
        const already = patch.testedTopics as string[];
        if (!already.includes(topic)) {
          patch.testedTopics = [...already, topic];
        }
      }
    }
  }

  // Deterministic fallback: force rotation after 2 turns with same agent.
  const hasModelSwitch = patch.activeAgentId !== gameState.activeAgentId;
  const shouldForceSwitchNow =
    !isKickoff && !hasModelSwitch && (struggling.length > 0 || turnCount >= 2);

  if (shouldForceSwitchNow) {
    const candidates = gameState.agents.filter(
      (a) => a.agent.id !== gameState.activeAgentId,
    );
    const helper =
      candidates.find((a) =>
        a.agent.knowledge_topics.some((topic) =>
          struggling.some((s) => topic.toLowerCase().includes(String(s).toLowerCase())),
        ),
      ) ||
      candidates.find((a) => a.agent.voice_type === "warm_female") ||
      candidates[0];

    if (helper) {
      patch.activeAgentId = helper.agent.id;
      patch.switchReason =
        struggling.length > 0
          ? `${helper.agent.name} prend la main en mode learning pour clarifier : ${struggling.join(", ")}.`
          : `${helper.agent.name} entre en scène pour relancer la simulation.`;
      patch.eventType = "new_character";
      patch.learningMode = struggling.length > 0;
      patch.autoKickoff = true;
      patch.triggeredEvents = [
        ...((patch.triggeredEvents as string[] | undefined) || gameState.triggeredEvents),
        struggling.length > 0
          ? `Mode learning: ${helper.agent.name} reformule la procédure.`
          : `${helper.agent.name} entre en scène.`,
      ];
    }
  }

  // Parallel evaluator — best-effort, awaited after streaming.
  const evalPromise =
    !isKickoff && safePlayerMessage && content
      ? evaluateExchange(safePlayerMessage, content, gameState).catch(() => null)
      : Promise.resolve(null);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ type: "meta", patch, toolCalls });

      const text = content || "...";
      const words = text.split(" ");
      let acc = "";
      for (const word of words) {
        acc = acc ? `${acc} ${word}` : word;
        send({ type: "token", content: acc });
        await new Promise((resolve) => setTimeout(resolve, 18));
      }

      send({ type: "done", content: text, patch, toolCalls });

      // Await eval result and apply to scores/act progression.
      try {
        const evalResult = await evalPromise;
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

          if (evalResult.should_advance_act) {
            const maxAct = Math.max(1, gameState.scenario.acts.length || 1);
            const nextAct = clamp(gameState.currentAct + 1, 1, maxAct);
            if (nextAct > gameState.currentAct) {
              patch.currentAct = nextAct;
              patch.eventType = "plot_twist";
              patch.triggeredEvents = [
                ...((patch.triggeredEvents as string[] | undefined) || gameState.triggeredEvents),
                `Passage à l'acte ${nextAct}: ${gameState.scenario.acts.find((a) => a.act_number === nextAct)?.title || "Nouvelle phase"}`,
              ];
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

          // Secondary switch check based on eval result.
          const alreadySwitched = patch.activeAgentId !== gameState.activeAgentId;
          if (!alreadySwitched && !isKickoff && (struggling.length > 0 || turnCount >= 2)) {
            const candidates = gameState.agents.filter(
              (a) => a.agent.id !== gameState.activeAgentId,
            );
            const helper =
              candidates.find((a) =>
                a.agent.knowledge_topics.some((topic) =>
                  struggling.some((s) =>
                    topic.toLowerCase().includes(String(s).toLowerCase()),
                  ),
                ),
              ) ||
              candidates.find((a) => a.agent.voice_type === "warm_female") ||
              candidates[0];

            if (helper) {
              patch.activeAgentId = helper.agent.id;
              patch.switchReason =
                struggling.length > 0
                  ? `${helper.agent.name} prend la main pour clarifier : ${struggling.join(", ")}.`
                  : `${helper.agent.name} entre en scène pour faire avancer la simulation.`;
              patch.eventType = "new_character";
              patch.learningMode = struggling.length > 0;
              patch.autoKickoff = true;
              patch.triggeredEvents = [
                ...((patch.triggeredEvents as string[] | undefined) || gameState.triggeredEvents),
                `${helper.agent.name} intervient pour la suite.`,
              ];
            }
          }

          send({ type: "eval", data: evalResult });
          send({ type: "meta", patch, toolCalls });
        }
      } catch {
        // eval is best-effort
      }

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
