# YouGotIt — Documentation technique

## Architecture

```
app/
├── api/
│   ├── auth/
│   │   ├── login/            # POST — Authentification email/password
│   │   ├── logout/           # POST — Deconnexion
│   │   └── signup/           # POST — Inscription (token requis pour manager)
│   ├── chat/                 # POST — SSE : machine a etats Q&A + evaluation
│   ├── deepgram/             # GET — Cle temporaire Deepgram pour STT client
│   ├── enrollments/[id]/
│   │   └── save/             # POST — Sauvegarde progression (verrou optimiste)
│   ├── orchestrate/          # POST — SSE : generation du game plan (3 appels LLM)
│   ├── report/               # POST — Generation rapport de competences
│   ├── trainings/
│   │   ├── create/           # POST — Creation formation + upload document
│   │   ├── join/             # POST — Rejoindre formation par code (student)
│   │   └── [id]/
│   │       ├── GET/DELETE    # Lecture/suppression formation
│   │       ├── publish/      # POST — Publication + generation game plan
│   │       └── enrollments/  # GET — Liste inscriptions (analytics manager)
│   ├── tts/                  # POST — Synthese vocale ElevenLabs
│   └── upload/               # POST — Extraction texte PDF/TXT
├── components/
│   ├── dashboard/            # TrainingCard, EnrollmentCard, CreateTrainingModal,
│   │                         # TrainingAnalyticsModal, EmptyState, DashboardLayout
│   ├── ActiveAgentDisplay    # Agent actif avec badge emotion
│   ├── AgentGenerationView   # Phase d'orchestration (graphe SVG anime)
│   ├── AgentPanel            # Liste agents + journal d'evenements
│   ├── DialogueBox           # Dialogue avec effet typewriter
│   ├── EmotionIndicator      # Jauge emotion avec intensite et trajectoire
│   ├── KnowledgeHeatmap      # Scores par categorie
│   ├── MissionFeed           # Journal de mission temps reel
│   ├── ObjectiveHUD          # Acte + score + progression
│   ├── PushToTalk            # Bouton micro + preview transcript
│   ├── SkillsReportDashboard # Rapport final (radar, matrice, recommandations)
│   ├── ActTransitionOverlay  # Transition entre actes
│   ├── SimulationEndOverlay  # Ecran fin de simulation
│   ├── FileUpload            # Upload PDF/TXT avec drag-drop
│   └── TextInput             # Saisie texte alternative
├── hooks/
│   └── useDeepgramSTT        # Hook STT via WebSocket Deepgram
├── lib/
│   ├── agents/
│   │   ├── openai-client     # Client OpenAI type avec retry (429/5xx)
│   │   ├── prepare           # Pipeline 3 etapes : Q&A → categories → agents
│   │   ├── orchestrator      # Generation SimulationSetup
│   │   └── agent-factory     # Construction system prompts avec RAG
│   ├── game/
│   │   └── state             # Init game state, scoring, switch agent
│   ├── supabase/
│   │   ├── client            # Client navigateur (anon key)
│   │   ├── server            # Client serveur (cookies)
│   │   ├── admin             # Client service_role (bypass RLS)
│   │   └── middleware        # Refresh session Next.js
│   ├── voice/
│   │   └── voices            # VOICE_MAP + EMOTION_PARAMS ElevenLabs
│   ├── emotion-engine        # Machine a etats emotion (deterministe, sans LLM)
│   ├── rag                   # BM25 chunking + retrieval (zero dependance)
│   ├── sfx                   # Effets sonores proceduraux (Web Audio API)
│   ├── api-utils             # Helper reponse erreur securisee
│   └── types                 # Types TypeScript centraux
├── providers/
│   └── AuthProvider          # Contexte auth (signUp, signIn, signOut, profile)
├── dashboard/
│   ├── layout                # DashboardLayout (sidebar collapsible + auth guard)
│   ├── manager/page          # Dashboard manager (formations, analytics)
│   └── student/page          # Dashboard apprenant (inscriptions, progression)
├── auth/
│   └── callback/             # OAuth callback handler
├── layout.tsx                # Root layout + AuthProvider
└── page.tsx                  # Landing + simulation immersive
```

