# Architecture Technique — RAG to RPG (v2)

Serious game engine B2B : un document de formation → simulation multi-agents voice roleplay.
Stack : Next.js 16 App Router · Mistral AI (via AWS Bedrock) · ElevenLabs · Browser Web Speech API

---

## 1. Vue d'ensemble

```
Document PDF/TXT
       │
  /api/upload          → extraction texte brut
       │
  /api/orchestrate     → SSE : prepareGamePlan() — 3 appels Mistral → GamePlan
       │
  app/page.tsx         → machine d'état React (phases UI)
       │
       ├─ /api/chat    → SSE : Q&A state machine + streaming OpenAI SDK (Bedrock)
       ├─ /api/tts     → ElevenLabs TTS par segment (prefetch parallèle)
       └─ /api/report  → Rapport manager JSON post-simulation
```

**Phases UI :** `upload → ready → orchestrating → game → report`

---

## 2. Pipeline d'orchestration (`app/lib/agents/prepare.ts`)

Au démarrage, 3 appels Mistral séquentiels génèrent le `GamePlan` complet.

### Step 1 — `generateQAPairs()`

| Param | Valeur |
|-------|--------|
| Model | `mistral.mistral-large-3-675b-instruct` |
| Input | `documentText.slice(0, 8000)` |
| Output | `QAPair[]` — questions + réponses attendues + mots-clés + situation RPG |
| maxTokens | 3000 |
| timeout | 30s |

Chaque `QAPair` contient :
- `question` : question directe
- `expected_answer` : 2-4 points clés
- `keywords` : mots discriminants qui doivent apparaître dans une bonne réponse
- `situation` : mini-scénario RPG en 2 phrases que l'agent joue pour poser la question
- `difficulty` : `easy | medium | hard`

### Step 2 — `categorizeQAPairs()`

| Param | Valeur |
|-------|--------|
| Model | `mistral.magistral-small-2509` ← petit modèle, tâche simple |
| Input | liste des questions (IDs + texte) |
| Output | `QACategory[]` — 1 à 4 catégories thématiques |
| maxTokens | 1000 |
| timeout | 15s |

Règles : 1 catégorie par thème, min 2 Q&A / catégorie, max 4 catégories, progression pédagogique.

### Step 3 — `generateAgentsAndScenario()`

| Param | Valeur |
|-------|--------|
| Model | `mistral.mistral-large-3-675b-instruct` |
| Input | résumé des catégories (nom + description + exemple de question) |
| Output | `Agent[]` + `learningAgent` + `Scenario` |
| maxTokens | 2500 |
| timeout | 30s |

Produit :
- **1 agent par catégorie** (personnalités opposées, voix distinctes)
- **1 agent pédagogique** (`warm_female`) — s'active sur les échecs
- **1 scénario** avec 1 acte par catégorie

**Fallback** : si un step échoue → `fallbackGamePlan()` avec données génériques (M. Durand, 5 Q&A basiques).

**Type produit** :
```typescript
GamePlan = {
  categories: QACategory[];
  qaPairs:    QAPair[];
  agents:     Agent[];          // 1 par catégorie
  learningAgent: Agent;         // warm_female
  scenario:   Scenario;         // acts[]
}
```

### SSE events `/api/orchestrate`

```
status → status → ... → scenario → new_agent (×N, 80ms) → evaluation_grid → ready
```

---

## 3. Machine d'état Q&A (`/api/chat/route.ts`)

Chaque réponse du joueur passe par cette machine d'état côté serveur :

```
ASKING ──── correct ──────────────────────────────► Q suivante (ou catégorie suivante)
   │
   └── incorrect (1ère fois) → REPHRASING
              │
         correct ──────────────────────────────────► Q suivante
              │
         incorrect (2ème fois) → LEARNING (agent pédagogique)
                    │
               "compris" → RE_ASKING
                    │
               correct ──────────────────────────────► Q suivante
```

**`InteractionState` — la position dans la machine :**
```typescript
{
  phase:               "ASKING" | "REPHRASING" | "LEARNING" | "RE_ASKING" | "COMPLETE"
  currentCategoryIndex: number;
  currentQAIndex:       number;
  failCount:            0 | 1 | 2;
  completedQAs:         string[];    // IDs des Q&A réussis
  failedQAs:            string[];    // IDs des Q&A échoués
  currentQAPairId:      string;
}
```

