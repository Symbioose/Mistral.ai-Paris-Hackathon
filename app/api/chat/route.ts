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

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildContext(gameState: MultiAgentGameState): string {
  return `Contexte actuel: Acte ${gameState.currentAct}. Événements passés: ${gameState.triggeredEvents.join(", ") || "aucun"}. Score total: ${gameState.totalScore}%.`;
}

export async function POST(req: NextRequest) {
  const { playerMessage, gameState } = await req.json() as { playerMessage: string; gameState: MultiAgentGameState };
  const safePlayerMessage = String(playerMessage || "").trim();

  const activeAgentState = gameState.agents.find((agent) => agent.agent.id === gameState.activeAgentId) || gameState.agents[0];
  if (!activeAgentState) {
    return Response.json({ error: "No active agent available." }, { status: 400 });
  }

  const messages = [
    { role: "system" as const, content: activeAgentState.systemPrompt },
    { role: "system" as const, content: buildContext(gameState) },
    ...gameState.conversationHistory.slice(-20).map((msg) => ({ role: msg.role, content: msg.content })),
    { role: "user" as const, content: safePlayerMessage },
  ];

  const completion = await mistralChat({
    model: "mistral-large-latest",
    messages,
    tools: [
      {
        type: "function",
        function: {
          name: "switch_agent",
          description: "Passe la parole à un autre personnage.",
          parameters: {
            type: "object",
            properties: {
              agent_id: { type: "string" },
              reason: { type: "string" },
            },
            required: ["agent_id", "reason"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "trigger_event",
          description: "Déclenche un événement dramatique.",
          parameters: {
            type: "object",
            properties: {
              event_type: { type: "string", enum: ["crisis", "new_character", "plot_twist", "chaos"] },
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
          description: "Change l'état émotionnel du personnage actif.",
          parameters: {
            type: "object",
            properties: {
              emotion: { type: "string", enum: ["calm", "stressed", "angry", "panicked", "suspicious"] },
            },
            required: ["emotion"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "check_knowledge",
          description: "Vérifie si le joueur a correctement appliqué une connaissance du document.",
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
    temperature: 0.55,
    maxTokens: 550,
  });

  const content = String(completion.content || "").trim();
  const toolCalls = (completion.tool_calls || []) as ToolCall[];

  const patch: Record<string, unknown> = {
    activeAgentId: gameState.activeAgentId,
    triggeredEvents: gameState.triggeredEvents,
    agents: gameState.agents,
    knowledgeChecks: [] as Array<Record<string, unknown>>,
  };

  for (const toolCall of toolCalls) {
    const name = toolCall.function?.name || "";
    const args = parseArgs(toolCall.function?.arguments);

    if (name === "switch_agent") {
      patch.activeAgentId = String(args.agent_id || gameState.activeAgentId);
      patch.switchReason = String(args.reason || "");
    }

    if (name === "trigger_event") {
      patch.triggeredEvents = [...gameState.triggeredEvents, String(args.description || "Événement")];
      if (args.event_type === "chaos") {
        patch.chaosMode = true;
      }
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
      const current = patch.knowledgeChecks as Array<Record<string, unknown>>;
      current.push({
        topic: String(args.topic || ""),
        was_correct: Boolean(args.was_correct),
        detail: String(args.detail || ""),
      });
    }
  }

  // Fire-and-forget evaluator for asynchronous score updates.
  void evaluateExchange(safePlayerMessage, content, gameState).catch((error) => {
    console.error("[Evaluator] async error:", error);
  });

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
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      send({ type: "done", content: text, patch, toolCalls });
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