---

## Base de donnees (Supabase)

### Tables

**profiles** *(auto-cree par trigger Supabase Auth)*

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID PK | FK vers auth.users |
| role | text | `manager` / `student` |
| full_name | text | Nom complet |
| avatar_url | text? | Avatar optionnel |

**trainings**

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID PK | |
| manager_id | UUID FK | Proprietaire |
| title | text | Titre de la formation |
| status | text | `draft` / `processing` / `published` |
| document_text | text | Contenu brut du document |
| document_filename | text | Nom du fichier original |
| document_path | text? | Chemin storage Supabase |
| game_plan | jsonb? | Plan de jeu genere par l'IA |
| join_code | text unique | Code d'acces (auto-genere par trigger) |
| max_students | int | Limite d'inscrits |

**enrollments**

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID PK | |
| student_id | UUID FK | Apprenant |
| training_id | UUID FK | Formation |
| status | text | `not_started` / `in_progress` / `completed` |
| score | int? | Score actuel |
| total_questions | int? | Nombre total de Q&A |
| correct_answers | int? | Reponses correctes |
| game_state | jsonb? | Etat de jeu serialise (pause/reprise) |
| chat_history | jsonb? | Historique conversation |
| version | int | Verrou optimiste |
| last_played_at | timestamp? | Derniere activite |

**manager_invites** *(acces service_role uniquement — aucune politique RLS publique)*

| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID PK | |
| token | text unique | Code d'invitation |
| company_name | text? | Nom de l'entreprise |
| is_used | boolean | Token consomme ? |

### RLS

| Table | Politique |
|-------|-----------|
| profiles | Lecture propre profil |
| trainings | Manager CRUD propres formations, student lecture published |
| enrollments | Student RW propres inscriptions, manager lecture pour ses formations |
| manager_invites | Aucune politique publique — service_role uniquement |

### Clients Supabase

| Fichier | Cle | Usage |
|---------|-----|-------|
| `supabase/client.ts` | anon key | Navigateur (AuthProvider) |
| `supabase/server.ts` | anon key + cookies | API routes (contexte user) |
| `supabase/admin.ts` | service_role key | Operations admin (bypass RLS) |

---

## Authentification

### Inscription Manager (avec token)

```
POST /api/auth/signup { email, password, fullName, role: "manager", inviteToken }
  │
  ├── Valide email + password
  ├── Verifie token dans manager_invites (admin client, bypass RLS)
  │   └── token existe ET is_used = false ?
  ├── Marque is_used = true
  ├── supabase.auth.signUp() avec role dans metadata
  │   └── Si echec → rollback is_used = false
  └── Retourne { user }
```

### Inscription Student (libre)

```
POST /api/auth/signup { email, password, fullName, role: "student" }
  └── Pas de token requis
```

### Session

`proxy.ts` (middleware Next.js) appelle `updateSession()` sur chaque requete pour rafraichir les cookies auth Supabase.

---

## Pipeline de generation (`prepareGamePlan`)

3 appels LLM sequentiels (`gpt-4.1-mini`) :

**Step 1 — Q&A Generation** (temp 0.3)
- Input : document text (max 100k chars)
- Output : 5-25 `QAPair[]` avec `question`, `expected_answer`, `keywords`, `situation`, `source_excerpt`, `difficulty`
- Regle : chaque Q&A doit citer un passage exact du document (zero hallucination)

**Step 2 — Categorisation** (temp 0.2)
- Input : liste des Q&A
- Output : 1-4 `QACategory[]` thematiques, progression pedagogique

**Step 3 — Agents + Scenario** (temp 0.4)
- Output : 1 agent par categorie + 1 learning agent (`warm_female`) + scenario multi-actes
- Voix assignees par personnalite (detection noms feminins)

Fallback hardcode si le pipeline echoue.

### SSE `/api/orchestrate`

```
status → status → ... → scenario → new_agent (×N) → evaluation_grid → ready
```

---

## Machine a etats Q&A (`/api/chat`)

