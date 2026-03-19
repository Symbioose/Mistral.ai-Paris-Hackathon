import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// ---------------------------------------------------------------------------
// OpenAI Client — typed helper for chat completions & streaming
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

export function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY environment variable.");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatCompletionMessageParam[];
  responseFormat?: { type: "json_object" };
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface StreamChatCompletionOptions {
  model: string;
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Retry logic (2 retries on 429 / 5xx)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return error.status === 429 || (error.status !== undefined && error.status >= 500);
  }
  // Retry on network errors (timeout, ECONNRESET, etc.)
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("econnreset") || msg.includes("fetch failed");
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES && isRetryable(error)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// chatCompletion — returns the assistant message (with optional tool_calls)
// ---------------------------------------------------------------------------

export async function chatCompletion(options: ChatCompletionOptions) {
  const client = getClient();

  const params: OpenAI.ChatCompletionCreateParams = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 800,
  };

  if (options.responseFormat && !options.tools) {
    params.response_format = options.responseFormat;
  }

  if (options.tools && options.tools.length > 0) {
    params.tools = options.tools.map((t) => ({
      type: "function" as const,
      function: t.function,
    }));
    if (options.toolChoice) {
      params.tool_choice = options.toolChoice;
    }
  }

  const result = await withRetry(async () => {
    const response = await client.chat.completions.create(params, {
      timeout: options.timeoutMs ?? 15000,
    });
    return response;
  });

  const message = result.choices?.[0]?.message;
  if (!message) {
    throw new Error("Invalid OpenAI response: missing message.");
  }

  return message;
}

// ---------------------------------------------------------------------------
// streamChatCompletion — returns a ReadableStream of text tokens
// ---------------------------------------------------------------------------

export function streamChatCompletion(options: StreamChatCompletionOptions): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const client = getClient();
        const stream = await withRetry(() =>
          client.chat.completions.create(
            {
              model: options.model,
              messages: options.messages,
              temperature: options.temperature ?? 0.5,
              max_tokens: options.maxTokens ?? 150,
              stream: true,
            },
            { timeout: options.timeoutMs ?? 30000 },
          ),
        );

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            controller.enqueue(delta);
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
