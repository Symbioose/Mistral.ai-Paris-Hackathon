# Architecture Technique — RAG to RPG

Serious game engine B2B : un document de formation → simulation multi-agents voice roleplay.
Stack : Next.js 16 App Router · Mistral AI · ElevenLabs · Browser Web Speech API

---

## 1. Architecture Globale — Le Flux de Données

### Phase 1 — Ingestion & Orchestration

**Endpoint : `POST /api/upload`**
- pdf-parse (PDF) ou plain text (.txt)
- Troncature à **12 000 caractères** (~3 000 tokens) avec notice explicite
- Retourne : `{ text, filename, charCount, truncated }`

**Endpoint : `POST /api/orchestrate`** (SSE)
1. `topTerms(text, 8)` — tokenisation BM25 → top 8 termes comme `keyConcepts`
2. `sectionSummaries(text, 4)` — paragraphes >60 chars, tronqués à 260 chars chacun
3. `assessComplexity(keyConcepts, sectionSummaries)` → `"simple" | "standard" | "complex"`
   - simple : ≤4 concepts **et** ≤2 sections → 1 agent, 1 acte
   - standard : défaut → 2 agents, 2 actes
   - complex : ≥8 concepts **ou** ≥6 sections → 3-5 agents, 3 actes
4. `orchestrateSimulation()` : **mistral-large-latest**, JSON mode (`responseFormat: json_object`), temp=0.35, maxTokens=3000, timeout=45s
5. Fallback déterministe : `fallbackSimulationSetup()` si LLM échoue (template hardcodé depuis top terms)

SSE events : `status` → `scenario` → `new_agent` (×N, délai 220ms) → `evaluation_grid` → `ready`

**RAG : `app/lib/rag.ts`** (BM25 from scratch, zéro dépendance)
- Chunking : 750 chars, overlap 120 chars, break aux retours ligne
- BM25 : k1=1.2, b=0.75, stop words français, normalisation Unicode + accent stripping
- `buildAgentPrompt()` dans `agent-factory.ts` : query = `"${role} ${motivation} ${topics}"`, topK=5 chunks → injectés dans le system prompt de chaque agent

---

### Phase 2 — Game Loop

**STT : Browser Web Speech API**
- `window.SpeechRecognition || window.webkitSpeechRecognition`
- Lang `fr-FR`, `continuous: true`, `interimResults: true`
- Push-to-talk : mousedown/touchstart démarre, mouseup/touchend soumet le transcript final
- Aucun fallback si API non supportée (Chrome requis)

**Endpoint : `POST /api/chat`** (SSE)

Corps de la requête : `{ playerMessage, gameState, kickoff, turnsWithCurrentAgent, strugglingTopics }`

Construction des messages (ordre) :
1. System — `activeAgentState.systemPrompt` (personnalité + RAG knowledge)
2. System — `buildContext()` (interdictions, acte courant, trigger_condition, bilan joueur, hints de switch/stuck)
3. System — kickoff situationnel (initial ou agent-switch, avec key_challenge + trigger_condition + état joueur)
4. Historique — `conversationHistory.slice(-20)` filtré et assaini
5. User — message joueur (ou prompt kickoff standardisé)

LLM : **mistral-large-latest**, temp=0.65, maxTokens=**120**, toolChoice="auto"

**5 outils Mistral :**

| Outil | Disponibilité | Effet |
|---|---|---|
| `switch_agent` | non-kickoff uniquement | Change `activeAgentId`, déclenche `autoKickoff` |
| `trigger_event` | toujours | Ajoute à `triggeredEvents`, peut activer `chaosMode` |
| `update_emotion` | toujours | Modifie `emotion` de l'agent actif → change voix ElevenLabs |
| `check_knowledge` | toujours | Enregistre `testedTopics`, ajoute un `knowledgeCheck` |
| `conclude_simulation` | toujours | `simulationComplete=true`, `conclusionType` (success/partial/failure) |

**`switch_agent` est enum-contraint** : seuls les IDs des agents non-actifs sont dans le schéma.

**Force switch déterministe** (fallback serveur) :
```
!isKickoff && !hasModelSwitch && (struggling.length > 0 || turnCount >= 2)
```
Sélection : agent avec `knowledge_topics` qui couvre les lacunes → `warm_female` → `candidates[0]`

**Hard cap par acte** : `MAX_TURNS_PER_ACT = 4` → `isActStuck` → hint 🔴 ACTE BLOQUÉ dans le contexte

**Evaluateur parallèle** (`app/lib/agents/evaluator.ts`) :
- Lance `evaluateExchange()` en parallèle du streaming (Promise non-bloquante)
- **mistral-large-latest**, temp=0.2, maxTokens=600, tool calling forcé (`evaluation_update`)
- Reçoit : message joueur, réponse agent, état du jeu (scores, acte, historique)
- Retourne : `score_updates[]` (delta ±20 max par topic), `should_advance_act`, `should_trigger_chaos`

