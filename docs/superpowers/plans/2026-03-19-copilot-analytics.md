# Copilot Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give managers a ranked view of which document sections students ask the most questions about in the Copilot, with anonymous query logging and zero extra LLM calls at runtime.

**Architecture:** Hybrid section labeling at ingestion (regex headings + LLM taxonomy fallback), anonymous query logging via `after()` in the copilot API, aggregation API + tabbed UI in the existing analytics modal.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), OpenAI `gpt-4.1-mini`, `framer-motion`, inline styles with `var(--corp-*)` design tokens.

**Spec:** `docs/superpowers/specs/2026-03-19-copilot-analytics-design.md`

**No test framework** — this is a hackathon project. Verification is done via manual checks and `npx tsc --noEmit`.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/lib/copilot/chunking.ts` | **Modify** — add `sectionTitle` to `TextChunk`, add `detectHeadings()` + `assignHeadingsToChunks()` |
| `app/lib/copilot/labeling.ts` | **Create** — LLM taxonomy extraction + chunk assignment (called by ingest when regex coverage <50%) |
| `app/lib/copilot/ingest.ts` | **Modify** — orchestrate heading detection → LLM fallback → store `section_title` |
| `app/api/copilot/[trainingId]/route.ts` | **Modify** — add `after()` insert into `copilot_queries` |
| `app/api/trainings/[id]/copilot-analytics/route.ts` | **Create** — GET endpoint, aggregate queries by section |
| `app/components/dashboard/TrainingAnalyticsModal.tsx` | **Modify** — add tab system + Copilot analytics tab |

---

### Task 1: Database Migration

**Files:** Supabase MCP (remote migration)

- [ ] **Step 1: Add `section_title` column to `document_chunks`**

```sql
ALTER TABLE document_chunks ADD COLUMN section_title TEXT;
```

- [ ] **Step 2: Create `copilot_queries` table**

```sql
CREATE TABLE copilot_queries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id   UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  query_text    TEXT NOT NULL,
  section_title TEXT,
  chunk_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_copilot_queries_training ON copilot_queries(training_id);
CREATE INDEX idx_copilot_queries_section ON copilot_queries(training_id, section_title);
```

- [ ] **Step 3: Add RLS policies for `copilot_queries`**

```sql
ALTER TABLE copilot_queries ENABLE ROW LEVEL SECURITY;

-- INSERT: authenticated users enrolled in the training OR training manager
CREATE POLICY "copilot_queries_insert" ON copilot_queries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM enrollments WHERE enrollments.training_id = copilot_queries.training_id AND enrollments.student_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM trainings WHERE trainings.id = copilot_queries.training_id AND trainings.manager_id = auth.uid()
    )
  );

-- SELECT: only the manager who owns the training
CREATE POLICY "copilot_queries_select" ON copilot_queries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trainings WHERE trainings.id = copilot_queries.training_id AND trainings.manager_id = auth.uid()
    )
  );
```

- [ ] **Step 4: Verify migration**

Run via MCP: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'copilot_queries';`
Run via MCP: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'section_title';`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analytics): add copilot_queries table and section_title column via Supabase migration"
```

---

### Task 2: Heading Detection in Chunking

**Files:**
- Modify: `app/lib/copilot/chunking.ts`

- [ ] **Step 1: Add `sectionTitle` to `TextChunk` interface**

In `app/lib/copilot/chunking.ts`, update the `TextChunk` interface:

```typescript
export interface TextChunk {
  index: number;
  content: string;
  startChar: number;
  endChar: number;
  sectionTitle: string | null;
}
```

- [ ] **Step 2: Add `detectHeadings()` function**

Add above `chunkDocument()`:

