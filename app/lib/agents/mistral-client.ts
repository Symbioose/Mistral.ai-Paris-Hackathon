import OpenAI from "openai";

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

// AWS Bedrock model names (via OpenAI-compatible endpoint)
const MODEL_LARGE = "mistral.mistral-large-3-675b-instruct";
const MODEL_SMALL = "mistral.magistral-small-2509";

function resolveModel(model: string): string {
  if (model === "mistral-small-latest") return MODEL_SMALL;
  return MODEL_LARGE;
}

// Map Mistral tool_choice "any" → OpenAI "required"
function resolveToolChoice(
  toolChoice: "any" | "auto" | "none" | { type: "function"; function: { name: string } } | undefined,
): OpenAI.ChatCompletionToolChoiceOption | undefined {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "any") return "required";
  return toolChoice as OpenAI.ChatCompletionToolChoiceOption;
}

export const bedrockClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function mistralChat(params: {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "any" | "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseFormat?: { type: "json_object" };
}) {
  const body: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: resolveModel(params.model || "mistral-large-latest"),
    messages: params.messages as OpenAI.ChatCompletionMessageParam[],
    temperature: params.temperature ?? 0.4,
    max_tokens: params.maxTokens ?? 800,
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools as OpenAI.ChatCompletionTool[];
    body.tool_choice = resolveToolChoice(params.toolChoice);
  }

  if (params.responseFormat && !params.tools) {
    body.response_format = params.responseFormat;
  }

  const completion = await bedrockClient.chat.completions.create(body, {
    timeout: params.timeoutMs ?? 15000,
  });

  const message = completion.choices[0]?.message;
  if (!message) {
    throw new Error("Invalid response: missing message.");
  }

  return message;
}