**Évaluation** : appel `mistralChat()` en JSON mode (pas de streaming) — compare la réponse joueur aux `keywords` et `expected_answer`. Retourne `{ correct: boolean, feedback: string }`.

**Scoring par tentative :**

| Phase | Points |
|-------|--------|
| ASKING (1ère tentative) | +15 |
| RE_ASKING (après REPHRASING) | +8 |
| RE_ASKING (après LEARNING) | +3 |
| Échec → REPHRASING | −20% du score max |
| Échec → LEARNING | −30% du score max |

**Avancement automatique :**
- Toutes les Q&A d'une catégorie terminées → switch vers l'agent de la catégorie suivante
- Toutes les catégories terminées → `COMPLETE` → rapport

### Tools (function calling) dans `/api/chat`

| Tool | Déclenchement | Effet |
|------|---------------|-------|
| `update_emotion` | Après chaque réponse joueur | Change `emotion` → voix TTS + couleur fond |
| `trigger_event` | Contextuel | Ajoute à `triggeredEvents` (narratif) |

> Note : `switch_agent` n'est **plus** un tool. L'avancement entre agents est **déterministe** — piloté par la machine d'état Q&A, pas par le LLM.

---

## 4. Système d'agents

### Voix (`app/lib/voice/voices.ts`)

| `voice_type` | Caractère | Env var |
|-------------|-----------|---------|
| `authoritative_male` | Directeur pressé | `ELEVENLABS_VOICE_AUTHORITATIVE_MALE` |
| `warm_female` | Bienveillante (formatrice) | `ELEVENLABS_VOICE_WARM_FEMALE` |
| `stressed_young` | Junior stressé | `ELEVENLABS_VOICE_STRESSED_YOUNG` |
| `calm_narrator` | Narrateur (`*astérisques*`) | `ELEVENLABS_VOICE_CALM_NARRATOR` |
| `gruff_veteran` | Vétéran bourru | `ELEVENLABS_VOICE_GRUFF_VETERAN` |

### Émotions dynamiques (`EMOTION_PARAMS`)

| Émotion | stability | speed | style |
|---------|-----------|-------|-------|
| `calm` | 0.75 | 1.0 | 0.1 |
| `stressed` | 0.30 | 1.2 | 0.65 |
| `angry` | 0.40 | 1.1 | 0.80 |
| `panicked` | 0.20 | 1.4 | 0.95 |
| `suspicious` | 0.55 | 0.95 | 0.40 |

L'émotion est déclenchée par `update_emotion` et affecte :
- Les paramètres ElevenLabs (stability, similarity_boost, speed, style)
- La couleur de fond de l'interface (transition CSS 0.8s)
- La couleur du badge émotion dans `ActiveAgentDisplay`

### Agent pédagogique (`learningAgent`)

- `voice_type: warm_female`, toujours le même quelque soit le document
- S'active sur le **2ème échec consécutif** d'une Q&A
- Explique la bonne réponse, puis dit "Je vous repasse [nom agent catégorie]"
- Après confirmation du joueur → `RE_ASKING` de la même question

### Transition entre agents (switch déterministe)

1. Toutes les Q&A de la catégorie courante terminées → l'agent sortant dit "Je vous passe [nom suivant]"
2. `autoKickoffStateRef` stocke le prochain état
3. Pendant le TTS de la phrase d'adieu, `prefetchedResponseRef` lance déjà le `fetch("/api/chat")` suivant
4. Quand TTS finit → `doKickoff()` → `displayActiveAgentId` mis à jour immédiatement → streaming du nouvel agent commence (réponse déjà là)

### Mémoire partagée inter-agents (`SharedMemoryNote`)

L'orchestrateur peut injecter des notes d'un agent à un autre (ex : "joueur faible sur sujet X") — utilisées dans les system prompts des agents entrants.

---

## 5. Pipeline TTS (`/api/tts/route.ts`)

### Segmentation

- Texte avec `*astérisques*` → voix `calm_narrator` (didascalies narrateur)
- Reste → voix de l'agent actif + paramètres d'émotion

### Prefetch parallèle

`enqueueTtsSegment()` appelle immédiatement `getOrCreateTtsPromise(chunk)` → le chunk N+1 est fetchné pendant la lecture du chunk N. Résultat : zéro pause entre segments.