SSE events :
```
meta (patch initial + tool_calls)
→ token (mot par mot, délai 18ms)
→ done (texte complet + patch)
→ [eval résout] → meta (scores mis à jour, acte éventuel)
```

---

### Phase 3 — Audio en Temps Réel

**Chunking** : `extractPlayableChunks(minChars=30, maxChars=140)`
- Déclenché pendant le stream SSE (dès 30 chars accumulés)
- Chunks courts → latence perçue faible, premier audio en <500ms

**Endpoint : `POST /api/tts`** → proxy ElevenLabs
- `sanitizeText()` : strip markdown wrappers (gras, italique, code), soften ponctuation (`:` → `,`, `.` → `,` mid-sentence) pour flow vocal naturel
- Résolution voix : `voice_type` → `VOICE_MAP[voice_type]` (5 IDs ElevenLabs, env-overridables)
- `calm_narrator` : voice ID fixe séparé (`ELEVENLABS_VOICE_NARRATOR_FIXED`)
- Model : **`eleven_turbo_v2_5`** (env override `ELEVENLABS_MODEL_ID`)
- Endpoint ElevenLabs : `/v1/text-to-speech/{voice_id}/stream`
- Timeout : 20s (AbortController)
- `voice_settings` : stability + similarity_boost (depuis `EMOTION_PARAMS`), style=0.3, use_speaker_boost=true
- `response.body` pipé directement — **zéro buffering serveur**

**5 archétypes de voix :**

| VoiceType | Env var |
|---|---|
| `authoritative_male` | `ELEVENLABS_VOICE_AUTHORITATIVE_MALE` |
| `warm_female` | `ELEVENLABS_VOICE_WARM_FEMALE` |
| `stressed_young` | `ELEVENLABS_VOICE_STRESSED_YOUNG` |
| `calm_narrator` | `ELEVENLABS_VOICE_CALM_NARRATOR` |
| `gruff_veteran` | `ELEVENLABS_VOICE_GRUFF_VETERAN` |

**Paramètres d'émotion** (`EMOTION_PARAMS`) :

| Émotion | stability | similarity_boost |
|---|---|---|
| calm | 0.75 | 0.75 |
| stressed | 0.30 | 0.50 |
| angry | 0.40 | 0.80 |
| panicked | 0.20 | 0.40 |
| suspicious | 0.55 | 0.70 |

**File TTS client** (`ttsPreloadRef`) :
- Map `chunkId → Promise<string|null>` : prefetch du chunk N+1 pendant lecture du chunk N
- `ttsGenerationRef` (compteur entier) : incrémenté à chaque nouveau tour → annule les générations stales au switch d'agent

---

### Phase 4 — Résolution

**Déclencheurs :**
- LLM appelle `conclude_simulation` → `patch.simulationComplete=true`, `conclusionType`, `finalMessage`
- OU évaluateur `should_advance_act` quand déjà au dernier acte → auto-complete `"success"`

**Score final :**
```typescript
computeWeightedScore(scores): Σ(score × weight) / Σ(weight)  // arrondi entier
```
Poids issus de `evaluation_grid` défini par l'orchestrateur.

