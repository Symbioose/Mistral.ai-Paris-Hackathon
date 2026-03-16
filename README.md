# YouGotIt

SaaS B2B de formation gamifiee par mise en situation. Un manager upload un document, l'app genere un scenario multi-agents avec des Q&A via OpenAI. L'apprenant interagit vocalement avec des personnages IA qui le testent sur le contenu. En fin de session, un rapport de competences est genere.

## Fonctionnalites

**Manager**
- Inscription par token d'invitation B2B
- Upload de documents PDF/TXT, generation automatique de formations
- Publication avec code d'acces pour les apprenants
- Dashboard analytics : progression, scores, taux de completion par apprenant

**Apprenant**
- Inscription libre, rejoindre une formation via un code
- Simulation immersive avec agents IA vocaux (TTS/STT)
- Pause/reprise de session
- Rapport de competences en fin de session

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 + Framer Motion |
| Auth & DB | Supabase (Auth + PostgreSQL + Storage + RLS) |
| LLM | OpenAI `gpt-4.1-mini` (preparation) + `gpt-4.1-nano` (temps reel) |
| TTS | ElevenLabs `eleven_turbo_v2_5` (5 voix, modulation emotionnelle) |
| STT | Deepgram `nova-2` (WebSocket streaming, francais) |
| SFX | Web Audio API (procedural) |

## Demarrage rapide

```bash
git clone <repo-url>
cd mistral_game
npm install
cp .env.example .env.local
# Remplir les variables dans .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Variables d'environnement

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

## Creer un token d'invitation Manager

L'inscription manager est protegee par un systeme de tokens d'invitation a usage unique. Seul l'admin de la base de donnees peut en creer.

**Via le SQL Editor de Supabase :**

```sql
-- Creer un token
INSERT INTO public.manager_invites (token, company_name)
VALUES ('MON-TOKEN-SECRET', 'Nom de l entreprise');

-- Verifier les tokens existants
SELECT token, company_name, is_used, created_at
FROM public.manager_invites
ORDER BY created_at DESC;

-- Reinitialiser un token (si necessaire)
UPDATE public.manager_invites
SET is_used = false
WHERE token = 'MON-TOKEN-SECRET';
```

Le token est consomme automatiquement (`is_used = true`) lors de l'inscription. Si l'inscription echoue, le token est restaure.

## Comment ca marche

1. **Upload** — Le manager depose un document PDF ou TXT
2. **Orchestration** — 3 appels LLM generent Q&A, categories et agents (~10s)
3. **Simulation** — L'apprenant repond vocalement, les agents reagissent avec emotion
4. **Rapport** — Analyse de competences avec lacunes et recommandations

### Machine a etats Q&A

```
ASKING ──(correct)──────────────────────► Q&A suivante
   │
   └──(incorrect)──► REPHRASING ──(correct)──► Q&A suivante
                         │
                         └──(incorrect)──► LEARNING (agent pedagogique)
                                              │
                                         (confirmation)
                                              │
                                         RE_ASKING ──► Q&A suivante
```

### Scoring

Chaque categorie vaut 100 points :

| Tentative | Multiplicateur |
|-----------|---------------|
| 1ere reponse correcte | x1.0 |
| Apres rephrasing | x0.6 |
| Apres learning | x0.3 |

## Scripts

```bash
npm run dev    # Serveur de developpement
npm run build  # Build de production
npm run start  # Serveur de production
npm run lint   # ESLint
```

## Hackathon

Mistral AI Worldwide Hackathon — Paris, Feb 28 – Mar 1, 2026 (Track 01 — AWS)

## Licence

Projet prive.
