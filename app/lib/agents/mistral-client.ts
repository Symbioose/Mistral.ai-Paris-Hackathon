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

function getMistralApiKey(): string {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    throw new Error("Missing MISTRAL_API_KEY environment variable.");
  }
  return key;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function mistralChat(params: {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?:
    | "any"
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseFormat?: { type: "json_object" };
}) {
  const apiKey = getMistralApiKey();
  const body: Record<string, unknown> = {
    model: params.model || "mistral-large-latest",
    messages: params.messages,
    temperature: params.temperature ?? 0.4,
    max_tokens: params.maxTokens ?? 800,
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
    // Mistral supports: auto | any | none | function object
    body.tool_choice = params.toolChoice ?? "auto";
  }

  // JSON mode only when not using function tools.
  if (params.responseFormat && !params.tools) {
    body.response_format = params.responseFormat;
  }

  const res = await fetchWithTimeout(
    "https://api.mistral.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    params.timeoutMs ?? 15000,
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Mistral API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) {
    throw new Error("Invalid Mistral response: missing message.");
  }

  return message;
}
