import OpenAI from "openai";

// Conversation model reference, pinned on each session: "provider:model".
// Mistral is the default persona provider: first token in ~300 ms, which keeps the voice loop fluid.
// Measured with scripts/simulate-conversation.ts: ministral-8b is as fast but invents facts; Nemo stays faithful.
export const DEFAULT_CONVERSATION_MODEL = "mistral:open-mistral-nemo";

const clients = new Map<string, OpenAI>();

export function conversationModel() {
  return (
    process.env.SIMULATION_CONVERSATION_MODEL || DEFAULT_CONVERSATION_MODEL
  );
}

/** OpenAI-compatible client for a pinned "provider:model" reference (bare model names mean OpenAI). */
export function conversationClient(reference: string) {
  const split = reference.indexOf(":");
  const [provider, model] =
    split > 0
      ? [reference.slice(0, split), reference.slice(split + 1)]
      : ["openai", reference];
  const key =
    provider === "mistral"
      ? process.env.MISTRAL_API_KEY
      : process.env.OPENAI_API_KEY;
  if (!key) throw new Error(`Clé API manquante pour ${provider}`);
  let client = clients.get(provider);
  if (!client) {
    client = new OpenAI({
      apiKey: key,
      maxRetries: 2,
      ...(provider === "mistral"
        ? { baseURL: "https://api.mistral.ai/v1" }
        : {}),
    });
    clients.set(provider, client);
  }
  return { client, model, provider };
}