```typescript
interface DetectedHeading {
  charPosition: number;
  title: string;
}

/**
 * Detect section headings in document text using regex patterns.
 * Returns headings sorted by character position.
 */
export function detectHeadings(text: string): DetectedHeading[] {
  const headings: DetectedHeading[] = [];
  const lines = text.split("\n");
  let charPos = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length > 0 && trimmed.length < 80) {
      let title: string | null = null;

      // Markdown headings: # Title, ## Title, ### Title
      const mdMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
      if (mdMatch) title = mdMatch[1].trim();

      // Numbered sections: 1. Title, 1.1 Title, 1.1.1 Title, A) Title, I. Title
      if (!title) {
        const numMatch = trimmed.match(/^(?:\d+\.)+\s*(.+)$/) ||
                          trimmed.match(/^[A-Z]\)\s+(.+)$/) ||
                          trimmed.match(/^[IVXLC]+\.\s+(.+)$/);
        if (numMatch) title = numMatch[1].trim();
      }

      // ALL CAPS lines (min 4 chars, no punctuation at end, followed by empty line or next line)
      if (!title && trimmed.length >= 4 && trimmed === trimmed.toUpperCase() &&
          /^[A-ZÀ-ÿ0-9\s\-':]+$/.test(trimmed) && !/[.!?]$/.test(trimmed)) {
        const nextLine = lines[i + 1]?.trim() ?? "";
        if (nextLine === "" || nextLine.length > 80) {
          // Title-case the ALL CAPS heading for readability
          title = trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
        }
      }

      // Short line followed by double newline (heuristic for underline-style headings)
      if (!title && trimmed.length >= 4 && trimmed.length < 60 && !/[.!?,;:]$/.test(trimmed)) {
        const nextLine = lines[i + 1]?.trim() ?? "";
        const afterNext = lines[i + 2]?.trim() ?? "";
        if (nextLine === "" && afterNext === "") {
          title = trimmed;
        }
      }

      if (title && title.length >= 3) {
        headings.push({ charPosition: charPos, title });
      }
    }

    charPos += line.length + 1; // +1 for \n
  }

  return headings;
}
```

- [ ] **Step 3: Assign headings to chunks in `chunkDocument()`**

Replace the chunk creation in the while loop to assign section titles. Update `chunkDocument()`:

```typescript
export function chunkDocument(text: string): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  // Detect headings first
  const headings = detectHeadings(text);

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    if (end < text.length) {
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

      if (lastSentenceEnd > CHUNK_SIZE / 2) {
        end = start + lastSentenceEnd + 2;
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      // Find the last heading that starts before or at this chunk's start position
      let sectionTitle: string | null = null;
      for (let h = headings.length - 1; h >= 0; h--) {
        if (headings[h].charPosition <= start) {
          sectionTitle = headings[h].title;
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

    const advance = Math.max(end - start - CHUNK_OVERLAP, 1);
    start = start + advance;
  }

  return chunks;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `chunking.ts`

- [ ] **Step 5: Commit**

```bash
git add app/lib/copilot/chunking.ts
git commit -m "feat(analytics): add heading detection and sectionTitle to TextChunk"
```

---

### Task 3: LLM Fallback Labeling

**Files:**
- Create: `app/lib/copilot/labeling.ts`

- [ ] **Step 1: Create `labeling.ts` with taxonomy extraction**

Create `app/lib/copilot/labeling.ts`:

```typescript
// app/lib/copilot/labeling.ts

import { chatCompletion } from "@/app/lib/agents/openai-client";
import type { TextChunk } from "./chunking";

const LABELING_MODEL = "gpt-4.1-mini";

interface TaxonomyResult {
  themes: string[];
  assignments: Record<string, string>;
}

/**
 * Use LLM to generate a strict taxonomy of 5-8 themes for the document,
 * then assign each chunk to exactly one theme.
 * Called only when regex heading detection covers <50% of chunks.
 */
