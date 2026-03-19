# Copilot Analytics — Design Spec

## Problem

Le manager (RH) n'a aucune visibilité sur les parties de sa formation qui posent le plus de difficultés aux apprenants. Le Copilot de formation est utilisé par les étudiants pour poser des questions sur le document, mais ces interactions sont perdues — aucune donnée n'est collectée ni présentée au manager.

## Solution

Collecter anonymement chaque question posée au Copilot avec les chunks RAG utilisés pour y répondre, puis agréger par section/thème du document pour présenter au manager un classement des sujets les plus demandés.

## Architecture — 3 couches

### 1. Enrichissement des chunks à l'ingestion (section labeling)

**Stratégie hybride headings-first, LLM fallback :**

#### Étape A — Détection de headings par regex

Dans `chunkDocument()` (`app/lib/copilot/chunking.ts`), ajouter une passe de détection de headings avant le chunking :

- Patterns détectés : lignes Markdown (`# Titre`), lignes en MAJUSCULES suivies d'un saut de ligne, lignes numérotées (`1.`, `1.1`, `A)`, `I.`), lignes courtes (<80 chars) suivies d'un double saut de ligne
- Chaque chunk hérite du dernier heading détecté qui précède sa position `startChar`
- Nouveau champ sur `TextChunk` : `sectionTitle: string | null`

#### Étape B — LLM fallback avec taxonomie stricte

Si <50% des chunks ont un `sectionTitle` après la détection regex, déclencher un appel LLM one-shot dans `ingestDocument()` :

**Modèle** : `gpt-4.1-mini` (via le client OpenAI existant)

**Prompt en 2 temps (single call, JSON mode) :**

1. **Extraire une taxonomie** : le LLM reçoit un résumé de tous les chunks et produit d'abord une liste stricte de 5-8 thèmes globaux couvrant l'ensemble du document
2. **Assigner chaque chunk** : pour chaque chunk (identifié par son index), le LLM assigne exactement l'un des thèmes de la taxonomie

**Format de réponse attendu :**
```json
{
  "themes": ["Thème 1", "Thème 2", "..."],
  "assignments": {
    "0": "Thème 1",
    "1": "Thème 2",
    "2": "Thème 1"
  }
}
```

Cette approche en 2 temps garantit qu'aucun label en double n'apparaîtra (pas de "Remboursement" vs "Remboursements") puisque chaque chunk est assigné à un thème de la liste fermée.

**Gestion des gros documents** : si le texte total dépasse la fenêtre de contexte, envoyer un résumé (premières phrases de chaque chunk) plutôt que le contenu intégral.

#### Stockage

