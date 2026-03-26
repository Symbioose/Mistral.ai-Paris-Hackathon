# YouGotIt — Technical Documentation

## Architecture

```
app/
├── api/
│   ├── auth/
│   │   ├── login/            # POST — Email/password authentication
│   │   ├── logout/           # POST — Logout
│   │   └── signup/           # POST — Signup (token required for manager)
│   ├── chat/                 # POST — SSE: Q&A state machine + evaluation
│   ├── copilot/[trainingId]/ # POST — Copilot RAG chat (vector search + LLM response)
│   ├── deepgram/             # GET — Temporary Deepgram key for client-side STT
│   ├── enrollments/[id]/
│   │   └── save/             # POST — Save progress (optimistic lock)
│   ├── orchestrate/          # POST — SSE: game plan generation (3 LLM calls)
│   ├── report/               # POST — Skills report generation
│   ├── trainings/
│   │   ├── create/           # POST — Create training + upload document
│   │   ├── join/             # POST — Join training by code (student)
│   │   └── [id]/
│   │       ├── GET/DELETE    # Read/delete training
│   │       ├── publish/      # POST — Publish + generate game plan
│   │       ├── enrollments/  # GET — Enrollment list (manager analytics)
│   │       └── copilot-analytics/ # GET — Topics + recent Copilot queries
│   ├── tts/                  # POST — ElevenLabs text-to-speech
│   └── upload/               # POST — PDF/TXT text extraction
├── components/
│   ├── copilot/              # ChatPanel (RAG chat), DocumentViewer (PDF viewer)
│   ├── dashboard/            # TrainingCard, EnrollmentCard, CreateTrainingModal,
│   │                         # TrainingAnalyticsModal (Learners/Copilot tabs),
│   │                         # EmptyState, DashboardLayout
│   ├── ActiveAgentDisplay    # Active agent with emotion badge
│   ├── AgentGenerationView   # Orchestration phase (animated SVG graph)
│   ├── AgentPanel            # Agent list + event log
│   ├── DialogueBox           # Dialogue with typewriter effect
│   ├── EmotionIndicator      # Emotion gauge with intensity and trajectory
│   ├── KnowledgeHeatmap      # Scores by category
│   ├── MissionFeed           # Real-time mission log
│   ├── ObjectiveHUD          # Act + score + progress
│   ├── PushToTalk            # Mic button + transcript preview
│   ├── SkillsReportDashboard # Final report (radar, matrix, recommendations)
│   ├── ActTransitionOverlay  # Act transition overlay
│   ├── SimulationEndOverlay  # Simulation end screen
│   ├── FileUpload            # PDF/TXT upload with drag-drop
│   └── TextInput             # Alternative text input
├── hooks/
│   └── useDeepgramSTT        # STT hook via Deepgram WebSocket
├── lib/
│   ├── agents/
│   │   ├── openai-client     # Typed OpenAI client with retry (429/5xx)
│   │   ├── prepare           # 3-step pipeline: Q&A → categories → agents
│   │   ├── orchestrator      # SimulationSetup generation
│   │   └── agent-factory     # System prompt construction with RAG
│   ├── game/
│   │   └── state             # Init game state, scoring, switch agent
│   ├── copilot/
│   │   ├── chunking          # Document chunking + heading detection (regex)
│   │   ├── embeddings        # OpenAI text-embedding-3-small embeddings
│   │   ├── ingest            # Ingestion pipeline: chunk → label → embed → upsert
│   │   └── labeling          # LLM thematic labeling (5-8 topic taxonomy)
│   ├── supabase/
│   │   ├── client            # Browser client (anon key)
│   │   ├── server            # Server client (cookies)
│   │   ├── admin             # service_role client (bypass RLS)
│   │   └── middleware        # Next.js session refresh
│   ├── voice/
│   │   └── voices            # VOICE_MAP + EMOTION_PARAMS for ElevenLabs
│   ├── emotion-engine        # Deterministic emotion state machine (no LLM)
│   ├── rag                   # BM25 chunking + retrieval (zero dependencies)
│   ├── sfx                   # Procedural sound effects (Web Audio API)
│   ├── api-utils             # Secure error response helper
│   └── types                 # Central TypeScript types
├── providers/
│   └── AuthProvider          # Auth context (signUp, signIn, signOut, profile)
├── dashboard/
│   ├── layout                # DashboardLayout (collapsible sidebar + auth guard)
│   ├── manager/page          # Manager dashboard (trainings, analytics)
│   └── student/page          # Student dashboard (enrollments, progress)
├── auth/
│   └── callback/             # OAuth callback handler
├── layout.tsx                # Root layout + AuthProvider
└── page.tsx                  # Landing + immersive simulation
```

---

## Database (Supabase)

### Tables

**profiles** *(auto-created by Supabase Auth trigger)*

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | FK to auth.users |
| role | text | `manager` / `student` |
| full_name | text | Full name |
| avatar_url | text? | Optional avatar |

