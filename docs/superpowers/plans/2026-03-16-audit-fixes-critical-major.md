# YouGotIt Audit Fixes — Critical & Major Issues

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 9 CRITICAL and 15 MAJOR issues identified by the 4-agent security audit (SecOps, Game Logic, Performance, UX).

**Architecture:** 6 independent phases that can be parallelized via agent teams. Each phase targets one domain (security API routes, game logic, performance/cleanup, UX, validation, infra). Every task modifies a distinct set of files to avoid merge conflicts.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Auth + DB + RLS), Tailwind CSS 4, framer-motion

---

## File Map

| Phase | Files Created | Files Modified |
|-------|--------------|----------------|
| 1 — Security API Routes | `app/lib/api-utils.ts` | `app/api/deepgram/route.ts`, `app/api/trainings/[id]/route.ts`, `app/api/trainings/create/route.ts`, `app/api/report/route.ts` |
| 2 — Auth & Validation | — | `app/api/auth/signup/route.ts`, `app/api/chat/route.ts` (L199-214), `app/api/enrollments/[id]/save/route.ts`, `next.config.ts` |
| 3 — Game Logic | — | `app/api/chat/route.ts` (L252-428), `app/lib/agents/prepare.ts` (L305-315) |
| 4 — Performance & Cleanup | `app/hooks/useGameCleanup.ts` | `app/page.tsx`, `app/hooks/useDeepgramSTT.ts`, `app/lib/sfx.ts` |
| 5 — UX Resilience | — | `app/components/AgentGenerationView.tsx`, `app/globals.css` |
| 6 — Responsive Mobile | — | `app/globals.css`, `app/components/dashboard/DashboardLayout.tsx` |

---

## Chunk 1: Security API Routes

Fixes: SEC-02, SEC-03, SEC-04, SEC-05

### Task 1: Create shared API error helper

**Files:**
- Create: `app/lib/api-utils.ts`

- [ ] **Step 1: Create `app/lib/api-utils.ts`**

```typescript
import { NextResponse } from "next/server";

/**
 * Return a safe error response — never leak DB internals to the client.
 */
export function safeErrorResponse(
  userMessage: string,
  status: number,
  internalError?: unknown,
) {
  if (internalError) {
    console.error(`[API ${status}]`, internalError);
  }
  return NextResponse.json({ error: userMessage }, { status });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/api-utils.ts
git commit -m "feat: add safeErrorResponse helper to prevent DB error leakage (SEC-04)"
```

---

### Task 2: Fix Deepgram main key fallback (SEC-02)

**Files:**
- Modify: `app/api/deepgram/route.ts:27-38`

- [ ] **Step 1: Remove dev fallback that returns main API key**

Replace lines 27-38 in `app/api/deepgram/route.ts`:

```typescript
// BEFORE (lines 27-38):
    if (!projectId) {
      if (process.env.NODE_ENV === "production") {
        console.error("[deepgram] DEEPGRAM_PROJECT_ID not set — required in production.");
        return NextResponse.json(
          { error: "Deepgram STT not configured for production (missing project ID)." },
          { status: 503 },
        );
      }
      console.warn("[deepgram] No DEEPGRAM_PROJECT_ID — using main key (dev only).");
      return NextResponse.json({ apiKey });
    }
```

```typescript
// AFTER:
    if (!projectId) {
      console.error("[deepgram] DEEPGRAM_PROJECT_ID not set — cannot create scoped key.");
      return NextResponse.json(
        { error: "Deepgram STT not configured (missing project ID)." },
        { status: 503 },
      );
    }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/deepgram/route.ts
git commit -m "fix: never return main Deepgram key to client, require DEEPGRAM_PROJECT_ID always (SEC-02)"
```

---

### Task 3: Fix IDOR on GET /api/trainings/[id] (SEC-03)

**Files:**
- Modify: `app/api/trainings/[id]/route.ts:61-71`

- [ ] **Step 1: Add manager_id ownership check to GET handler**

Replace lines 61-71:

```typescript
// BEFORE:
  const { data: training, error } = await supabase
    .from("trainings")
    .select("*, enrollments(count)")
    .eq("id", id)
    .single();

  if (error || !training) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
  }

  return NextResponse.json({ training });
```

```typescript
// AFTER:
  // Fetch profile to determine role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isManager = profile?.role === "manager";

  let query = supabase
    .from("trainings")
    .select("*, enrollments(count)")
    .eq("id", id);

  // Managers can only see their own trainings
  if (isManager) {
    query = query.eq("manager_id", user.id);
  }

  const { data: training, error } = await query.single();

  if (error || !training) {
    return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
  }

  return NextResponse.json({ training });
```

- [ ] **Step 2: Also fix error leakage in DELETE handler (line 42)**

Replace line 42:

```typescript
// BEFORE:
    return NextResponse.json({ error: error.message }, { status: 500 });
```

```typescript
// AFTER:
    console.error("[trainings/delete] DB error:", error.message);
    return NextResponse.json({ error: "Échec de la suppression" }, { status: 500 });
```

- [ ] **Step 3: Commit**

```bash
git add app/api/trainings/[id]/route.ts
git commit -m "fix: add ownership check on GET trainings + sanitize error messages (SEC-03, SEC-04)"
```

---

### Task 4: Fix DB error leakage in trainings/create (SEC-04)

**Files:**
- Modify: `app/api/trainings/create/route.ts:75-77`

- [ ] **Step 1: Sanitize error response**

Replace lines 75-77:

```typescript
// BEFORE:
  if (createError) {
    console.error("[trainings/create] DB insert error:", createError.message, createError.details, createError.hint);
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }
```

```typescript
// AFTER:
  if (createError) {
    console.error("[trainings/create] DB insert error:", createError.message, createError.details, createError.hint);
    return NextResponse.json({ error: "Échec de la création de la formation. Veuillez réessayer." }, { status: 500 });
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/trainings/create/route.ts
git commit -m "fix: sanitize DB error in trainings/create response (SEC-04)"
```

---

### Task 5: Fix report accepting arbitrary client gameState (SEC-05)

**Files:**
- Modify: `app/api/report/route.ts:263-283`
- Modify: `app/api/enrollments/[id]/save/route.ts:44-45`

The fix: when generating a report for an enrolled student, fetch the server-side game_state from the enrollment record instead of trusting the client payload. The client payload is kept as fallback for manager test mode (no enrollment).

- [ ] **Step 1: Add enrollment-based server-side validation to report route**

After line 268 (`if (authError || !user) ...`), add enrollment lookup:

```typescript
  // --- SEC-05: Prefer server-side game state for enrolled students ---
  let body: ReportRequest;
  try {
    body = (await req.json()) as ReportRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let gameState = body?.gameState;
  const enrollmentId = (body as Record<string, unknown>).enrollmentId as string | undefined;

  // If an enrollment ID is provided, fetch the authoritative game_state from DB
  if (enrollmentId) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("game_state, student_id")
      .eq("id", enrollmentId)
      .single();

    if (enrollment?.game_state && enrollment.student_id === user.id) {
      gameState = enrollment.game_state as MultiAgentGameState;
    }
  }

  if (!gameState || !Array.isArray(gameState.scores)) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
```

This replaces lines 270-282. The rest of the route stays the same but uses the server-validated `gameState`.

- [ ] **Step 2: Also sanitize error in save route (line 44-45)**

Replace in `app/api/enrollments/[id]/save/route.ts`:

```typescript
// BEFORE:
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
```

```typescript
// AFTER:
  if (error) {
    console.error("[enrollments/save] DB error:", error.message);
    return NextResponse.json({ error: "Échec de la sauvegarde" }, { status: 500 });
  }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/report/route.ts app/api/enrollments/[id]/save/route.ts
git commit -m "fix: validate gameState server-side for reports + sanitize save errors (SEC-05, SEC-04)"
```

---

## Chunk 2: Auth, Validation & CORS