**Nouveau endpoint : `POST /api/report`**
- Génère le rapport manager final via `mistral-large-latest` en JSON mode (`responseFormat: json_object`)
- Input : `gameState`, `assessments`, `documentFilename`, `documentContext`, `finalMessage`
- Output : `SimulationReport` enrichi :
  - `executiveSummary`
  - `topCriticalGaps` (preuves + patterns d'échec)
  - `recommendations` (priorisées)
  - `actionablePlan7Days`
  - `decisionTrace`
- Fallback déterministe serveur si génération LLM KO (aucun blocage UI)

**Composants :**
- `SimulationEndOverlay` : ne fait plus de fausse progression temporelle ; CTA explicite "Voir le rapport manager"
- `SkillsReportDashboard` : radar chart + synthèse executive + plan 7 jours + trace décisionnelle

---

### Phase 5 — Positionnement B2B / UX

- Nettoyage des labels legacy côté UI (plus de branding RATP dans le flow principal)
- Metadata app orientée produit (`RAG to RPG — Serious Game Generator`)
- Le bouton `Terminer la simulation` déclenche la génération d'un rapport exploitable manager, puis ouvre le dashboard

---

## 2. Diagramme de Séquence — Un Tour Complet

```mermaid
sequenceDiagram
    participant J as Joueur (Browser)
    participant STT as Web Speech API
    participant UI as page.tsx
    participant CHAT as /api/chat
    participant LLM as Mistral Large
    participant EVAL as Evaluateur (parallel)
    participant TTS as /api/tts
    participant EL as ElevenLabs

    J->>STT: mousedown → recognition.start()
    J->>STT: mouseup → recognition.stop()
    STT->>UI: transcript final (fr-FR)
    UI->>CHAT: POST { playerMessage, gameState, turnsWithCurrentAgent, strugglingTopics }

    CHAT->>LLM: [system: agent prompt + context] + [history -20] + [user msg]
    Note over LLM: mistral-large-latest · temp=0.65 · maxTokens=120 · 5 tools

    par Streaming LLM
        LLM-->>CHAT: content tokens + tool_calls
        CHAT-->>UI: SSE meta (patch initial)
        loop mot par mot (18ms)
            CHAT-->>UI: SSE token
            UI->>UI: extractPlayableChunks(min=30)
            UI->>TTS: POST { text: chunk, voice_type, emotion }
            TTS->>EL: /v1/text-to-speech/{id}/stream (11_turbo_v2_5, 20s timeout)
            EL-->>TTS: audio/mpeg stream
            TTS-->>UI: response.body piped
            UI->>J: Audio playback (prefetch N+1 en parallèle)
        end
        CHAT-->>UI: SSE done (texte complet)
    and Évaluateur parallèle
        CHAT->>EVAL: evaluateExchange(playerMsg, agentResponse, gameState)
        EVAL->>LLM: mistral-large-latest · temp=0.2 · maxTokens=600 · tool=evaluation_update
        LLM-->>EVAL: score_updates[], should_advance_act, should_trigger_chaos
        EVAL-->>CHAT: EvaluationUpdate
        CHAT-->>UI: SSE meta (scores + acte mis à jour)
    end

    alt patch.autoKickoff === true
        UI->>UI: autoKickoffStateRef.set(nextState)
        Note over UI: useEffect([isLoading]) détecte isLoading→false
        UI->>CHAT: POST { kickoff: true, gameState: nextState }
        Note over CHAT: isSwitchKickoff → message contextualisé (key_challenge + trigger_condition + perf joueur)
    end

    Note over UI: Fin de simulation (manuel ou conclude_simulation)
    UI->>/api/report: POST { gameState, assessments, documentContext }
    /api/report->>LLM: mistral-large-latest · json_object · timeout 20s
    LLM-->>/api/report: report JSON manager-ready
    /api/report-->>UI: { report } (ou fallback déterministe)
    UI->>J: SkillsReportDashboard (PDF export via window.print)
```

---

## 3. Gestion du State — Le Cerveau

### `MultiAgentGameState` (type central)

```typescript
{
  agents: AgentState[];          // systemPrompt pré-buildé par agent-factory + RAG
  activeAgentId: string;         // agent qui parle actuellement
  conversationHistory: Message[]; // toute la conversation (slice(-20) envoyé au LLM)
  scores: ScoreEntry[];          // { topic, score: 0-100, weight } par compétence
  totalScore: number;            // computeWeightedScore(scores)
  currentAct: number;            // acte actuel (1-based)
  testedTopics: string[];        // topics déjà testés → évite répétition entre agents
  triggeredEvents: string[];     // log des événements déclenchés
  scenario: Scenario;            // acts[], title, setting, initial_situation
}
```

### Synchronisation SSE → State

Le serveur envoie des **patches partiels** (`patch: Record<string, unknown>`).
Le client fusionne : `nextState = { ...currentState, ...patch }`.

Deux events `meta` par tour :
1. **Avant streaming** : switch d'agent, émotion, événements (décisions synchrones du LLM)
2. **Après streaming** : scores mis à jour, avancement d'acte (résultat async de l'évaluateur)

### Mécanisme Auto-Kickoff

```
switch_agent détecté → patch.autoKickoff=true
→ client stocke nextState dans autoKickoffStateRef
→ useEffect([isLoading]) : quand isLoading passe false
  → sendMultiAgentAction("", { kickoff: true, stateOverride: kickoffState })
  → POST /api/chat avec isSwitchKickoff=true
  → message system contextualisé : key_challenge + trigger_condition + perf joueur
```

Protège contre les boucles : `patch.autoKickoff = !isKickoff` (jamais sur un tour kickoff).

### Isolation des Contextes par Agent

Chaque `AgentState` embarque son `systemPrompt` pré-calculé à l'initialisation :
- Personnalité, motivation, relation joueur
- **Chunks RAG dédiés** : query = rôle + motivation + topics de l'agent → top 5 chunks BM25
- Scenario setting

Les agents ne partagent pas de contexte commun — la cohérence est maintenue par le `buildContext()` injecté à chaque tour (acte courant, scores, événements, topics testés).

---

## Modèles & Variables d'Environnement

| Variable | Usage | Défaut |
|---|---|---|
| `MISTRAL_API_KEY` | Tous les appels Mistral | — |
| `MISTRAL_ORCHESTRATION_MODEL` | Génération du scénario | `mistral-large-latest` |
| `MISTRAL_EVALUATION_MODEL` | Évaluateur silencieux | `mistral-large-latest` |
| `ELEVENLABS_API_KEY` | TTS | — |
| `ELEVENLABS_MODEL_ID` | Modèle ElevenLabs | `eleven_turbo_v2_5` |
| `ELEVENLABS_VOICE_*` | 5 voice IDs + narrator fixe | hardcodés (fallback) |