export async function labelChunksWithLLM(
  chunks: TextChunk[],
): Promise<TextChunk[]> {
  if (chunks.length === 0) return chunks;

  // Build chunk summaries — first 2 sentences per chunk for large docs, full content otherwise
  const summaries = chunks.map((c) => {
    if (chunks.length > 200) {
      // Extract first 2 sentences
      const sentences = c.content.match(/[^.!?]+[.!?]+/g) || [c.content.slice(0, 150)];
      return `[${c.index}] ${sentences.slice(0, 2).join(" ").trim()}`;
    }
    return `[${c.index}] ${c.content}`;
  });

  const prompt = `Tu es un expert en analyse documentaire. Voici les extraits numerotes d'un document de formation professionnelle.

EXTRAITS:
${summaries.join("\n\n")}

INSTRUCTIONS:
1. Identifie entre 5 et 8 themes globaux qui couvrent l'ensemble du document. Chaque theme doit etre un label court (3-5 mots max).
2. Assigne chaque extrait (par son numero) a EXACTEMENT un des themes de ta liste. Utilise les labels EXACTEMENT comme tu les as definis (pas de variation).

Reponds en JSON strict:
{
  "themes": ["Theme 1", "Theme 2", ...],
  "assignments": { "0": "Theme 1", "1": "Theme 2", ... }
}`;

  try {
    const response = await chatCompletion({
      model: LABELING_MODEL,
      messages: [
        { role: "system", content: "Tu es un assistant d'analyse documentaire. Reponds uniquement en JSON valide." },
        { role: "user", content: prompt },
      ],
      responseFormat: { type: "json_object" },
      temperature: 0.1,
      maxTokens: 4000,
      timeoutMs: 30000,
    });

    const raw = String(response.content || "").trim();
    const result = JSON.parse(raw) as TaxonomyResult;

    if (!result.themes || !Array.isArray(result.themes) || !result.assignments) {
      console.warn("[labeling] Invalid LLM response structure, skipping labeling");
      return chunks;
    }

    // Validate that all assignments reference themes from the list
    const themeSet = new Set(result.themes);

    return chunks.map((chunk) => {
      const assigned = result.assignments[String(chunk.index)];
      if (assigned && themeSet.has(assigned)) {
        return { ...chunk, sectionTitle: assigned };
      }
      // Fallback: if the LLM missed this chunk, assign to closest theme or leave null
      return chunk;
    });
  } catch (err) {
    console.error("[labeling] LLM labeling failed, chunks will have no section titles:", err);
    return chunks;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/lib/copilot/labeling.ts
git commit -m "feat(analytics): add LLM taxonomy labeling for chunks without headings"
```

---

### Task 4: Update Ingestion Pipeline

**Files:**
- Modify: `app/lib/copilot/ingest.ts`

- [ ] **Step 1: Update `ingestDocument()` to use heading detection + LLM fallback**

Replace the contents of `app/lib/copilot/ingest.ts`:

```typescript
// app/lib/copilot/ingest.ts

import { createAdminClient } from "@/app/lib/supabase/admin";
import { chunkDocument } from "./chunking";
import { generateEmbeddings } from "./embeddings";
import { labelChunksWithLLM } from "./labeling";

/**
 * Ingest a training document: chunk it, label sections, embed it, store in document_chunks.
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

  // 2. Chunk the document (includes regex heading detection)
  let chunks = chunkDocument(documentText);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // 3. Check heading coverage — if <50% have a sectionTitle, use LLM fallback
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

  // 5. Insert chunks with embeddings and section titles
  const rows = chunks.map((chunk, i) => ({
    training_id: trainingId,
    chunk_index: chunk.index,
    content: chunk.content,
    start_char: chunk.startChar,
    end_char: chunk.endChar,
    section_title: chunk.sectionTitle,
    embedding: JSON.stringify(embeddings[i]),
  }));

  // Insert in batches of 100 to avoid payload limits
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/lib/copilot/ingest.ts
git commit -m "feat(analytics): integrate heading detection + LLM fallback in ingestion pipeline"
```

---

### Task 5: Anonymous Query Logging in Copilot API

**Files:**
- Modify: `app/api/copilot/[trainingId]/route.ts`

- [ ] **Step 1: Add `after` import**

Add at the top of `app/api/copilot/[trainingId]/route.ts`:

```typescript
import { after } from "next/server";
```

- [ ] **Step 2: Add admin client import**

Add at the top of the file:

```typescript
import { createAdminClient } from "@/app/lib/supabase/admin";
```

- [ ] **Step 3: Add anonymous logging after `match_chunks`**

After the `match_chunks` RPC call and the early return for empty chunks (after line 97), add the logging block before building the LLM messages.

**Important:** Use `createAdminClient()` (service role) inside `after()`, NOT the request-scoped `supabase` client. The request context (cookies/headers) may no longer be available when `after()` runs after the response is sent.

```typescript
  // Log query anonymously for Copilot Analytics (fire-and-forget via after())
  after(async () => {
    try {
      const adminDb = createAdminClient();
      // Resolve section_title from the top-1 chunk (highest similarity)
      const topChunk = chunks[0];
      const { data: chunkMeta } = await adminDb
        .from("document_chunks")
        .select("section_title")
        .eq("training_id", trainingId)
        .eq("chunk_index", topChunk.chunk_index)
        .single();

      await adminDb.from("copilot_queries").insert({
        training_id: trainingId,
        query_text: safeMessage,
        section_title: chunkMeta?.section_title || null,
        chunk_ids: chunks.map((c: { chunk_index: number }) => c.chunk_index),
      });
    } catch (err) {
      console.error("[copilot] failed to log query:", err);
    }
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add app/api/copilot/[trainingId]/route.ts
git commit -m "feat(analytics): add anonymous copilot query logging via after()"
```

---

### Task 6: Copilot Analytics API Endpoint

**Files:**
- Create: `app/api/trainings/[id]/copilot-analytics/route.ts`

- [ ] **Step 1: Create the analytics endpoint**

Create `app/api/trainings/[id]/copilot-analytics/route.ts`:

```typescript
import { createClient } from "@/app/lib/supabase/server";
import { NextResponse } from "next/server";

// GET /api/trainings/[id]/copilot-analytics — copilot query analytics (manager only)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Verify ownership
  const { data: training, error: trainingError } = await supabase
    .from("trainings")
    .select("id, manager_id")
    .eq("id", id)
    .single();

  if (trainingError || !training) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
  }

  if (training.manager_id !== user.id) {
    return NextResponse.json({ error: "Accès interdit" }, { status: 403 });
  }

  // Fetch all copilot queries for this training
  const { data: queries, error: queryError } = await supabase
    .from("copilot_queries")
    .select("id, query_text, section_title, created_at")
    .eq("training_id", id)
    .order("created_at", { ascending: false });

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const allQueries = queries || [];

  // Aggregate by section_title
  const sectionCounts = new Map<string, number>();
  for (const q of allQueries) {
    const title = q.section_title || "Non classé";
    sectionCounts.set(title, (sectionCounts.get(title) || 0) + 1);
  }

  const totalQueries = allQueries.length;
  const sections = Array.from(sectionCounts.entries())
    .map(([title, count]) => ({
      title,
      queryCount: count,
      percentage: totalQueries > 0 ? Math.round((count / totalQueries) * 100) : 0,
    }))
    .sort((a, b) => b.queryCount - a.queryCount);

  // Recent queries (last 20)
  const recentQueries = allQueries.slice(0, 20).map((q) => ({
    text: q.query_text,
    sectionTitle: q.section_title || "Non classé",
    createdAt: q.created_at,
  }));

  return NextResponse.json({
    sections,
    totalQueries,
    recentQueries,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/api/trainings/[id]/copilot-analytics/route.ts
git commit -m "feat(analytics): add GET /api/trainings/[id]/copilot-analytics endpoint"
```

---

### Task 7: UI — Tab System + Copilot Analytics Tab

**Files:**
- Modify: `app/components/dashboard/TrainingAnalyticsModal.tsx`

This is the largest task. The existing modal (474 lines) shows enrollment analytics. We add a tab bar ("Apprenants" | "Copilot") and a new Copilot tab with stats cards, ranked section bars, and recent queries.

- [ ] **Step 1: Add state and data fetching for copilot analytics**

At the top of `TrainingAnalyticsModal`, add interfaces and state:

```typescript
interface CopilotSection {
  title: string;
  queryCount: number;
  percentage: number;
}

interface CopilotQuery {
  text: string;
  sectionTitle: string;
  createdAt: string;
}

interface CopilotAnalytics {
  sections: CopilotSection[];
  totalQueries: number;
  recentQueries: CopilotQuery[];
}
```

Inside the component, add state:

```typescript
const [activeTab, setActiveTab] = useState<"learners" | "copilot">("learners");
const [copilotData, setCopilotData] = useState<CopilotAnalytics | null>(null);
const [copilotLoading, setCopilotLoading] = useState(false);
const [copilotError, setCopilotError] = useState<string | null>(null);
```

Add a `useEffect` for fetching copilot data (after the existing enrollment `useEffect`):

```typescript
useEffect(() => {
  if (!isOpen || !training || activeTab !== "copilot") return;
  let cancelled = false;

  const fetchCopilotAnalytics = async () => {
    setCopilotLoading(true);
    setCopilotError(null);
    try {
      const res = await fetch(`/api/trainings/${training.id}/copilot-analytics`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors du chargement");
      }
      const data = await res.json();
      if (!cancelled) setCopilotData(data);
    } catch (err) {
      if (!cancelled) setCopilotError(err instanceof Error ? err.message : "Erreur");
    } finally {
      if (!cancelled) setCopilotLoading(false);
    }
  };

  fetchCopilotAnalytics();
  return () => { cancelled = true; };
}, [isOpen, training, activeTab]);
```

Reset tab on close:

```typescript
// In the existing useEffect that resets selectedLearner:
useEffect(() => {
  if (!isOpen || !training) return;
  setSelectedLearner(null);
  setActiveTab("learners");
  // ... rest of existing enrollment fetch
```

- [ ] **Step 2: Add tab bar in the modal header**

Inside the header, find the `<div style={{ flex: 1 }}>` block that contains the "Analytics" label, the training title, and the join code. Add the tab bar **inside** this `<div>`, after the join code `<div>` (NOT at the top level of the header flex container, which would place it beside the close button):

```tsx
{/* Tab bar */}
<div style={{
  display: "flex",
  gap: 0,
  marginTop: 16,
  borderBottom: "1px solid var(--corp-border-light)",
}}>
  {([
    { key: "learners" as const, label: "Apprenants" },
    { key: "copilot" as const, label: "Copilot" },
  ]).map((tab) => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      style={{
        padding: "10px 20px",
        fontSize: 13,
        fontWeight: activeTab === tab.key ? 600 : 400,
        color: activeTab === tab.key ? "var(--corp-blue)" : "var(--corp-text-muted)",
        background: "none",
        border: "none",
        borderBottom: activeTab === tab.key ? "2px solid var(--corp-blue)" : "2px solid transparent",
        cursor: "pointer",
        transition: "all 0.15s ease",
        fontFamily: "var(--corp-font-body)",
        marginBottom: -1,
      }}
    >
      {tab.label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Wrap existing body content in learners tab conditional**

In the body `<div>` (the one with `padding: "24px 32px 32px"`), wrap ALL existing content (the `selectedLearner ? ... : loading ? ... : ...` block) inside:

```tsx
{activeTab === "learners" && (
  <>
    {/* ... all existing enrollment content ... */}
  </>
)}
```

- [ ] **Step 4: Add Copilot tab content**

After the learners tab conditional, add:

```tsx
{activeTab === "copilot" && (
  <>
    {copilotLoading ? (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 0",
        gap: 16,
      }}>
        <div style={{
          width: 36,
          height: 36,
          border: "3px solid var(--corp-border)",
          borderTop: "3px solid var(--corp-blue)",
          borderRadius: "50%",
          animation: "corp-spinner 0.8s linear infinite",
        }} />
        <span style={{ fontSize: 14, color: "var(--corp-text-muted)" }}>
          Chargement des analytics Copilot...
        </span>
      </div>
    ) : copilotError ? (
      <div style={{
        padding: 16,
        borderRadius: 12,
        background: "rgba(220,38,38,0.04)",
        border: "1px solid rgba(220,38,38,0.15)",
        textAlign: "center" as const,
      }}>
        <p style={{ fontSize: 14, color: "var(--corp-danger)", margin: 0 }}>
          {copilotError}
        </p>
      </div>
    ) : !copilotData || copilotData.totalQueries === 0 ? (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 0",
        gap: 12,
      }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "var(--corp-bg-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--corp-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
        <p style={{ fontSize: 15, fontWeight: 500, color: "var(--corp-navy)", margin: 0 }}>
          Aucune question posée au Copilot
        </p>
        <p style={{ fontSize: 13, color: "var(--corp-text-muted)", margin: 0, textAlign: "center" }}>
          Les données apparaîtront dès que vos apprenants utiliseront le Copilot de cette formation.
        </p>
      </div>
    ) : (
      <>
        {/* Stats cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}>
          {[
            { label: "Questions posées", value: String(copilotData.totalQueries) },
            { label: "Thèmes couverts", value: String(copilotData.sections.length) },
            { label: "Thème #1", value: copilotData.sections[0]?.title || "—" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "var(--corp-bg-subtle)",
                borderRadius: 12,
                padding: "16px 20px",
                textAlign: "center" as const,
              }}
            >
              <div style={{
                fontSize: stat.label === "Thème #1" ? 15 : 24,
                fontWeight: 600,
                color: "var(--corp-navy)",
                lineHeight: 1.2,
                marginBottom: 6,
                fontFamily: "var(--corp-font-body)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {stat.value}
              </div>
              <div style={{
                fontSize: 12,
                color: "var(--corp-text-muted)",
                fontWeight: 500,
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Section ranking */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--corp-navy)",
            margin: "0 0 12px",
            fontFamily: "var(--corp-font-body)",
          }}>
            Classement par thème
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {copilotData.sections.map((section, idx) => {
              const maxCount = copilotData.sections[0]?.queryCount || 1;
              const barWidth = Math.max((section.queryCount / maxCount) * 100, 4);
              return (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: idx === 0 ? "rgba(37,99,235,0.04)" : "transparent",
                    border: idx === 0 ? "1px solid rgba(37,99,235,0.12)" : "1px solid var(--corp-border-light)",
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: idx === 0 ? "var(--corp-blue)" : "var(--corp-text-muted)",
                    width: 20,
                    textAlign: "right" as const,
                    flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--corp-navy)",
                      marginBottom: 6,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {section.title}
                    </div>
                    <div style={{
                      height: 6,
                      borderRadius: 3,
                      background: "var(--corp-border-light)",
                      overflow: "hidden",
                    }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.05 + 0.2, ease: "easeOut" }}
                        style={{
                          height: "100%",
                          borderRadius: 3,
                          background: idx === 0
                            ? "var(--corp-blue)"
                            : "rgba(37,99,235,0.4)",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 4,
                    flexShrink: 0,
                  }}>
                    <span style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--corp-navy)",
                    }}>
                      {section.queryCount}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: "var(--corp-text-muted)",
                    }}>
                      ({section.percentage}%)
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Recent queries */}
        <div>
          <h3 style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--corp-navy)",
            margin: "0 0 12px",
            fontFamily: "var(--corp-font-body)",
          }}>
            Questions récentes
          </h3>
          <div style={{
            borderRadius: 12,
            border: "1px solid var(--corp-border)",
            overflow: "hidden",
            maxHeight: 300,
            overflowY: "auto",
          }}>
            {copilotData.recentQueries.map((q, idx) => (
              <div
                key={idx}
                style={{
                  padding: "12px 16px",
                  borderBottom: idx < copilotData.recentQueries.length - 1
                    ? "1px solid var(--corp-border-light)"
                    : "none",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--corp-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    color: "var(--corp-navy)",
                    lineHeight: 1.4,
                    marginBottom: 4,
                  }}>
                    {q.text}
                  </div>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "rgba(37,99,235,0.06)",
                      color: "var(--corp-blue)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 200,
                    }}>
                      {q.sectionTitle}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: "var(--corp-text-muted)",
                      whiteSpace: "nowrap",
                    }}>
                      {formatRelativeDate(q.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )}
  </>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Visual verification**

1. Open the manager dashboard
2. Click "Analytics" on a published training
3. Verify the tab bar appears ("Apprenants" | "Copilot")
4. "Apprenants" tab shows existing enrollment data (no regression)
5. "Copilot" tab shows empty state initially ("Aucune question posée au Copilot")
6. Use the Copilot on a training as a student, ask a few questions
7. Return to manager dashboard → Analytics → Copilot tab → verify section ranking appears

- [ ] **Step 7: Commit**

```bash
git add app/components/dashboard/TrainingAnalyticsModal.tsx
git commit -m "feat(analytics): add Copilot analytics tab with section ranking and recent queries"
```

---

### Task 8: Re-ingest Existing Trainings (optional)

Existing published trainings have chunks without `section_title`. To populate them:

- [ ] **Step 1: Identify published trainings**

Via Supabase MCP:
```sql
SELECT id, title FROM trainings WHERE status = 'published';
```

- [ ] **Step 2: Trigger re-publish for each**

The manager can re-publish from the dashboard, or you can call the publish API. Since `ingestDocument()` deletes existing chunks first, re-ingestion is idempotent.

- [ ] **Step 3: Verify section_titles populated**

Via Supabase MCP:
```sql
SELECT training_id, section_title, COUNT(*) FROM document_chunks
WHERE section_title IS NOT NULL
GROUP BY training_id, section_title
ORDER BY training_id, COUNT(*) DESC;
```