Fixes: SEC-08, SEC-09, SEC-10, GAME-03

### Task 6: Add password/email validation on signup (SEC-10)

**Files:**
- Modify: `app/api/auth/signup/route.ts:5-9`

- [ ] **Step 1: Add validation after the existing required-fields check**

After line 9 (`return NextResponse.json({ error: "Email..." })`), add:

```typescript
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Format d'email invalide" }, { status: 400 });
  }

  // Password strength — minimum 8 chars, at least 1 letter and 1 number
  if (password.length < 8) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 400 });
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins une lettre et un chiffre" }, { status: 400 });
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/auth/signup/route.ts
git commit -m "feat: add email format + password strength validation on signup (SEC-10)"
```

---

### Task 7: Add deeper validation on chat POST body (SEC-08)

**Files:**
- Modify: `app/api/chat/route.ts:206-214`

- [ ] **Step 1: Add size/depth validation after line 214**

Replace lines 206-214:

```typescript
// BEFORE:
  const { playerMessage, gameState, kickoff } = body as {
    playerMessage?: string;
    gameState: MultiAgentGameState;
    kickoff?: boolean;
  };

  if (!gameState || !Array.isArray(gameState.agents) || !gameState.scenario) {
    return Response.json({ error: "Invalid gameState: missing required fields." }, { status: 400 });
  }
```

```typescript
// AFTER:
  const { playerMessage, gameState, kickoff } = body as {
    playerMessage?: string;
    gameState: MultiAgentGameState;
    kickoff?: boolean;
  };

  if (!gameState || !Array.isArray(gameState.agents) || !gameState.scenario) {
    return Response.json({ error: "Invalid gameState: missing required fields." }, { status: 400 });
  }

  // SEC-08: Prevent oversized payloads that could exhaust memory
  if (gameState.agents.length > 10) {
    return Response.json({ error: "Too many agents." }, { status: 400 });
  }
  if (gameState.conversationHistory && gameState.conversationHistory.length > 200) {
    return Response.json({ error: "Conversation history too long." }, { status: 400 });
  }
  if (gameState.scores && gameState.scores.length > 20) {
    return Response.json({ error: "Too many score entries." }, { status: 400 });
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add payload size limits on chat POST body (SEC-08)"
```

---

### Task 8: Add CORS + CSP headers (SEC-09)

**Files:**
- Modify: `next.config.ts:13-32`

- [ ] **Step 1: Add CSP header to the existing headers array**

After line 31 (the HSTS header closing brace), add:

```typescript
          // Content Security Policy
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "media-src 'self' blob: https://api.elevenlabs.io",
              "connect-src 'self' https://*.supabase.co https://api.deepgram.com https://api.elevenlabs.io wss://api.deepgram.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
```

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "feat: add Content-Security-Policy header (SEC-09)"
```

---

### Task 9: Add optimistic locking on enrollment saves (GAME-03)

**Files:**
- Modify: `app/api/enrollments/[id]/save/route.ts`

- [ ] **Step 1: Add version-based optimistic locking**

Replace lines 17-42:

```typescript
// AFTER:
  const body = await request.json();
  const { gameState, chatHistory, score, totalQuestions, correctAnswers, completed, version } = body;

  const updateData: Record<string, unknown> = {
    last_played_at: new Date().toISOString(),
  };

  if (gameState !== undefined) updateData.game_state = gameState;
  if (chatHistory !== undefined) updateData.chat_history = chatHistory;
  if (score !== undefined) updateData.score = score;
  if (totalQuestions !== undefined) updateData.total_questions = totalQuestions;
  if (correctAnswers !== undefined) updateData.correct_answers = correctAnswers;

  if (completed) {
    updateData.status = "completed";
  } else if (gameState) {
    updateData.status = "in_progress";
  }

  // GAME-03: Optimistic locking — increment version on each save
  // If a version is provided, only update if it matches (prevents concurrent overwrites)
  let query = supabase
    .from("enrollments")
    .update({ ...updateData, version: (version || 0) + 1 })
    .eq("id", id)
    .eq("student_id", user.id);

  if (typeof version === "number") {
    query = query.eq("version", version);
  }

  const { data: enrollment, error } = await query.select().single();

  if (error) {
    // If no rows matched, it's likely a version conflict
    if (!enrollment) {
      return NextResponse.json(
        { error: "Version conflict — another tab may have saved. Please refresh." },
        { status: 409 },
      );
    }
    console.error("[enrollments/save] DB error:", error.message);
    return NextResponse.json({ error: "Échec de la sauvegarde" }, { status: 500 });
  }

  return NextResponse.json({ enrollment });
