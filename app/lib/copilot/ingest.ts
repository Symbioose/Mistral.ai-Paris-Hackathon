// app/lib/copilot/ingest.ts

import { createAdminClient } from "@/app/lib/supabase/admin";
import { chunkDocument } from "./chunking";
import { generateEmbeddings } from "./embeddings";
import { labelChunksWithLLM } from "./labeling";

/**
 * Ingest a training document: chunk it, embed it, store in document_chunks.
 * Deletes any existing chunks for this training first (handles re-publish).
 * Uses admin client (service role) to bypass RLS for writes.
 */
export async function ingestDocument(
  trainingId: string,
  documentText: string,
): Promise<{ chunkCount: number }> {
  const supabase = createAdminClient();

  // 1. Delete existing chunks for this training (idempotent re-ingestion)
  await supabase
    .from("document_chunks")
    .delete()
    .eq("training_id", trainingId);

  // 2. Chunk the document (chunks include sectionTitle from regex heading detection)
  let chunks = chunkDocument(documentText);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // 3. Check heading coverage — fall back to LLM labeling if <50% of chunks have a title
  const withTitle = chunks.filter((c) => c.sectionTitle !== null).length;
  const coverage = withTitle / chunks.length;

  if (coverage < 0.5) {
    console.log(`[ingest] Heading coverage ${Math.round(coverage * 100)}% — triggering LLM labeling for ${chunks.length} chunks`);
    chunks = await labelChunksWithLLM(chunks);
  } else {
    console.log(`[ingest] Heading coverage ${Math.round(coverage * 100)}% — using regex headings`);
  }

  // 4. Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  // 5. Insert chunks with embeddings
  const rows = chunks.map((chunk, i) => ({
    training_id: trainingId,
    chunk_index: chunk.index,
    content: chunk.content,
    start_char: chunk.startChar,
    end_char: chunk.endChar,
    section_title: chunk.sectionTitle,
    embedding: JSON.stringify(embeddings[i]),
  }));

  // 6. Insert in batches of 100 to avoid payload limits
  const INSERT_BATCH = 100;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) {
      throw new Error(`Failed to insert chunks batch ${i}: ${error.message}`);
    }
  }

  return { chunkCount: chunks.length };
}
