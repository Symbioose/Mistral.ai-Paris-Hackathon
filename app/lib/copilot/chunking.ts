// app/lib/copilot/chunking.ts

export interface TextChunk {
  index: number;
  content: string;
  startChar: number;
  endChar: number;
  sectionTitle: string | null;
}

export interface DetectedHeading {
  charPosition: number;
  title: string;
}

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

/**
 * Detect section headings in a document using multiple regex patterns.
 *
 * Detected patterns:
 * - Markdown headings: `# Title`, `## Title`, `### Title`
 * - Numbered sections: `1. Title`, `1.1 Title`, `1.1.1 Title`, `A) Title`, `I. Title`
 * - ALL CAPS lines: min 4 chars, no end punctuation, followed by an empty line
 * - Short lines: <60 chars, no end punctuation, followed by double newline
 *
 * @returns Array of `{ charPosition, title }` sorted by ascending position.
 */
export function detectHeadings(text: string): DetectedHeading[] {
  const headings: DetectedHeading[] = [];
  const seen = new Set<number>();

  const addHeading = (charPosition: number, title: string) => {
    if (!seen.has(charPosition)) {
      seen.add(charPosition);
      headings.push({ charPosition, title: title.trim() });
    }
  };

  // 1. Markdown headings: # Title, ## Title, ### Title
  const markdownRe = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = markdownRe.exec(text)) !== null) {
    addHeading(m.index, m[2].trim());
  }

  // 2. Numbered sections: "1. Title", "1.1 Title", "1.1.1 Title"
  const numberedRe = /^(\d+(?:\.\d+)*\.?\s+)(.+)$/gm;
  while ((m = numberedRe.exec(text)) !== null) {
    addHeading(m.index, m[2].trim());
  }

  // 3. Letter sections: "A) Title", "B) Title", etc.
  const letterRe = /^([A-Z]\)\s+)(.+)$/gm;
  while ((m = letterRe.exec(text)) !== null) {
    addHeading(m.index, m[2].trim());
  }

  // 4. Roman numeral sections: "I. Title", "II. Title", "III. Title", etc.
  const romanRe = /^(M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))\.\s+(.+)$/gm;
  while ((m = romanRe.exec(text)) !== null) {
    // Ensure we actually matched a non-empty roman numeral
    if (m[1].length > 0) {
      addHeading(m.index, m[2].trim());
    }
  }

  // 5. ALL CAPS lines: min 4 chars, no trailing punctuation, followed by empty line
  const allCapsRe = /^([A-Z\s\d]{4,})(\n\n|\r\n\r\n)/gm;
  while ((m = allCapsRe.exec(text)) !== null) {
    const line = m[1].trim();
    // Exclude lines that end with sentence-terminating punctuation
    if (line.length >= 4 && !/[.!?,;:]$/.test(line)) {
      // Title-case for readability
      const titleCased = line
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      addHeading(m.index, titleCased);
    }
  }

  // 6. Short lines (<60 chars, no end punctuation) followed by double newline
  const shortLineRe = /^(.{1,59})(\n\n|\r\n\r\n)/gm;
  while ((m = shortLineRe.exec(text)) !== null) {
    const line = m[1].trim();
    if (line.length > 0 && !/[.!?,;:]$/.test(line)) {
      addHeading(m.index, line);
    }
  }

  return headings.sort((a, b) => a.charPosition - b.charPosition);
}

/**
 * Split text into overlapping chunks, respecting sentence boundaries.
 * Each chunk tracks its start/end character positions in the original text
 * and the section heading that precedes it (if any).
 */
export function chunkDocument(text: string): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const headings = detectHeadings(text);

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
      // Find the last heading whose charPosition <= chunk's startChar
      let sectionTitle: string | null = null;
      for (const heading of headings) {
        if (heading.charPosition <= start) {
          sectionTitle = heading.title;
        } else {
          break;
        }
      }

      chunks.push({
        index,
        content,
        startChar: start,
        endChar: end,
        sectionTitle,
      });
      index++;
    }

    // Move forward by (end - start - overlap), but at least 1 char to avoid infinite loop
    const advance = Math.max(end - start - CHUNK_OVERLAP, 1);
    start = start + advance;
  }

  return chunks;
}
