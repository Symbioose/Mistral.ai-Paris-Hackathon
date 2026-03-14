# YouGotIt — Immersive B2B Training Platform

> **Turn any document into a voice-powered multi-agent RPG simulation in 30 seconds.**

Built for the **Mistral AI Worldwide Hackathon — Paris 2026** · AWS Track

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1-412991)](https://openai.com/)
[![ElevenLabs](https://img.shields.io/badge/ElevenLabs-TTS-blue)](https://elevenlabs.io/)
[![Deepgram](https://img.shields.io/badge/Deepgram-Nova--2-13EF93)](https://deepgram.com/)

---

## What is YouGotIt?

Corporate training has a retention problem. Employees read a 40-page procedure manual, take a multiple-choice quiz, and forget 80% of it within a week.

**YouGotIt flips the model.** Upload any training document — a safety protocol, a compliance guide, an onboarding manual — and the AI pipeline instantly generates an immersive voice roleplay simulation. Employees learn by *playing*, not reading. HR teams get a real-time view of where their teams actually stand.

### How it works

```
Your Document (PDF/TXT)
        │
        ▼
┌───────────────────────────────────────────────┐
│           OpenAI ORCHESTRATION (gpt-4.1-mini) │
│  Step 1: Generate Q&A pairs from document     │
│  Step 2: Cluster Q&As into thematic acts      │
│  Step 3: Generate agents + dramatic scenario  │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│              MULTI-AGENT SIMULATION           │
│                                               │
│  Agent 1 ──── Q&A Act 1 ────► Agent 2 ──►    │
│  (authoritative_male)         (warm_female)   │
│                                               │
│  gpt-4.1-nano evaluates every answer live     │
│  Deterministic emotion engine drives tension  │
│  ElevenLabs voices each agent with emotion    │
│  Deepgram streams voice input cross-browser   │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
             HR Dashboard & Skills Report
```

---

## Key Features

### For Employees
- **Voice-first interaction** — speak your answers, works on any browser (Chrome, Safari, Firefox, Edge)
- **Adaptive difficulty** — wrong answer once: agent rephrases. Twice: pedagogical agent explains in detail
- **Dramatic scenario** — each document generates a unique narrative with professional conflicts, emergencies, and character handoffs
- **Real-time emotional feedback** — agents change emotion (neutral → annoyed → angry) based on player performance, with live visual indicator
- **100% grounded Q&A** — every question and answer is extracted directly from the source document, with `source_excerpt` traceability

### For HR Teams
- **One-click setup** — upload a document, distribute access tokens to your team
- **Competency heatmap** — see exactly which topics each employee struggles with
- **Weighted scoring** — each thematic category scored independently
- **Automated skills report** — gap analysis, failure pattern detection, actionable recommendations

---

## Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16 App Router + TypeScript + React 19 | State machine UI, SSE consumption, Framer Motion animations |
| LLM — Real-time | OpenAI `gpt-4.1-nano` | Agent dialogue streaming, answer evaluation (ultra-low latency) |
| LLM — Preparation | OpenAI `gpt-4.1-mini` | Q&A generation, categorization, agent/scenario creation, learning agent |
| TTS | ElevenLabs (`eleven_turbo_v2_5`) | 5 distinct character voices + dynamic emotion parameters |
| STT | Deepgram Nova-2 (WebSocket streaming) | Real-time cross-browser voice input (fr-FR) |
| RAG | BM25 (custom, zero dependencies) | Document chunking + relevant context retrieval |
| Emotion | Deterministic engine (no LLM) | Algorithmic emotion computation — instant, predictable, reliable |

### OpenAI Model Strategy

| Call | Model | Mode | Purpose |
|------|-------|------|---------|
| Q&A generation | `gpt-4.1-mini` | JSON | Extract grounded question/answer pairs from document |
| Categorization | `gpt-4.1-mini` | JSON | Cluster Q&As into thematic acts |
| Agent & scenario generation | `gpt-4.1-mini` | JSON | Create characters, personalities, dramatic scenario |
| Real-time dialogue | `gpt-4.1-nano` | Streaming | Agent responses during simulation (latency-critical) |
| Answer evaluation | `gpt-4.1-nano` | JSON | Real-time correctness assessment with keyword matching |
| Learning agent | `gpt-4.1-mini` | Streaming | Pedagogical explanations (quality > speed) |
| Skills report | OpenAI | JSON | Post-simulation gap analysis |

### Q&A State Machine

The core engine is a **deterministic server-side state machine** — no hallucination risk on game progression:

```
ASKING ──── correct ──────────────────────► Next Q&A
   │
   └── wrong (1st) ──► REPHRASING
              │
         correct ─────────────────────────► Next Q&A
              │
         wrong (2nd) ──► LEARNING (pedagogical agent explains)
                    │
               "compris" ──► RE_ASKING
                    │
               any answer ──────────────► Next Q&A
```

State transitions are **100% deterministic** — controlled by server logic, not LLM decisions. The LLM only generates dialogue text.

### Emotion Engine

The emotion system is **fully algorithmic** — no LLM calls, instant computation, predictable behavior:

```
                    ┌─────────────────────────────┐
                    │       EMOTION ENGINE         │
                    │   (pure deterministic logic) │
                    ├─────────────────────────────┤
                    │ Input: evaluation result     │
                    │ Output: EmotionState         │
                    │   • current emotion          │
                    │   • intensity (0.0 → 1.0)    │
                    │   • trajectory (↑ → ↓)       │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            LLM System Prompt       TTS Parameters
            (tone instruction)    (stability, speed, style)
```

**Emotion transitions:**
- Correct (first try) → `pleased` (intensity drops)
- Correct (after failures) → `relieved`
- Wrong (1st) → `annoyed` (escalating)
- Wrong (2nd+) → `angry` (intensity 0.7+)
- Hesitation (>15s) → `suspicious`
- Learning complete → `neutral` (reset)

Emotions **persist across turns** with natural decay — the client doesn't reset between questions.

### Multi-Agent Orchestration

Each document generates:
- **N agents** (one per thematic category) with distinct personalities and voice types
- **1 learning agent** (always `warm_female`) activated on repeated failures
- **A dramatic scenario** with acts, conflicts, and professional emergencies

Agents communicate via **shared memory notes** — when a player fails repeatedly, the active agent sends a private note to colleagues (*"This trainee doesn't know the evacuation protocol — watch out"*), creating cross-agent narrative consistency.

### Voice Pipeline

```
Agent response
    │
    ├── [NARRATOR]...[/NARRATOR] ──► calm_narrator voice (stage directions)
    │
    └── dialogue text ──► agent voice + emotion-driven TTS params
            │
            ├── stability:  0.20–0.75 (emotion-dependent)
            ├── speed:      0.95–1.40
            └── style:      0.10–0.95
```

**5 voice archetypes**: `authoritative_male` · `warm_female` · `stressed_young` · `calm_narrator` · `gruff_veteran`

**Streaming TTS optimization**: sentences are buffered and sent to ElevenLabs as soon as they're complete (min 15 chars), so audio starts playing before the full response is generated.

### STT Pipeline

Deepgram Nova-2 via WebSocket with:
- Real-time interim results (visual feedback while speaking)
- Smart formatting + punctuation
- Utterance end detection (1.5s silence threshold)
- Voice activity detection (VAD)
- Echo cancellation + noise suppression (16kHz mono)

---

## Scoring System

| Scenario | Points |
|----------|--------|
| Correct on first try | +15 |
| Correct after rephrase | +8 |
| Correct after learning mode | +3 |
| Wrong → rephrase triggered | −3 |
| Wrong → learning triggered | −5 |

Final score = sum across all questions per thematic category.

---

## Setup

### Prerequisites

- Node.js 18+
- OpenAI API key
- ElevenLabs API key
- Deepgram API key

### Installation

```bash
git clone https://github.com/Symbioose/YouGotIt
cd YouGotIt
npm install
cp .env.example .env.local
# Fill in your API keys (see below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
# OpenAI (GPT-4.1 — primary LLM)
OPENAI_API_KEY=your_openai_key

# Deepgram (STT — cross-browser WebSocket streaming)
DEEPGRAM_API_KEY=your_deepgram_key

# ElevenLabs (TTS — 5 voices + emotion modulation)
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_AUTHORITATIVE_MALE=BUJMBsQ3Oq4cEeWSb48y
ELEVENLABS_VOICE_WARM_FEMALE=imRmmzTqlLHt9Do1HufF
ELEVENLABS_VOICE_STRESSED_YOUNG=Xgb3SR8idOHy8scGICeJ
ELEVENLABS_VOICE_CALM_NARRATOR=BVBq6HVJVdnwOMJOqvy9
ELEVENLABS_VOICE_GRUFF_VETERAN=F9KUTOne5xOKqAbIU7yg
```

---

## Usage

1. **Upload** — Drop any PDF or TXT document (training manual, safety protocol, compliance doc...)
2. **Orchestration** — Watch the AI analyze and generate your custom agents in real-time (~20s)
3. **Play** — Speak your answers. Agents react emotionally, adapt, and challenge you
4. **Report** — Get a detailed skills gap analysis with actionable recommendations

---

## Project Structure

```
app/
├── api/
│   ├── upload/       # PDF/TXT text extraction
│   ├── orchestrate/  # SSE — 3-step OpenAI pipeline → GamePlan
│   ├── chat/         # SSE — Q&A state machine + emotion engine
│   ├── tts/          # ElevenLabs TTS with emotion params
│   ├── deepgram/     # Deepgram API key endpoint for client WebSocket
│   └── report/       # Skills gap analysis (OpenAI JSON mode)
├── hooks/
│   └── useDeepgramSTT.ts  # WebSocket STT hook (Nova-2, fr-FR)
├── lib/
│   ├── agents/
│   │   ├── openai-client.ts   # OpenAI API wrapper (retry, streaming, JSON mode)
│   │   └── prepare.ts         # 3-step orchestration pipeline (Q&A → categories → agents)
│   ├── emotion-engine.ts      # Deterministic emotion computation (no LLM)
│   ├── rag.ts                 # BM25 chunking + retrieval (zero external deps)
│   ├── types.ts               # All TypeScript types (GamePlan, EmotionState, etc.)
│   └── voice/voices.ts        # VOICE_MAP + EMOTION_PARAMS
└── components/
    ├── EmotionIndicator       # Live emotion gauge (color + intensity + trajectory)
    ├── AgentGenerationView    # SSE orchestration animation
    ├── DialogueBox            # Real-time token streaming display
    ├── PushToTalk             # Voice recording with Deepgram STT
    ├── KnowledgeHeatmap       # Per-category score visualization
    ├── MissionFeed            # Live orchestration log terminal
    ├── SkillsReportDashboard  # Full HR skills report
    ├── ActTransitionOverlay   # Scene transition between acts
    └── ...
```

---

## Design System

Neo-brutalist aesthetic — thick borders, offset shadows, flat colors:

| Token | Value |
|-------|-------|
| Background | `#F3F0E6` warm beige |
| Primary | `#1A1A1A` near-black |
| Accent | `#FF5B22` orange |
| UI Font | Space Mono |
| Display Font | VT323 (retro numbers) |

---

## Hackathon Context

**Event**: Mistral AI Worldwide Hackathon — Paris Edition, Feb 28 – Mar 1, 2026

**Track**: Track 01 — Anything Goes (AWS)

**Key differentiators**:
- Multi-model strategy: `gpt-4.1-nano` for real-time (latency), `gpt-4.1-mini` for preparation (quality)
- Deterministic emotion engine — no LLM for emotions, pure algorithm
- 100% document-grounded Q&A — zero hallucination on training content
- Voice-first UX with 5 distinct character voices + emotional modulation
- Real B2B use case: L&D / HR tech vertical

---

## What's Next

- **Real-time HR dashboard** — WebSocket live view of all employees in active simulation
- **Multi-language support** — extend beyond French with automatic language detection
- **LMS integration** — export scores to existing HR platforms (Cornerstone, 360Learning, Workday)
- **Document versioning** — detect updates and flag outdated training completions
- **Response timer** — measure hesitation time, let the client react to silence

---

## Author

Built solo in 30 hours at Mistral Hackathon Paris 2026.

*"What if the most boring part of corporate life became the most engaging?"*