### File TTS

`ttsQueueRef` traité séquentiellement par `processTtsQueue()`. Le `ttsGenerationRef` (entier incrémenté) invalide les promesses stales si un nouveau tour commence.

### ElevenLabs

- Model : `eleven_multilingual_v2`
- Endpoint : `/v1/text-to-speech/{voice_id}` (réponse complète, pas streaming)
- Timeout : 15s

---

## 6. RAG (`app/lib/rag.ts`)

BM25 maison (zéro dépendance externe) :
- Chunking : overlapping chunks sur le document source
- `buildRagIndex(text)` → `termFreq` + `docFreq` par chunk
- `retrieveRelevantChunks(index, query, k)` → top-k chunks par score BM25
- Stop words français, normalisation Unicode + accent stripping

Utilisé dans les system prompts des agents : chaque agent reçoit les chunks les plus pertinents selon son rôle + ses `knowledge_topics`.

---

## 7. Rapport manager (`/api/report/route.ts`)

Déclenché manuellement à la fin de la simulation.

**Input :** `gameState`, `assessments[]`, `documentFilename`, `documentContext`

**LLM :** `mistral.mistral-large-3-675b-instruct`, JSON mode, `maxTokens: 1200`, `timeout: 20s`

**Output `SimulationReport` :**
```typescript
{
  globalWeightedScore:   number;          // score pondéré final
  executiveSummary:      string;          // 1-2 phrases
  topCriticalGaps:       CriticalGap[];   // 2-3 lacunes critiques
  recommendations:       SkillRecommendation[]; // actions priorisées
  actionablePlan7Days:   string[];        // 3 actions concrètes
  failurePatternAnalysis: FailurePattern[]; // 1-2 patterns récurrents
  employeeVibe:          EmployeeVibe;    // ton, résistance au stress, synthèse
}
```

**Fallback déterministe** (`buildFallbackReport()`) si le LLM échoue — aucun blocage UI.

**UI** : `SkillsReportDashboard` — `position: fixed; inset: 0` pour scroll indépendant du body (`overflow: hidden`).

---

## 8. State central (`MultiAgentGameState`)

```typescript
{
  scenario:           Scenario;
  currentAct:         number;
  agents:             AgentState[];         // systemPrompt pré-buildé + émotion
  activeAgentId:      string;
  conversationHistory: Message[];
  scores:             Array<{ topic, score, weight }>;
  totalScore:         number;               // computeWeightedScore(scores)
  triggeredEvents:    string[];
  gamePlan:           GamePlan;             // Q&A + catégories + agents
  interactionState:   InteractionState;     // position machine d'état Q&A
  sharedMemory:       SharedMemoryNote[];   // notes inter-agents
}
```

Patches partiels envoyés via SSE → client merge : `nextState = { ...currentState, ...patch }`.

---

## 9. API Routes

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/upload` | POST | Extraction texte PDF/TXT (multipart) |
| `/api/orchestrate` | POST | SSE — `prepareGamePlan()` (3 appels Mistral via Bedrock) |
| `/api/chat` | POST | SSE — Q&A state machine + streaming OpenAI SDK (Bedrock) |
| `/api/tts` | POST | ElevenLabs TTS → audio (base64 ou stream) |
| `/api/report` | POST | Rapport manager JSON |

---

## 10. Composants UI

| Composant | Rôle |
|-----------|------|
| `AgentGenerationView` | Vue SSE orchestration — agents apparaissent au fil du SSE |
| `ActiveAgentDisplay` | Nom + rôle + badge émotion de l'agent actif |
| `DialogueBox` | Texte streamé + curseur animé |
| `ObjectiveHUD` | Acte en cours + barre de score pondéré colorée |
| `KnowledgeHeatmap` | Grille par catégorie — score coloré temps réel |
| `MissionFeed` | Terminal orchestration live (bas panneau droit) |
| `SidePanel` | Panneau droit — KnowledgeHeatmap + MissionFeed |
| `SkillsReportDashboard` | Rapport manager (position:fixed, scroll indépendant) |
| `PushToTalk` | STT Web Speech API `fr-FR` |
| `ActTransitionOverlay` | Animation transition entre actes |
| `SimulationEndOverlay` | Écran fin de simulation + CTA rapport |

---

## 11. Variables d'environnement

```env
# AWS Bedrock (via endpoint OpenAI-compatible)
OPENAI_API_KEY=bedrock-api-key-...        # token pré-signé AWS (validité 12h)
OPENAI_BASE_URL=https://bedrock-mantle.us-east-1.api.aws/v1
AWS_BEARER_TOKEN_BEDROCK=...              # bearer token brut (référence)

# ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_AUTHORITATIVE_MALE=BUJMBsQ3Oq4cEeWSb48y
ELEVENLABS_VOICE_WARM_FEMALE=imRmmzTqlLHt9Do1HufF
ELEVENLABS_VOICE_STRESSED_YOUNG=Xgb3SR8idOHy8scGICeJ
ELEVENLABS_VOICE_CALM_NARRATOR=BVBq6HVJVdnwOMJOqvy9
ELEVENLABS_VOICE_GRUFF_VETERAN=F9KUTOne5xOKqAbIU7yg
```

> ⚠️ Le token `OPENAI_API_KEY` expire après **12 heures**. Le régénérer depuis la console hackathon si l'API retourne 401.

---

## 12. Client LLM (`app/lib/agents/mistral-client.ts`)

Toutes les routes LLM passent par `mistralChat()` et `bedrockClient` (instance partagée `OpenAI`).

### Mapping modèles

| Nom logique | Modèle Bedrock |
|-------------|---------------|
| `mistral-large-latest` (défaut) | `mistral.mistral-large-3-675b-instruct` |
| `mistral-small-latest` | `mistral.magistral-small-2509` |

### Interface `mistralChat()`

```typescript
mistralChat({
  model?:         string;             // "mistral-large-latest" par défaut
  messages:       ChatMessage[];
  tools?:         ToolDefinition[];
  toolChoice?:    "any"|"auto"|"none"|{...};  // "any" → "required" (OpenAI compat)
  temperature?:   number;             // défaut 0.4
  maxTokens?:     number;             // défaut 800
  timeoutMs?:     number;             // défaut 15000
  responseFormat?: { type: "json_object" };
})
```

Le streaming dans `/api/chat` utilise `bedrockClient.chat.completions.create({ stream: true })` directement.

---

## 13. Structure des fichiers

```
app/
├── page.tsx                          # Composant racine — toute la logique client
├── globals.css                       # body overflow:hidden + fonts + animations
├── api/
│   ├── upload/route.ts               # Extraction texte
│   ├── orchestrate/route.ts          # SSE GamePlan
│   ├── chat/route.ts                 # SSE Q&A state machine + function calling
│   ├── tts/route.ts                  # ElevenLabs TTS
│   └── report/route.ts               # Rapport manager
├── lib/
│   ├── types.ts                      # Tous les types TypeScript
│   ├── rag.ts                        # BM25 index + retrieval
│   ├── sfx.ts                        # Effets sonores
│   ├── agents/
│   │   ├── mistral-client.ts         # Client OpenAI→Bedrock + helper mistralChat()
│   │   ├── prepare.ts                # Pipeline orchestration 3 steps
│   │   ├── orchestrator.ts           # (legacy, non utilisé en v2)
│   │   ├── evaluator.ts              # (legacy, non utilisé en v2)
│   │   └── agent-factory.ts          # (legacy, non utilisé en v2)
│   └── voice/
│       └── voices.ts                 # VOICE_MAP + EMOTION_PARAMS
└── components/
    ├── AgentGenerationView.tsx
    ├── ActiveAgentDisplay.tsx
    ├── DialogueBox.tsx
    ├── ObjectiveHUD.tsx
    ├── KnowledgeHeatmap.tsx
    ├── MissionFeed.tsx
    ├── SidePanel.tsx
    ├── SkillsReportDashboard.tsx
    ├── PushToTalk.tsx
    ├── TextInput.tsx
    ├── FileUpload.tsx
    ├── ActTransitionOverlay.tsx
    ├── SimulationEndOverlay.tsx
    └── ...
```

---

## 14. Démarrage local

```bash
npm install
cp .env.example .env.local   # remplir OPENAI_API_KEY + OPENAI_BASE_URL + ELEVENLABS_API_KEY
npm run dev
# → http://localhost:3000
```

Uploader un PDF ou TXT → lancer l'orchestration → jouer la simulation → consulter le rapport manager.
