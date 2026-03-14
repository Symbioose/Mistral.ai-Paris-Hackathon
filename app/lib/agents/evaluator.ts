import { MultiAgentGameState } from "@/app/lib/types";
import { chatCompletion } from "@/app/lib/agents/openai-client";

const EVALUATION_MODEL = "gpt-4.1-mini";

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
  const message = await chatCompletion({
    model: EVALUATION_MODEL,
    messages: [
      {
        role: "system",
        content: `Tu es un evaluateur silencieux. Tu observes un echange entre un joueur et un PNJ dans une simulation de formation.

Sujets du document : ${gameState.scores.map((s) => `${s.topic} (score: ${s.score})`).join(", ")}
Acte actuel : ${gameState.currentAct} / ${gameState.scenario?.acts?.length || 3}
Nombre total d'echanges : ${gameState.conversationHistory.length}
Sujets deja testes : ${(gameState.testedTopics || []).join(", ") || "aucun"}

REGLES DE PROGRESSION D'ACTE (should_advance_act):
- Mets should_advance_act=true si le joueur a eu au moins 4 echanges dans l'acte ET le score moyen est >= 60
- Mets should_advance_act=true si le joueur a eu au moins 6 echanges dans l'acte (meme avec score < 60)
- Le but est d'avancer: la simulation ne doit PAS rester bloquee sur le meme acte

REGLES DE SCORE (score_updates):
- delta entre -10 et +10 par sujet
- Si le joueur repond correctement: delta positif (+5 a +10)
- Si le joueur se trompe: delta negatif (-5 a -10)

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
    maxTokens: 600,
  });

  const toolCall = Array.isArray(message.tool_calls) ? message.tool_calls[0] : null;
  return parseEvaluationToolCall(toolCall);
}
