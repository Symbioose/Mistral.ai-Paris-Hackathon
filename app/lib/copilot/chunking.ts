// app/lib/copilot/chunking.ts

export interface TextChunk {
  index: number;
  content: string;
  startChar: number;
  endChar: number;
}

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

/**
 * Split text into overlapping chunks, respecting sentence boundaries.
 * Each chunk tracks its start/end character positions in the original text.
 */
export function chunkDocument(text: string): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    // If not at end of text, try to break at a sentence boundary
    if (end < text.length) {
      // Look backwards from `end` for a sentence-ending character
      const searchRegion = text.slice(start, end);
      const lastSentenceEnd = Math.max(
        searchRegion.lastIndexOf(". "),
        searchRegion.lastIndexOf(".\n"),
        searchRegion.lastIndexOf("! "),
        searchRegion.lastIndexOf("!\n"),
        searchRegion.lastIndexOf("? "),
        searchRegion.lastIndexOf("?\n"),
        searchRegion.lastIndexOf("\n\n"),
      );

      // Only use sentence boundary if it's in the latter half of the chunk
      // (avoid very short chunks)
      if (lastSentenceEnd > CHUNK_SIZE / 2) {
        // +1 to include the sentence-ending punctuation, +1 for the space
        end = start + lastSentenceEnd + 2;
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({
        index,
        content,
        startChar: start,
        endChar: end,
      });
      index++;
    }

    // Move forward by (end - start - overlap), but at least 1 char to avoid infinite loop
    const advance = Math.max(end - start - CHUNK_OVERLAP, 1);
    start = start + advance;
  }

  return chunks;
}