Colonne ajoutée : `document_chunks.section_title TEXT` (nullable, peuplée à l'ingestion).

### 2. Logging anonyme au runtime

#### Nouvelle table `copilot_queries`

```sql
CREATE TABLE copilot_queries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  query_text  TEXT NOT NULL,
  chunk_ids   JSONB NOT NULL,  -- array de chunk_index, ex: [2, 5, 12]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_copilot_queries_training ON copilot_queries(training_id);
```

**Pas de `user_id`** — les questions sont anonymes par design (on ne flique pas les élèves, on repère les trous dans le document).

**`query_text`** — le texte exact de la question posée par l'apprenant. Permet au manager de comprendre le contexte derrière les chiffres.

#### RLS

- INSERT : utilisateurs authentifiés ayant un enrollment sur ce `training_id` OU étant le manager owner
- SELECT : manager owner du training uniquement

#### Insertion dans le copilot API

Dans `app/api/copilot/[trainingId]/route.ts`, après le `match_chunks` et avant le stream :

```typescript
// Fire-and-forget avec waitUntil pour survie en serverless (Vercel)
const insertPromise = supabase.from("copilot_queries").insert({
  training_id: trainingId,
  query_text: safeMessage,
  chunk_ids: chunks.map(c => c.chunk_index),
});

// Utiliser waitUntil de Next.js pour que l'insert survive après la fin du stream
// Import: import { after } from 'next/server'
after(insertPromise);
```

`after()` (Next.js 15+) garantit que la Promise s'exécute même après que la Response SSE est envoyée et la fonction serverless terminée. C'est l'équivalent officiel de `waitUntil` pour Next.js sur Vercel.

### 3. API Analytics + UI

#### Nouvel endpoint `GET /api/trainings/[trainingId]/copilot-analytics`

**Auth** : manager owner du training uniquement.

**Query SQL** :
- Dénormaliser `copilot_queries.chunk_ids` (JSONB array) en lignes
- Joindre sur `document_chunks` via `training_id` + `chunk_index`
- Grouper par `section_title`, compter les occurrences
- Ordonner par count décroissant

**Response :**
```json
{
  "sections": [
    { "title": "Gestion des réclamations", "queryCount": 42, "percentage": 35 },
    { "title": "Politique de remboursement", "queryCount": 28, "percentage": 23 }
  ],
  "totalQueries": 120,
  "recentQueries": [
    { "text": "Comment traiter une réclamation urgente ?", "sectionTitle": "Gestion des réclamations", "createdAt": "2026-03-19T..." },
    ...
  ]
}
```

`recentQueries` : les 20 dernières questions posées, avec leur section associée. Permet au manager de lire le contexte exact.

#### UI — Onglet dans TrainingAnalyticsModal

**Système d'onglets** ajouté dans `TrainingAnalyticsModal.tsx` :
- Onglet **"Apprenants"** : le contenu existant (enrollments, scores, progression)
- Onglet **"Copilot"** : le nouveau contenu analytics

**Contenu de l'onglet Copilot :**

1. **Header stats** (3 cards en grid, même style que les stats existantes) :
   - Total questions posées au Copilot
   - Nombre de sections/thèmes couverts
   - Section #1 la plus demandée (nom + count)

2. **Classement des sections** :
   - Liste ordonnée par nombre de questions (décroissant)
   - Chaque ligne : rang, nom de la section, barre de progression horizontale (proportionnelle au max), count, pourcentage
   - Design : `var(--corp-blue)` pour les barres, style cohérent avec le design system corp existant

3. **Questions récentes** :
   - Liste scrollable des 20 dernières questions posées
   - Chaque entrée : texte de la question + badge de la section associée + date relative
   - Permet au manager de lire le contexte exact derrière les chiffres

4. **Empty state** : si aucune question posée au copilot, message informatif ("Aucune question posée au Copilot pour le moment. Les données apparaîtront dès que vos apprenants utiliseront le Copilot.")

**Animations** : `framer-motion` pour les transitions d'onglets et l'apparition des barres de progression (staggered).

**Inline styles** : cohérent avec le pattern existant du projet (pas de classes Tailwind dans les composants dashboard).

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `app/lib/copilot/chunking.ts` | Ajouter détection de headings regex, `sectionTitle` sur `TextChunk` |
| `app/lib/copilot/ingest.ts` | Ajouter labeling LLM fallback (taxonomie stricte), stocker `section_title` |
| `app/api/copilot/[trainingId]/route.ts` | Ajouter insert `copilot_queries` via `after()` |
| `app/api/trainings/[trainingId]/copilot-analytics/route.ts` | **Nouveau** — GET analytics agrégées |
| `app/components/dashboard/TrainingAnalyticsModal.tsx` | Ajouter tabs + onglet Copilot (stats, classement, questions récentes) |
| DB migration | `ALTER TABLE document_chunks ADD section_title TEXT` + `CREATE TABLE copilot_queries` + RLS + index |

## Hors scope

- Pas de filtre par date sur les analytics (v1 simple)
- Pas d'export CSV des questions
- Pas de dashboard temps réel / websocket
- Pas de catégorisation des questions du jeu principal (uniquement le Copilot)
