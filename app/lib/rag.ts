export interface RagChunk {
  id: string;
  text: string;
  start: number;
  end: number;
  termFreq: Record<string, number>;
  length: number;
}

export interface RagIndex {
  chunks: RagChunk[];
  docFreq: Record<string, number>;
  avgChunkLength: number;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
}

const STOP_WORDS = new Set([
  "a", "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "elle", "en", "et", "eux", "il", "je", "la", "le", "les", "leur", "lui", "ma", "mais", "me", "meme", "mes", "moi", "mon", "ne", "nos", "notre", "nous", "on", "ou", "par", "pas", "pour", "qu", "que", "qui", "sa", "se", "ses", "son", "sur", "ta", "te", "tes", "toi", "ton", "tu", "un", "une", "vos", "votre", "vous",
]);

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function buildTermFreq(tokens: string[]): Record<string, number> {
  return tokens.reduce<Record<string, number>>((acc, token) => {
    acc[token] = (acc[token] || 0) + 1;
    return acc;
  }, {});
}

function splitIntoChunks(text: string, chunkSize = 750, overlap = 120): Array<{ start: number; end: number; text: string }> {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const chunks: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;

  while (cursor < clean.length) {
    let end = Math.min(clean.length, cursor + chunkSize);

    if (end < clean.length) {
      const breakAt = clean.lastIndexOf("\n", end);
      if (breakAt > cursor + Math.floor(chunkSize * 0.45)) {
        end = breakAt;
      }
    }

    const chunkText = clean.slice(cursor, end).trim();
    if (chunkText.length > 40) {
      chunks.push({ start: cursor, end, text: chunkText });
    }

    if (end >= clean.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
}

export function buildRagIndex(text: string): RagIndex {
  if (!text || !text.trim()) {
    return { chunks: [], docFreq: {}, avgChunkLength: 1 };
  }

  const rawChunks = splitIntoChunks(text);

  const chunks: RagChunk[] = rawChunks.map((chunk, index) => {
    const tokens = tokenize(chunk.text);
    return {
      id: `chunk_${index + 1}`,
      text: chunk.text,
      start: chunk.start,
      end: chunk.end,
      termFreq: buildTermFreq(tokens),
      length: Math.max(tokens.length, 1),
    };
  });

  const docFreq: Record<string, number> = {};
  for (const chunk of chunks) {
    const seen = new Set<string>();
    for (const token of Object.keys(chunk.termFreq)) {
      if (!seen.has(token)) {
        docFreq[token] = (docFreq[token] || 0) + 1;
        seen.add(token);
      }
    }
  }

  const avgChunkLength = chunks.length > 0
    ? chunks.reduce((acc, c) => acc + c.length, 0) / chunks.length
    : 1;

  return {
    chunks,
    docFreq,
    avgChunkLength,
  };
}

function bm25Score(queryTokens: string[], chunk: RagChunk, index: RagIndex): number {
  const k1 = 1.2;
  const b = 0.75;
  const n = Math.max(index.chunks.length, 1);

  let score = 0;
  for (const token of queryTokens) {
    const tf = chunk.termFreq[token] || 0;
    if (tf === 0) continue;

    const df = index.docFreq[token] || 0;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    const denom = tf + k1 * (1 - b + b * (chunk.length / index.avgChunkLength));
    score += idf * ((tf * (k1 + 1)) / denom);
  }

  return score;
}

export function retrieveRelevantChunks(index: RagIndex, query: string, topK = 4): RetrievedChunk[] {
  if (index.chunks.length === 0) return [];

  const queryTokens = tokenize(query);

  // If query produces no tokens (empty, all stop-words, single short word), return first chunks as fallback
  if (queryTokens.length === 0) {
    return index.chunks.slice(0, Math.max(topK, 1)).map((chunk) => ({
      id: chunk.id,
      text: chunk.text,
      score: 0,
    }));
  }

  const scored = index.chunks
    .map((chunk) => ({ chunk, score: bm25Score(queryTokens, chunk, index) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(topK, 1));

  const positive = scored.filter((entry) => entry.score > 0);
  const fallback = positive.length > 0 ? positive : scored;

  return fallback.map(({ chunk, score }) => ({
    id: chunk.id,
    text: chunk.text,
    score: Number(score.toFixed(4)),
  }));
}

export function formatRetrievedContext(chunks: RetrievedChunk[], maxChars = 1800): string {
  if (chunks.length === 0) return "";

  let used = 0;
  const lines: string[] = [];

  for (const chunk of chunks) {
    const clean = chunk.text.replace(/\s+/g, " ").trim();
    const line = `[${chunk.id}] ${clean}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }

  return lines.join("\n");
}