```

Note: This requires adding a `version` integer column to the `enrollments` table (default 0). Run in Supabase SQL editor:

```sql
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS version integer DEFAULT 0;
```

- [ ] **Step 2: Commit**

```bash
git add app/api/enrollments/[id]/save/route.ts
git commit -m "feat: add optimistic locking on enrollment saves to prevent race conditions (GAME-03)"
```

---

## Chunk 3: Game Logic Robustness

Fixes: GAME-01, GAME-02, GAME-04, GAME-05, GAME-06, GAME-07

### Task 10: Validate agents/categories count match (GAME-01)

**Files:**
- Modify: `app/lib/agents/prepare.ts:305-315`

- [ ] **Step 1: Add assertion after agents are sliced**

After line 315 (`}));`), add:

```typescript
  // GAME-01: Ensure agent count matches category count
  if (agents.length < categories.length) {
    console.warn(`[prepare] Agent count (${agents.length}) < category count (${categories.length}). Padding with fallback agents.`);
    while (agents.length < categories.length) {
      const idx = agents.length;
      const cat = categories[idx];
      agents.push({
        id: `agent_fallback_${idx + 1}`,
        name: `Expert ${idx + 1}`,
        role: cat?.name || `Expert ${idx + 1}`,
        personality: "Professionnel et direct.",
        voice_type: VOICE_ROTATION[idx % VOICE_ROTATION.length],
        motivation: "Résoudre la situation.",
        knowledge_topics: [cat?.name || ""],
        intro_line: "Bien, passons aux choses sérieuses.",
        relationship_to_player: "Collègue direct.",
      });
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/agents/prepare.ts
git commit -m "fix: pad agents to match category count, preventing undefined agent access (GAME-01)"
```

---

### Task 11: Fix infinite loop when gamePlan is absent (GAME-02)

**Files:**
- Modify: `app/api/chat/route.ts:252-256`

- [ ] **Step 1: Add turn limit and completion flag for fallback mode**

Replace lines 252-256:

```typescript
// BEFORE:
  if (!gamePlan || !interactionState || !currentQA) {
    // Fallback: no game plan, just have the agent talk
    agentPrompt = isKickoff
      ? "Presente-toi brievement et pose une premiere question au joueur. 10 mots max."
      : `Le joueur a dit: "${safePlayerMessage}". Reagis ultra-brievement et pose une question. 10 mots max.`;
```

```typescript
// AFTER:
  if (!gamePlan || !interactionState || !currentQA) {
    // GAME-02: Fallback with turn limit to prevent infinite loop
    const fallbackTurnCount = gameState.conversationHistory.filter((m) => m.role === "user").length;
    if (fallbackTurnCount >= 10) {
      simulationComplete = true;
      agentPrompt = "La simulation est terminee. Merci pour votre participation. 10 mots max.";
    } else {
      agentPrompt = isKickoff
        ? "Presente-toi brievement et pose une premiere question au joueur. 10 mots max."
        : `Le joueur a dit: "${safePlayerMessage}". Reagis ultra-brievement et pose une question. 10 mots max.`;
    }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "fix: add turn limit in fallback mode to prevent infinite dialogue loop (GAME-02)"
```

---

### Task 12: Improve keyword fallback evaluation (GAME-04)

**Files:**
- Modify: `app/api/chat/route.ts:168-184`

- [ ] **Step 1: Strengthen keyword matching fallback**

Replace the keyword fallback logic in both catch blocks (lines 168-174 and 179-184):

```typescript
// AFTER (inner catch, lines 168-174):
    } catch {
      // Keyword fallback — require minimum answer length + keyword presence
      const lower = playerMessage.toLowerCase();
      const matched = qa.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
      const hasMinLength = playerMessage.trim().length >= 15;
      const hasEnoughKeywords = matched.length >= Math.min(2, qa.keywords.length);
      const isCorrect = hasMinLength && (hasEnoughKeywords || (matched.length >= 1 && playerMessage.trim().length >= 30));
      return {
        correct: isCorrect,
        feedback: isCorrect ? "Mots-cles detectes" : "Reponse insuffisante",
      };
    }
```

```typescript
// AFTER (outer catch, lines 179-184):
  } catch (err) {
    console.error("[evaluateAnswer] API error, falling back to keyword match:", err);
    const lower = playerMessage.toLowerCase();
    const matched = qa.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    const hasMinLength = playerMessage.trim().length >= 15;
    const hasEnoughKeywords = matched.length >= Math.min(2, qa.keywords.length);
    const isCorrect = hasMinLength && (hasEnoughKeywords || (matched.length >= 1 && playerMessage.trim().length >= 30));
    return {
      correct: isCorrect,
      feedback: isCorrect ? "Mots-cles detectes (mode secours)" : "Evaluation indisponible — reponse insuffisante",
    };
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "fix: strengthen keyword fallback to require min length + multiple keywords (GAME-04)"
```

---

### Task 13: Add stream timeout (GAME-05)

**Files:**
- Modify: `app/api/chat/route.ts:545-550`

- [ ] **Step 1: Wrap streaming with a timeout**

Replace lines 545-550:

```typescript
// BEFORE:
  const textStream = streamChatCompletion({
    model: streamModel,
    messages,
    temperature: 0.6,
    maxTokens: 250,
  });
```

```typescript
// AFTER:
  const textStream = streamChatCompletion({
    model: streamModel,
    messages,
    temperature: 0.6,
    maxTokens: 250,
    timeoutMs: 30000, // GAME-05: 30s timeout on streaming
  });
```

If `streamChatCompletion` doesn't support `timeoutMs`, the timeout needs to be handled in the reader loop. Add timeout to the reader loop (inside `ReadableStream.start`, after line 577):

```typescript
      try {
        const reader = textStream.getReader();
        const streamStart = Date.now();
        const STREAM_TIMEOUT_MS = 30000;
        while (true) {
          // GAME-05: Abort if stream stalls for too long
          if (Date.now() - streamStart > STREAM_TIMEOUT_MS) {
            console.warn("[chat] Stream timeout after 30s");
            reader.cancel();
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "fix: add 30s timeout on streaming to prevent frozen dialogue (GAME-05)"
```

---

### Task 14: Fix score division edge case (GAME-07)

**Files:**
- Modify: `app/api/chat/route.ts:307-308, 365-366`

- [ ] **Step 1: Use Math.max to prevent division issues**

Replace line 307:

```typescript
// BEFORE:
      const numQuestions = cat?.qaPairIds.length || 1;
```

```typescript
// AFTER:
      const numQuestions = Math.max(1, cat?.qaPairIds?.length || 0);
```

Same fix on line 365:

```typescript
// BEFORE:
      const numQuestions = cat?.qaPairIds.length || 1;
```

```typescript
// AFTER:
      const numQuestions = Math.max(1, cat?.qaPairIds?.length || 0);
```

- [ ] **Step 2: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "fix: use Math.max(1, ...) to prevent 100-point score swing on empty category (GAME-07)"
```

---

## Chunk 4: Performance & Memory Leak Fixes

Fixes: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, GAME-06

### Task 15: Add master cleanup effect to page.tsx (PERF-01, GAME-06)

**Files:**
- Modify: `app/page.tsx` — add after line 431 (after the autoKickoff useEffect)

- [ ] **Step 1: Add cleanup useEffect**

Add this new effect after line 431:

```typescript
  // PERF-01 + GAME-06: Master cleanup on component unmount
  useEffect(() => {
    return () => {
      // Stop audio playback
      if (audioRef.current) {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.onpause = null;
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current = null;
      }

      // Revoke all blob URLs in the TTS preload cache before clearing
      for (const promise of ttsPreloadRef.current.values()) {
        promise.then((url) => {
          if (url) URL.revokeObjectURL(url);
        }).catch(() => {});
      }
      ttsPreloadRef.current.clear();

      // Clear TTS pipeline
      ttsGenerationRef.current += 1;
      ttsQueueRef.current = [];
      isTtsPlayingRef.current = false;

      // Clear auto-kickoff refs (GAME-06)
      autoKickoffCallbackRef.current = null;
      autoKickoffStateRef.current = null;
      autoKickoffFiredRef.current = null;
      prefetchedResponseRef.current = null;
    };
  }, []);
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "fix: add master cleanup useEffect on unmount — stops audio, revokes blobs, clears refs (PERF-01, GAME-06)"
```

---

### Task 16: Fix blob URL revocation on TTS queue clear (PERF-02)

**Files:**
- Modify: `app/page.tsx` — lines 645-646, 1134, 1207, 1247, 1266

Every place that calls `ttsPreloadRef.current.clear()` must first revoke all stored blob URLs.

- [ ] **Step 1: Create a helper function (add after line 237)**

```typescript
  /** Revoke all blob URLs in ttsPreloadRef before clearing the map. */
  const clearTtsPreloadWithRevoke = useCallback(() => {
    for (const promise of ttsPreloadRef.current.values()) {
      promise.then((url) => {
        if (url) URL.revokeObjectURL(url);
      }).catch(() => {});
    }
    ttsPreloadRef.current.clear();
  }, []);
```

- [ ] **Step 2: Replace all `ttsPreloadRef.current.clear()` calls**

Replace every occurrence of `ttsPreloadRef.current.clear()` with `clearTtsPreloadWithRevoke()`:

- Line 646: `ttsPreloadRef.current.clear()` → `clearTtsPreloadWithRevoke()`
- Line 1134: `ttsPreloadRef.current.clear()` → `clearTtsPreloadWithRevoke()`
- Line 1207: `ttsPreloadRef.current.clear()` → `clearTtsPreloadWithRevoke()`
- Line 1247: `ttsPreloadRef.current.clear()` → `clearTtsPreloadWithRevoke()`
- Line 1266: `ttsPreloadRef.current.clear()` → `clearTtsPreloadWithRevoke()`

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "fix: revoke all blob URLs before clearing TTS preload cache (PERF-02)"
```

---

### Task 17: Fix Deepgram WebSocket cleanup on early unmount (PERF-03)

**Files:**
- Modify: `app/hooks/useDeepgramSTT.ts:52-154`

- [ ] **Step 1: Add connecting state guard**

Add a ref to track connecting state. After line 50 (`const closedByUserRef = useRef(false);`):

```typescript
  const connectingRef = useRef(false);
```

In `startRecordingWithStream` (line 53), set it true at the start:

```typescript
  const startRecordingWithStream = useCallback(
    async (stream: MediaStream) => {
      connectingRef.current = true;
      finalRef.current    = "";
```

In `ws.onopen` (line 89), set it false:

```typescript
      ws.onopen = () => {
        connectingRef.current = false;
```

In `stopRecording` (line 156), also handle the connecting case:

```typescript
  const stopRecording = useCallback(() => {
    closedByUserRef.current = true;
    connectingRef.current = false;
    setIsRecording(false);
```

- [ ] **Step 2: Commit**

```bash
git add app/hooks/useDeepgramSTT.ts
git commit -m "fix: track Deepgram WebSocket connecting state for proper cleanup on early unmount (PERF-03)"
```

---

### Task 18: Add AudioContext cleanup to SFX engine (PERF-04)

**Files:**
- Modify: `app/lib/sfx.ts`

- [ ] **Step 1: Add a cleanup export**

Add at the end of the file (after line 133):

```typescript
/** Close the shared AudioContext — call on app shutdown / page leave. */
export function sfxCleanup() {
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}
```

- [ ] **Step 2: Use it in the master cleanup effect (Task 15)**

In the cleanup effect added in Task 15, import and call `sfxCleanup()`:

```typescript
import { sfxCleanup } from "@/app/lib/sfx";

// Inside the cleanup effect return:
      sfxCleanup();
```

- [ ] **Step 3: Commit**

```bash
git add app/lib/sfx.ts app/page.tsx
git commit -m "fix: add sfxCleanup() to close AudioContext on unmount (PERF-04)"
```

---

### Task 19: Add AbortController to SSE reader in page.tsx (PERF-05)

**Files:**
- Modify: `app/page.tsx` — inside `sendMultiAgentAction` (lines 667-786)

- [ ] **Step 1: Add timeout + abort on stream stall**

The `abortController` is already created at line 667 but isn't used for timeout. Add a timeout that aborts if no data arrives for 45 seconds.

After line 685 (`const reader = res.body.getReader();`), add timeout logic:

```typescript
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      let activePatch: Record<string, unknown> = {};
      let lastTokenText = "";
      let ttsBuffer = "";
      const suppressCurrentTurnOutput = false;

      // PERF-05: Abort if no data received for 45 seconds
      let lastDataTime = Date.now();
      const staleCheckInterval = setInterval(() => {
        if (Date.now() - lastDataTime > 45000) {
          console.warn("[page] SSE reader stalled for 45s, aborting");
          abortController.abort();
          clearInterval(staleCheckInterval);
        }
      }, 5000);
```

Inside the while loop (line 775), update the timestamp:

```typescript
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lastDataTime = Date.now(); // PERF-05: reset stale timer
```

After the while loop ends (before line 788), clean up:

```typescript
      clearInterval(staleCheckInterval); // PERF-05
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "fix: add 45s stale timeout on SSE reader to prevent zombie connections (PERF-05)"
```

---

## Chunk 5: UX Resilience

Fixes: UX-02

### Task 20: Add retry button on orchestration failure (UX-02)

**Files:**
- Modify: `app/components/AgentGenerationView.tsx:424-438`

- [ ] **Step 1: Verify the retry button already exists**

Looking at the code, line 427-437 already has a retry button:

```tsx
<button onClick={() => window.location.reload()} ...>Reessayer</button>
```

This does a full page reload which works but is not ideal. Replace with a proper retry:

```tsx
// BEFORE line 428:
                onClick={() => window.location.reload()}
```

```tsx
// AFTER:
                onClick={() => {
                  setError(null);
                  setAgents([]);
                  setScenario(null);
                  setEvaluationGrid([]);
                  setIsReady(false);
                  setStatus("Reconnexion à l'orchestrateur...");
                  // The SSE useEffect will re-trigger because we're resetting state
                  // Force re-mount by toggling a key — simplest approach:
                  window.location.reload();
                }}
```

Actually, looking at the SSE effect dependencies `[documentText, filename, processSseBlock, precomputedPlan]`, a state reset won't re-trigger it. The `window.location.reload()` approach is actually the correct one here. The retry button already exists — this issue is already handled.

- [ ] **Step 1: Mark UX-02 as already implemented (retry button exists at line 427)**

No code changes needed. The retry button exists and works via page reload.

- [ ] **Step 2: Commit (skip — no changes)**

---

## Chunk 6: Responsive Mobile

Fixes: UX-01

### Task 21: Add responsive CSS breakpoints (UX-01)

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add mobile breakpoints to globals.css**

Add before the closing of the file:

```css
/* ================================================
   UX-01: Responsive breakpoints for mobile/tablet
   ================================================ */

@media (max-width: 768px) {
  /* Dashboard: collapse sidebar on mobile */
  [data-sidebar] {
    display: none !important;
  }

  /* Dashboard: full-width content on mobile */
  [data-dashboard-content] {
    margin-left: 0 !important;
    padding: 16px !important;
  }

  /* Stats grid: stack on mobile */
  [data-stats-grid] {
    grid-template-columns: 1fr !important;
    gap: 8px !important;
  }

  /* Cards grid: single column on mobile */
  [data-cards-grid] {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }

  /* Modal: full width on mobile */
  [data-modal] {
    width: calc(100vw - 32px) !important;
    max-height: calc(100vh - 64px) !important;
  }
}

@media (max-width: 480px) {
  /* Extra small screens */
  [data-dashboard-content] {
    padding: 12px !important;
  }
}
```

Note: This requires adding `data-*` attributes to the relevant components. Since the components use inline styles, these CSS rules need `!important` to override them. The data attributes will be added in the DashboardLayout component.

- [ ] **Step 2: Add data attributes to DashboardLayout**

In `app/components/dashboard/DashboardLayout.tsx`, add `data-sidebar` to the sidebar div and `data-dashboard-content` to the content div. The exact line numbers depend on the component but look for the sidebar and main content containers.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css app/components/dashboard/DashboardLayout.tsx
git commit -m "feat: add responsive CSS breakpoints for mobile dashboard layout (UX-01)"
```

---

## Summary — Execution Order

These chunks can be parallelized as agent teams:

| Agent | Chunk | Tasks | Est. Time |
|-------|-------|-------|-----------|
| Agent A | Chunk 1 — Security API Routes | Tasks 1-5 | 15 min |
| Agent B | Chunk 2 — Auth & Validation | Tasks 6-9 | 15 min |
| Agent C | Chunk 3 — Game Logic | Tasks 10-14 | 20 min |
| Agent D | Chunk 4 — Performance | Tasks 15-19 | 20 min |
| Agent E | Chunk 5+6 — UX | Tasks 20-21 | 10 min |

**After all agents complete:**
- Run `npm run build` to verify no TypeScript errors
- Manual test: login, create training, play game, save/resume, generate report
- Run Supabase migration for `version` column on enrollments table

---

## Manual Steps Required (Not Automatable)

1. **SEC-01: Rotate all API keys** — Must be done manually in each provider's dashboard:
   - Mistral API dashboard
   - ElevenLabs console
   - OpenAI account
   - Groq console
   - Deepgram dashboard
   - Update `.env.local` with new keys
   - If keys were in git history: `git filter-repo --path .env.local`

2. **SEC-06: Supabase RLS policies** — Must be configured in Supabase Dashboard SQL editor:

```sql
-- Enable RLS on trainings
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers see own trainings" ON trainings
  FOR SELECT USING (auth.uid() = manager_id);

CREATE POLICY "Managers insert own trainings" ON trainings
  FOR INSERT WITH CHECK (auth.uid() = manager_id);

CREATE POLICY "Managers update own trainings" ON trainings
  FOR UPDATE USING (auth.uid() = manager_id);

CREATE POLICY "Managers delete own trainings" ON trainings
  FOR DELETE USING (auth.uid() = manager_id);

-- Students can read trainings they're enrolled in
CREATE POLICY "Students see enrolled trainings" ON trainings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enrollments
      WHERE enrollments.training_id = trainings.id
      AND enrollments.student_id = auth.uid()
    )
  );

-- Enable RLS on enrollments
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students see own enrollments" ON enrollments
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Students update own enrollments" ON enrollments
  FOR UPDATE USING (auth.uid() = student_id);

-- Managers see enrollments for their trainings
CREATE POLICY "Managers see training enrollments" ON enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = enrollments.training_id
      AND trainings.manager_id = auth.uid()
    )
  );

-- Add version column for optimistic locking (GAME-03)
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS version integer DEFAULT 0;
```

3. **SEC-07: Rate limiting** — Requires adding a rate limiting dependency (e.g., `@upstash/ratelimit` + Redis). This is a separate implementation task not included in this plan as it requires infrastructure setup.