**trainings**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| manager_id | UUID FK | Owner |
| title | text | Training title |
| status | text | `draft` / `processing` / `published` |
| document_text | text | Raw document content |
| document_filename | text | Original filename |
| document_path | text? | Supabase storage path |
| game_plan | jsonb? | AI-generated game plan |
| join_code | text unique | Access code (auto-generated by trigger) |
| max_students | int | Enrollment limit |

**enrollments**

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| student_id | UUID FK | Learner |
| training_id | UUID FK | Training |
| status | text | `not_started` / `in_progress` / `completed` |
| score | int? | Current score |
| total_questions | int? | Total Q&A count |
| correct_answers | int? | Correct answers |
| game_state | jsonb? | Serialized game state (pause/resume) |
| chat_history | jsonb? | Conversation history |
| version | int | Optimistic lock |
| last_played_at | timestamp? | Last activity |

**document_chunks** *(vector chunks for Copilot RAG)*

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| training_id | UUID FK | Associated training |
| chunk_index | int | Chunk index in document |
| content | text | Chunk text |
| section_title | text? | Assigned topic/section (heading or LLM) |
| embedding | vector(1536) | OpenAI text-embedding-3-small embedding |

**copilot_queries** *(anonymous Copilot question log — manager analytics)*

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| training_id | UUID FK | Associated training |
| query_text | text | Question asked by learner |
| section_title | text? | Top matching chunk topic (denormalized) |
| chunk_ids | jsonb | Chunk indices used for the answer |
| created_at | timestamptz | Query timestamp |

**manager_invites** *(service_role access only — no public RLS policy)*

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| token | text unique | Invitation code |
| company_name | text? | Company name |
| is_used | boolean | Token consumed? |

### RLS

| Table | Policy |
|-------|--------|
| profiles | Read own profile |
| trainings | Manager CRUD own trainings, student read published |
| enrollments | Student RW own enrollments, manager read for their trainings |
| document_chunks | INSERT/SELECT for manager owner, SELECT for enrolled students |
| copilot_queries | INSERT for enrolled students and manager owner, SELECT for manager owner |
| manager_invites | No public policy — service_role only |

### Supabase Clients

| File | Key | Usage |
|------|-----|-------|
| `supabase/client.ts` | anon key | Browser (AuthProvider) |
| `supabase/server.ts` | anon key + cookies | API routes (user context) |
| `supabase/admin.ts` | service_role key | Admin operations (bypass RLS) |

---

## Authentication

### Manager Signup (with token)

```
POST /api/auth/signup { email, password, fullName, role: "manager", inviteToken }
  │
  ├── Validate email + password
  ├── Verify token in manager_invites (admin client, bypass RLS)
  │   └── token exists AND is_used = false?
  ├── Mark is_used = true
  ├── supabase.auth.signUp() with role in metadata
  │   └── On failure → rollback is_used = false
  └── Return { user }
```

### Student Signup (open)

```
POST /api/auth/signup { email, password, fullName, role: "student" }
  └── No token required
```

### Session

`proxy.ts` (Next.js middleware) calls `updateSession()` on every request to refresh Supabase auth cookies.

---

## Generation Pipeline (`prepareGamePlan`)

3 sequential LLM calls (`gpt-4.1-mini`):

**Step 1 — Q&A Generation** (temp 0.3)
- Input: document text (max 100k chars)
- Output: 5-25 `QAPair[]` with `question`, `expected_answer`, `keywords`, `situation`, `source_excerpt`, `difficulty`
- Rule: each Q&A must cite an exact passage from the document (zero hallucination)

**Step 2 — Categorization** (temp 0.2)
- Input: list of Q&A pairs
- Output: 1-4 thematic `QACategory[]`, pedagogical progression

**Step 3 — Agents + Scenario** (temp 0.4)
- Output: 1 agent per category + 1 learning agent (`warm_female`) + multi-act scenario
- Voices assigned by personality (feminine name detection)

Hardcoded fallback if the pipeline fails.

### SSE `/api/orchestrate`

```
status → status → ... → scenario → new_agent (×N) → evaluation_grid → ready
```

---

## Q&A State Machine (`/api/chat`)

```
ASKING ──── correct ──────────────────────► Next Q&A / COMPLETE
   │
   └── incorrect (fail=0) → REPHRASING
              │
         correct ──────────────────────────► Next Q&A
              │
         incorrect (fail=1) → LEARNING (teaching agent explains)
                    │
               "understood" → RE_ASKING
                    │
               answer ─────────────────────► Next Q&A
```

### Scoring

Each category is worth 100 points, distributed among its Q&A pairs:

| Attempt | Multiplier |
|---------|------------|
| 1st correct answer | x1.0 |
| After rephrasing | x0.6 |
| After learning | x0.3 |

Penalties: -20% (1st failure), -30% (2nd), -15% (after learning).

Total score = weighted average of categories.

### SSE `/api/chat`

```
meta (patch + emotion) → token (incremental dialogue) → done (final state)
```

---

## Voice System

### TTS (ElevenLabs)

| Voice type | Usage |
|------------|-------|
| `authoritative_male` | Senior/director agent |
| `warm_female` | Learning agent / supportive agent |
| `stressed_young` | Junior agent under pressure |
| `gruff_veteran` | Experienced field agent |
| `calm_narrator` | Stage directions (`*text between asterisks*`) |

