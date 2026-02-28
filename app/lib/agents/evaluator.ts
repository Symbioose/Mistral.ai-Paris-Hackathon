import { MultiAgentGameState } from "@/app/lib/types";
import { mistralChat } from "@/app/lib/agents/mistral-client";

export interface EvaluationUpdate {
  score_updates: Array<{ topic: string; delta: number; reason: string }>;
  should_increase_difficulty: boolean;
  should_trigger_chaos: boolean;
  should_advance_act: boolean;
  suggested_event?: string;
}

function parseEvaluationToolCall(raw: unknown): EvaluationUpdate {
  const fallback: EvaluationUpdate = {
    score_updates: [],
    should_increase_difficulty: false,
    should_trigger_chaos: false,
    should_advance_act: false,
  };

  if (!raw || typeof raw !== "object") return fallback;
  const call = raw as { function?: { arguments?: string } };

  try {
    const parsed = JSON.parse(call.function?.arguments || "{}") as EvaluationUpdate;
    return {
      score_updates: Array.isArray(parsed.score_updates)
        ? parsed.score_updates.map((entry) => ({
            topic: String(entry.topic || ""),
            delta: Math.max(-20, Math.min(20, Number(entry.delta || 0))),
            reason: String(entry.reason || ""),
          }))
        : [],
      should_increase_difficulty: !!parsed.should_increase_difficulty,
      should_trigger_chaos: !!parsed.should_trigger_chaos,
      should_advance_act: !!parsed.should_advance_act,
      suggested_event: parsed.suggested_event ? String(parsed.suggested_event) : undefined,
    };
  } catch {
    return fallback;
  }
}

export async function evaluateExchange(
  playerMessage: string,
  agentResponse: string,
  gameState: MultiAgentGameState,
): Promise<EvaluationUpdate> {
  const message = await mistralChat({
    model: "mistral-small-latest",
    messages: [
      {
        role: "system",
        content: `Tu es un evaluateur silencieux. Tu observes un echange entre un joueur et un PNJ dans une simulation de formation.

Le document source couvre ces sujets : ${gameState.scores.map((s) => s.topic).join(", ")}
Scores actuels du joueur : ${JSON.stringify(gameState.scores)}
Acte actuel : ${gameState.currentAct}
Nombre d'echanges : ${gameState.conversationHistory.length}

Analyse cet echange et decide :
1. Si le joueur a demontre ou echoue sur un concept -> mets a jour le score
2. Si le joueur maitrise trop bien -> suggere d'augmenter la difficulte
3. Si on doit passer a l'acte suivant
4. Si un evenement chaos est pertinent

Tu DOIS appeler evaluation_update.`,
      },
      {
        role: "user",
        content: `Joueur: "${playerMessage}"\nAgent (${gameState.activeAgentId}): "${agentResponse}"`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "evaluation_update",
          parameters: {
            type: "object",
            properties: {
              score_updates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    topic: { type: "string" },
                    delta: { type: "number" },
                    reason: { type: "string" },
                  },
                },
              },
              should_increase_difficulty: { type: "boolean" },
              should_trigger_chaos: { type: "boolean" },
              should_advance_act: { type: "boolean" },
              suggested_event: { type: "string" },
            },
          },
        },
      },
    ],
    toolChoice: { type: "function", function: { name: "evaluation_update" } },
    temperature: 0.2,
    maxTokens: 450,
  });

  const toolCall = Array.isArray(message.tool_calls) ? message.tool_calls[0] : null;
  return parseEvaluationToolCall(toolCall);
}
