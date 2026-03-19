// app/lib/copilot/labeling.ts

import { chatCompletion } from "@/app/lib/agents/openai-client";
import type { TextChunk } from "./chunking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelingResponse {
  themes: string[];
  assignments: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the first 2 sentences from a string (used to trim chunk content
 * when there are many chunks, to avoid exceeding the context window).
 */
function firstTwoSentences(text: string): string {
  const matches = text.match(/[^.!?]*[.!?]+/g);
  if (!matches || matches.length === 0) return text.slice(0, 300);
  return matches.slice(0, 2).join(" ").trim();
}

function isValidLabelingResponse(obj: unknown): obj is LabelingResponse {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.themes) || o.themes.length < 1) return false;
  if (typeof o.assignments !== "object" || o.assignments === null) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Label chunks with a consistent global taxonomy using a single LLM call.
 *
 * Strategy:
 * 1. Ask the model to derive 5-8 global themes from the entire document.
 * 2. Ask the model to assign each chunk to exactly one of those themes.
 *
 * This prevents duplicate/variant labels (e.g. "Remboursement" vs
 * "Remboursements") that occur when chunks are labeled independently.
 *
 * Falls back silently (returns chunks unchanged) on any error or if the
 * response cannot be validated.
 *
 * @param chunks - Array of `TextChunk` objects to label.
 * @returns A new array of `TextChunk` objects with `sectionTitle` populated
 *          from the LLM taxonomy wherever a valid assignment exists.
 */
export async function labelChunksWithLLM(
  chunks: TextChunk[],
): Promise<TextChunk[]> {
  if (chunks.length === 0) return chunks;

  // When there are many chunks, trim each to the first 2 sentences to avoid
  // blowing the context window while preserving enough signal for labeling.
  const trimContent = chunks.length > 200;

  const chunkLines = chunks
    .map((c) => {
      const text = trimContent ? firstTwoSentences(c.content) : c.content;
      return `[${c.index}] ${text}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a document analyst. Your job is to label sections of a document with a consistent, minimal set of themes.

Rules:
- Extract exactly 5 to 8 global themes that together cover all content in the document.
- Themes must be concise (1-4 words), distinct, and non-redundant.
- Assign every chunk to exactly one theme from your list.
- Do not invent themes on the fly — only use themes from the "themes" list you define.
- Respond ONLY with valid JSON matching this exact schema:
{
  "themes": ["Theme A", "Theme B", ...],
  "assignments": { "0": "Theme A", "1": "Theme B", ... }
}`;

  const userPrompt = `Here are the document chunks (index followed by content):\n\n${chunkLines}\n\nRespond with the JSON schema described.`;

  let raw: string;
  try {
    const message = await chatCompletion({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.2,
      maxTokens: 2048,
    });

    raw = message.content ?? "";
  } catch (err) {
    console.warn(
      "[labelChunksWithLLM] LLM call failed — returning chunks unchanged.",
      err,
    );
    return chunks;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      "[labelChunksWithLLM] Could not parse LLM response as JSON — returning chunks unchanged.",
      raw,
    );
    return chunks;
  }

  if (!isValidLabelingResponse(parsed)) {
    console.warn(
      "[labelChunksWithLLM] LLM response does not match expected schema — returning chunks unchanged.",
      parsed,
    );
    return chunks;
  }

  const { themes, assignments } = parsed;
  const themeSet = new Set(themes);

  return chunks.map((chunk) => {
    const assigned = assignments[String(chunk.index)];
    if (typeof assigned === "string" && themeSet.has(assigned)) {
      return { ...chunk, sectionTitle: assigned };
    }
    // Assignment missing or references an unknown theme — leave title as-is.
    return chunk;
  });
}
