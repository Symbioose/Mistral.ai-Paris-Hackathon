# YouGotIt — Immersive B2B Training Platform

> **Turn any document into a voice-powered multi-agent RPG simulation in 30 seconds.**

Built for the **Mistral AI Worldwide Hackathon — Paris 2026** · AWS Track

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Mistral AI](https://img.shields.io/badge/Mistral-Large%20%26%20Small-orange)](https://mistral.ai/)
[![AWS Bedrock](https://img.shields.io/badge/AWS-Bedrock-FF9900)](https://aws.amazon.com/bedrock/)
[![ElevenLabs](https://img.shields.io/badge/ElevenLabs-TTS-blue)](https://elevenlabs.io/)

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
│           MISTRAL ORCHESTRATION               │
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
│  Mistral evaluates every answer in real-time  │
│  ElevenLabs voices each agent with emotion    │
│  Web Speech API captures player voice input   │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
             HR Dashboard & Skills Report
```

---

## Key Features

### For Employees
- **Voice-first interaction** — speak your answers, no typing required
- **Adaptive difficulty** — wrong answer once: agent rephrases. Twice: pedagogical agent explains in detail
- **Dramatic scenario** — each document generates a unique narrative with professional conflicts, emergencies, and character handoffs
- **Real-time emotional feedback** — agents change emotion (calm → stressed → panicked) based on player performance

### For HR Teams
- **One-click setup** — upload a document, distribute access tokens to your team
- **Competency heatmap** — see exactly which topics each employee struggles with
- **Weighted scoring** — each thematic category scored independently
- **Automated skills report** — gap analysis, failure pattern detection, 7-day action plan

---

## Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16 App Router + TypeScript | React state machine, SSE consumption |
| LLM Inference | Mistral Large + Small via **AWS Bedrock** | Q&A generation, evaluation, orchestration |
| Agent Streaming | Mistral API (Vercel AI SDK) | Real-time agent dialogue streaming |
| TTS | ElevenLabs (`eleven_multilingual_v2`) | 5 distinct character voices + emotion params |
| STT | Web Speech API (`fr-FR`) | Browser-native voice input |
| RAG | BM25 (custom, zero dependencies) | Document chunking + relevant context retrieval |

### Mistral Usage

YouGotIt makes **5 distinct types of Mistral calls**, each carefully tuned:

| Call | Model | Mode | Purpose |
|------|-------|------|---------|
| Q&A generation | Large | JSON | Extract question/answer pairs from document |
| Categorization | Small | JSON | Cluster Q&As into thematic acts (cost-efficient) |
| Agent & scenario generation | Large | JSON | Create characters, personalities, dramatic scenario |
| Answer evaluation | Large | JSON | Real-time correctness assessment with keyword matching |
| Parallel orchestration | Large | Function calling | Dynamic emotion updates, event triggers, inter-agent notes |

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

### Multi-Agent Orchestration

Each document generates:
- **N agents** (one per thematic category) with distinct personalities and voice types
- **1 learning agent** (always `warm_female`) activated on repeated failures
- **A dramatic scenario** with acts, conflicts, and professional emergencies

Agents communicate via **shared memory notes** — when a player fails repeatedly, the active agent sends a private note to colleagues (*"This trainee doesn't know the evacuation protocol — watch out"*), creating cross-agent narrative consistency.

### Performance: Near-Zero Latency Agent Transitions

```
Agent A streams handoff line: "Let me pass you to [Agent B]..."
          │
          ├── ElevenLabs TTS plays audio
          │
          └── SIMULTANEOUSLY: Agent B kickoff pre-fetched from API
                        │
               When audio ends → response already ready → instant transition
```

### Voice Pipeline

```
Agent text
    │
    ├── *asterisks* ──► calm_narrator voice (stage directions)
    │
    └── normal text ──► agent voice + emotion params
            │
            ├── stability:  0.20–0.75 (emotion-dependent)
            ├── speed:      0.95–1.40
            └── style:      0.10–0.95
```

**5 voice archetypes**: `authoritative_male` · `warm_female` · `stressed_young` · `calm_narrator` · `gruff_veteran`

Emotion states affect both TTS parameters and UI background color in real-time.

---

## Scoring System

| Scenario | Points |
|----------|--------|
| Correct on first try | +100% of question weight |
| Correct after rephrase | +60% |
| Correct after learning mode | +30% |
| Wrong → rephrase triggered | −20% |
| Wrong → learning triggered | −30% |

Final score = weighted average across all thematic categories.

---

## Setup

### Prerequisites

- Node.js 18+
- Mistral API key
- ElevenLabs API key
- AWS Bedrock access (OpenAI-compatible endpoint)

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/forma-training
cd forma-training
npm install
cp .env.example .env.local
# Fill in your API keys (see below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

```env
# Mistral (direct API — for real-time agent streaming)
MISTRAL_API_KEY=your_mistral_key

# AWS Bedrock (OpenAI-compatible endpoint — for LLM inference)
OPENAI_API_KEY=bedrock-api-key-...
OPENAI_BASE_URL=https://bedrock-mantle.us-east-1.api.aws/v1

# ElevenLabs (TTS — 5 voices)
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_AUTHORITATIVE_MALE=BUJMBsQ3Oq4cEeWSb48y
ELEVENLABS_VOICE_WARM_FEMALE=imRmmzTqlLHt9Do1HufF
ELEVENLABS_VOICE_STRESSED_YOUNG=Xgb3SR8idOHy8scGICeJ
ELEVENLABS_VOICE_CALM_NARRATOR=BVBq6HVJVdnwOMJOqvy9
ELEVENLABS_VOICE_GRUFF_VETERAN=F9KUTOne5xOKqAbIU7yg
```

---

## Usage

1. **Landing** — Choose between team access (HR token) or free individual training
2. **Upload** — Drop any PDF or TXT document (training manual, safety protocol, compliance doc...)
3. **Orchestration** — Watch Mistral analyze and generate your custom agents in real-time (~20s)
4. **Play** — Speak or type your answers. Agents react, adapt, and challenge you
5. **Report** — Get a detailed skills gap analysis with actionable recommendations

---

## Project Structure

```
app/
├── api/
│   ├── upload/       # PDF/TXT text extraction
│   ├── orchestrate/  # SSE — 3-step Mistral pipeline → GamePlan
│   ├── chat/         # SSE — Q&A state machine + parallel function calling
│   ├── tts/          # ElevenLabs TTS with emotion params + sentence buffering
│   └── report/       # Skills gap analysis (Mistral JSON mode)
├── lib/
│   ├── agents/
│   │   ├── mistral-client.ts   # AWS Bedrock client + mistralChat() helper
│   │   └── prepare.ts          # 3-step orchestration pipeline
│   ├── rag.ts                  # BM25 chunking + retrieval (zero external deps)
│   └── voice/voices.ts         # VOICE_MAP + EMOTION_PARAMS
└── components/
    ├── AgentGenerationView     # Live SSE orchestration animation
    ├── DialogueBox             # Real-time token streaming display
    ├── KnowledgeHeatmap        # Per-category score heatmap
    ├── MissionFeed             # Live orchestration log terminal
    ├── SkillsReportDashboard   # Full HR skills report
    └── ...
```

---

## Design System

Neo-brutalist aesthetic — thick borders, offset shadows, flat colors:

| Token | Value |
|-------|-------|
| Background | `#F3F0E6` warm beige |
| Primary | `#1A1A1A` near-black |
| Accent | `#FF5B22` Mistral orange |
| UI Font | Space Mono |
| Display Font | VT323 (retro numbers) |

---

## Hackathon Context

**Event**: Mistral AI Worldwide Hackathon — Paris Edition, Feb 28 – Mar 1, 2026

**Track**: Track 01 — Anything Goes (AWS)

**Key alignment points**:
- Mistral Large & Small via **AWS Bedrock** (OpenAI-compatible endpoint)
- Multi-agent orchestration with function calling + shared memory
- Voice-first UX with ElevenLabs (Best Voice Use Case prize target)
- Real B2B use case: L&D / HR tech vertical

---

## What's Next

- **Fine-tuned evaluator** — Mistral Small fine-tuned on domain Q&A pairs for higher evaluation precision
- **Real-time HR dashboard** — WebSocket live view of all employees in active simulation
- **Multi-language support** — extend beyond French with automatic language detection
- **LMS integration** — export scores to existing HR platforms (Cornerstone, 360Learning, Workday)
- **Document versioning** — detect updates and flag outdated training completions

---

## Author

Built solo in 30 hours at Mistral Hackathon Paris 2026.

*"What if the most boring part of corporate life became the most engaging?"*