```
ASKING ──── correct ──────────────────────► Q&A suivante / COMPLETE
   │
   └── incorrect (fail=0) → REPHRASING
              │
         correct ──────────────────────────► Q&A suivante
              │
         incorrect (fail=1) → LEARNING (agent pedagogique explique)
                    │
               "compris" → RE_ASKING
                    │
               reponse ────────────────────► Q&A suivante
```

### Scoring

Chaque categorie vaut 100 points, repartis entre ses Q&A :

| Tentative | Multiplicateur |
|-----------|---------------|
| 1ere reponse correcte | x1.0 |
| Apres rephrasing | x0.6 |
| Apres learning | x0.3 |

Penalites : -20% (1er echec), -30% (2eme), -15% (apres learning).

Score total = moyenne ponderee des categories.

### SSE `/api/chat`

```
meta (patch + emotion) → token (dialogue incremental) → done (etat final)
```

---

## Systeme vocal

### TTS (ElevenLabs)

| Voice type | Usage |
|------------|-------|
| `authoritative_male` | Agent senior/directeur |
| `warm_female` | Learning agent / agent bienveillant |
| `stressed_young` | Agent junior sous pression |
| `gruff_veteran` | Agent terrain experimente |
| `calm_narrator` | Didascalies (`*texte entre asterisques*`) |

Parametres modules par emotion :

| Emotion | stability | speed | style |
|---------|-----------|-------|-------|
| calm | 0.75 | 1.0 | 0.1 |
| stressed | 0.30 | 1.2 | 0.65 |
| angry | 0.40 | 1.1 | 0.80 |
| panicked | 0.20 | 1.4 | 0.95 |
| suspicious | 0.55 | 0.95 | 0.40 |

### STT (Deepgram)

- Modele `nova-2`, langue `fr`, WebSocket streaming
- Interim results (preview live) + resultats finaux
- Detection activite vocale (VAD), silence 1.5s
- Cle temporaire generee cote serveur (`/api/deepgram`)
- Cross-browser : opus (Chrome/Firefox) ou aac (Safari)

---

## Moteur d'emotions

Machine a etats deterministe (sans LLM) dans `emotion-engine.ts` :

| Evenement | Emotion resultante | Intensite |
|-----------|--------------------|-----------|
| Bonne reponse (1er essai) | pleased | 0.4 ↓ |
| Bonne reponse (apres echec) | relieved | 0.3 ↓ |
| Mauvaise reponse (fail <= 1) | annoyed | +0.15 ↑ |
| Mauvaise reponse (fail >= 2) | angry | max(0.7) ↑ |
| Hesitation (> 15s) | suspicious | +0.10 ↑ |
| Fin apprentissage | neutral | 0.2 = |

L'emotion influence :
- Le prompt agent (instruction de ton)
- Les parametres TTS ElevenLabs
- L'UI (badge emotion, couleurs)

Decay naturel : intensite -0.1 par tour si cooling.

---

## RAG

BM25 maison (zero dependance) dans `rag.ts` :

- Chunking : 750 chars, overlap 120 chars
- Tokenisation : lowercase + NFD + stop words francais
- Scoring : BM25 (k1=1.2, b=0.75)
- Top-K chunks injectes dans le system prompt de chaque agent
- Garantit l'ancrage des reponses dans le document source

---

## Securite

- Headers de securite en production (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- CSP desactivee en dev (HMR Next.js)
- RLS Supabase sur toutes les tables
- Tokens manager a usage unique avec rollback si signup echoue
- `SUPABASE_SERVICE_ROLE_KEY` jamais expose cote client (pas de prefixe `NEXT_PUBLIC_`)
- Cle Deepgram temporaire (cle principale jamais au client)
- Validation input TTS (1000 chars max, voice ID alphanumerique)
- Verrou optimiste sur les sauvegardes d'enrollment (`version`)
- Verification ownership sur tous les endpoints manager
- `Cache-Control: no-store` sur toutes les routes API

---

## Dependances

| Categorie | Package | Version |
|-----------|---------|---------|
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

- **React Compiler** active (`next.config.ts`)
- **Tailwind CSS 4** zero-config via PostCSS
- **TypeScript** strict mode, target ES2017, path alias `@/*`
- **ESLint** flat config, extends `eslint-config-next`
