// app/lib/copilot/embeddings.ts

import { getClient } from "@/app/lib/agents/openai-client";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 512; // safe batch size for API

/**
 * Generate embeddings for an array of text strings.
 * Handles batching automatically. Reuses the shared OpenAI client.
 * Returns vectors in the same order as inputs.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  const allEmbeddings: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    for (const item of response.data) {
      allEmbeddings[i + item.index] = item.embedding;
    }
  }

  return allEmbeddings;
}

/**
 * Generate a single embedding for a query string.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([query]);
  return embedding;
}
