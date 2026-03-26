# YouGotIt

B2B gamified training SaaS powered by AI role-play. A manager uploads a document, the app generates a multi-agent scenario with Q&A via OpenAI. The learner interacts vocally with AI characters who test them on the content. A RAG Copilot lets learners ask questions about the document, and the manager can track training analytics.

## Features

**Manager**
- Signup via single-use B2B invitation token
- Upload PDF/TXT documents, automatic training generation
- Publish with access code for learners
- Analytics dashboard: progress, scores, completion rate per learner
- Copilot Analytics: most-queried topics ranking, recent anonymized questions

**Learner**
- Free signup, join a training via code
- Immersive simulation with voice-driven AI agents (TTS/STT)
- Document Copilot: ask questions about the training document with citations and sources
- Pause/resume session
- Skills report at end of session

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + Framer Motion |
| Auth & DB | Supabase (Auth + PostgreSQL + pgvector + Storage + RLS) |
| LLM | OpenAI `gpt-4.1-mini` (preparation, copilot, labeling) |
| Embeddings | OpenAI `text-embedding-3-small` (Copilot RAG) |
| TTS | ElevenLabs `eleven_turbo_v2_5` (5 voices, emotion modulation) |
| STT | Deepgram `nova-2` (WebSocket streaming, French) |
| SFX | Web Audio API (procedural) |

## Quick Start

```bash
git clone https://github.com/emmusic/YouGotIt.git
cd YouGotIt
npm install
cp .env.example .env.local
# Fill in the variables in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # service_role key (Settings > API)

# OpenAI
OPENAI_API_KEY=

# ElevenLabs (TTS)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_AUTHORITATIVE_MALE=
ELEVENLABS_VOICE_WARM_FEMALE=
ELEVENLABS_VOICE_STRESSED_YOUNG=
ELEVENLABS_VOICE_CALM_NARRATOR=
ELEVENLABS_VOICE_GRUFF_VETERAN=

# Deepgram (STT)
DEEPGRAM_API_KEY=
DEEPGRAM_PROJECT_ID=
```

## Creating a Manager Invitation Token

Manager signup is protected by a single-use invitation token system. Only the database admin can create them.

**Via the Supabase SQL Editor:**

```sql
-- Create a token
INSERT INTO public.manager_invites (token, company_name)
VALUES ('MY-SECRET-TOKEN', 'Company Name');

-- Check existing tokens
SELECT token, company_name, is_used, created_at
FROM public.manager_invites
ORDER BY created_at DESC;

-- Reset a token (if needed)
UPDATE public.manager_invites
SET is_used = false
WHERE token = 'MY-SECRET-TOKEN';
```

The token is automatically consumed (`is_used = true`) on signup. If signup fails, the token is restored.

## How It Works

1. **Upload** — The manager uploads a PDF or TXT document
2. **Orchestration** — 3 LLM calls generate Q&A, categories and agents (~10s)
3. **Copilot Ingestion** — The document is chunked, labeled by section and indexed (vector embeddings)
4. **Simulation** — The learner answers vocally, agents react with emotion
5. **Copilot** — The learner can ask questions about the document (RAG with citations)
6. **Report** — Skills analysis with gaps and recommendations
7. **Copilot Analytics** — The manager sees most-queried topics + recent questions

### Q&A State Machine

```
ASKING ──(correct)──────────────────────► Next Q&A
   │
   └──(incorrect)──► REPHRASING ──(correct)──► Next Q&A
                         │
                         └──(incorrect)──► LEARNING (teaching agent)
                                              │
                                         (confirmation)
                                              │
                                         RE_ASKING ──► Next Q&A
```

### Scoring

Each category is worth 100 points:

| Attempt | Multiplier |
|---------|------------|
| 1st correct answer | x1.0 |
| After rephrasing | x0.6 |
| After learning | x0.3 |

## Scripts

```bash
npm run dev    # Development server
npm run build  # Production build
npm run start  # Production server
npm run lint   # ESLint
```

## Hackathon

Mistral AI Worldwide Hackathon — Paris, Feb 28 – Mar 1, 2026 (Track 01 — AWS)

## License

MIT