Parameters modulated by emotion:

| Emotion | stability | speed | style |
|---------|-----------|-------|-------|
| calm | 0.75 | 1.0 | 0.1 |
| stressed | 0.30 | 1.2 | 0.65 |
| angry | 0.40 | 1.1 | 0.80 |
| panicked | 0.20 | 1.4 | 0.95 |
| suspicious | 0.55 | 0.95 | 0.40 |

### STT (Deepgram)

- Model `nova-2`, language `fr`, WebSocket streaming
- Interim results (live preview) + final results
- Voice activity detection (VAD), 1.5s silence
- Temporary key generated server-side (`/api/deepgram`)
- Cross-browser: opus (Chrome/Firefox) or aac (Safari)

---

## Emotion Engine

Deterministic state machine (no LLM) in `emotion-engine.ts`:

| Event | Resulting emotion | Intensity |
|-------|-------------------|-----------|
| Correct answer (1st try) | pleased | 0.4 ↓ |
| Correct answer (after failure) | relieved | 0.3 ↓ |
| Wrong answer (fail <= 1) | annoyed | +0.15 ↑ |
| Wrong answer (fail >= 2) | angry | max(0.7) ↑ |
| Hesitation (> 15s) | suspicious | +0.10 ↑ |
| End of learning | neutral | 0.2 = |

Emotion influences:
- Agent prompt (tone instruction)
- ElevenLabs TTS parameters
- UI (emotion badge, colors)

Natural decay: intensity -0.1 per turn when cooling.

---

## RAG

Custom BM25 (zero dependencies) in `rag.ts`:

- Chunking: 750 chars, 120 chars overlap
- Tokenization: lowercase + NFD + French stop words
- Scoring: BM25 (k1=1.2, b=0.75)
- Top-K chunks injected into each agent's system prompt
- Ensures responses are grounded in the source document

---

## Copilot RAG (Vector)

Complementary pipeline to the BM25 above, using vector embeddings for the document Copilot.

### Ingestion (on publish)

```
Document text
  → chunkDocument(): 500 chars, overlap 100, regex heading detection
  → labelChunksWithLLM(): if < 50% chunks have a heading → LLM taxonomy (5-8 topics)
  → generateEmbeddings(): OpenAI text-embedding-3-small, batches of 100
  → Upsert document_chunks (content, section_title, embedding)
```

Heading detection: markdown (`#`), numbered (`1.`), ALL CAPS, Roman numerals, short lines (< 60 chars).

LLM labeling: a single `gpt-4.1-mini` call (JSON mode) that extracts 5-8 global topics then assigns each chunk to exactly one topic. Avoids variants (`Refund` vs `Refunds`).

### Copilot Chat (`/api/copilot/[trainingId]`)

```
Learner question
  → Embed the question (text-embedding-3-small)
  → match_chunks RPC: cosine similarity top-5 (pgvector)
  → System prompt with chunks + citation instructions
  → Streaming LLM (gpt-4.1-mini) with "Source N" references
  → after(): anonymous log to copilot_queries (denormalized section_title)
```

Logging uses `after()` (Next.js) with `createAdminClient()` for serverless-safe fire-and-forget.

### Copilot Analytics (`/api/trainings/[id]/copilot-analytics`)

Server-side JS aggregation of `copilot_queries` by `section_title`. Returns:
- Most-queried topics ranking (with percentage)
- Total query count
- 20 most recent questions (anonymized, with section and date)

Accessible in the manager dashboard via the "Copilot" tab in the analytics modal.

---

## Security

- Security headers in production (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- CSP disabled in dev (Next.js HMR)
- Supabase RLS on all tables
- Single-use manager tokens with rollback on signup failure
- `SUPABASE_SERVICE_ROLE_KEY` never exposed client-side (no `NEXT_PUBLIC_` prefix)
- Temporary Deepgram key (main key never sent to client)
- TTS input validation (1000 chars max, alphanumeric voice ID)
- Optimistic lock on enrollment saves (`version`)
- Ownership verification on all manager endpoints
- `Cache-Control: no-store` on all API routes

---

## Dependencies

| Category | Package | Version |
|----------|---------|---------|
| Framework | next | 16.1.6 |
| | react / react-dom | 19.2.3 |
| Database | @supabase/supabase-js | 2.99.1 |
| | @supabase/ssr | 0.9.0 |
| Animation | framer-motion | 12.34.3 |
| LLM | openai | 6.25.0 |
| Documents | pdf-parse | 2.4.5 |
| Styling | tailwindcss | 4 |
| | @tailwindcss/postcss | 4 |
| Dev | typescript | 5 |
| | eslint | 9 |
| | babel-plugin-react-compiler | 1.0.0 |

---

## Configuration

- **React Compiler** enabled (`next.config.ts`)
- **Tailwind CSS 4** zero-config via PostCSS
- **TypeScript** strict mode, target ES2017, path alias `@/*`
- **ESLint** flat config, extends `eslint-config-next`
