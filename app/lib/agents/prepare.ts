import { Agent, GamePlan, QAPair, QACategory, Scenario } from "@/app/lib/types";
import { mistralChat } from "@/app/lib/agents/mistral-client";

const MODEL = process.env.MISTRAL_ORCHESTRATION_MODEL || "mistral-large-latest";

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

function extractJson<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      const arrStart = trimmed.indexOf("[");
      const arrEnd = trimmed.lastIndexOf("]");
      if (arrStart === -1 || arrEnd <= arrStart) return null;
      try {
        return JSON.parse(trimmed.slice(arrStart, arrEnd + 1)) as T;
      } catch {
        return null;
      }
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1: Document → Q&A pairs
// ---------------------------------------------------------------------------

async function generateQAPairs(documentText: string): Promise<QAPair[]> {
  const docLength = documentText.length;
  const targetCount = docLength < 2000 ? "5 a 8" : docLength < 5000 ? "8 a 12" : "12 a 20";

  const message = await mistralChat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Tu es un expert en creation de formations professionnelles gamifiees.

A partir du document fourni, genere des paires Question/Reponse pour evaluer la comprehension du joueur.

REGLES:
- Genere ${targetCount} paires Q&A selon la complexite du document
- Chaque question teste une connaissance SPECIFIQUE et ACTIONNABLE
- La reponse attendue contient 2-4 POINTS CLES (pas une phrase complete, juste les elements essentiels)
- Les keywords sont les mots-cles discriminants qui DOIVENT apparaitre dans une bonne reponse
- Le champ "situation" est un MINI-SCENARIO RPG (2 phrases) que l'agent jouera pour poser la question de maniere immersive
  Exemple: "Un collegue vous appelle panique: 'J'ai clique sur un lien bizarre dans un email du PDG!' Il veut savoir quoi faire."
- difficulty: "easy" pour les definitions de base, "medium" pour les procedures, "hard" pour les decisions complexes avec dilemme
- Varie les types: pas seulement "qu'est-ce que" mais aussi "que faites-vous si...", "quelle est la procedure pour...", "comment reagissez-vous quand..."
- Les situations doivent etre REALISTES et ENGAGEANTES — le joueur doit avoir envie de repondre

JSON strict, aucun texte hors JSON:
{
  "qa_pairs": [
    {
      "id": "qa_1",
      "question": "Question claire et directe",
      "expected_answer": "Point cle 1. Point cle 2. Point cle 3.",
      "keywords": ["mot1", "mot2", "mot3"],
      "difficulty": "easy",
      "situation": "Mini-scenario RPG immersif en 2 phrases."
    }
  ]
}`,
      },
      { role: "user", content: documentText.slice(0, 8000) },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.3,
    maxTokens: 4000,
    timeoutMs: 45000,
  });

  const raw = String(message.content || "").trim();
  const parsed = extractJson<{ qa_pairs: QAPair[] }>(raw);
  if (!parsed?.qa_pairs || !Array.isArray(parsed.qa_pairs) || parsed.qa_pairs.length === 0) {
    throw new Error("Failed to generate Q&A pairs");
  }

  return parsed.qa_pairs.map((qa, i) => ({
    id: String(qa.id || `qa_${i + 1}`),
    question: String(qa.question || ""),
    expected_answer: String(qa.expected_answer || ""),
    keywords: Array.isArray(qa.keywords) ? qa.keywords.map(String) : [],
    difficulty: (["easy", "medium", "hard"].includes(qa.difficulty) ? qa.difficulty : "medium") as QAPair["difficulty"],
    categoryId: "", // filled in step 2
    situation: String(qa.situation || qa.question),
  }));
}

// ---------------------------------------------------------------------------
// Step 2: Q&A pairs → Categories
// ---------------------------------------------------------------------------

async function categorizeQAPairs(qaPairs: QAPair[]): Promise<QACategory[]> {
  const qaList = qaPairs.map((qa) => `- ${qa.id}: "${qa.question}" (${qa.difficulty})`).join("\n");

  const message = await mistralChat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Tu recois une liste de questions de formation. Regroupe-les en 1 a 4 categories thematiques.

REGLES:
- Chaque categorie a un nom clair (ex: "Securite informatique", "Gestion des acces") et une description courte
- Chaque Q&A appartient a exactement 1 categorie
- Ordre des categories = progression pedagogique (du plus basique au plus avance)
- Minimum 2 Q&A par categorie
- Maximum 4 categories

JSON strict:
{
  "categories": [
    {
      "id": "cat_1",
      "name": "Nom de la categorie",
      "description": "Description courte du theme",
      "qa_pair_ids": ["qa_1", "qa_2", "qa_3"]
    }
  ]
}`,
      },
      { role: "user", content: qaList },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.2,
    maxTokens: 1500,
    timeoutMs: 30000,
  });

  const raw = String(message.content || "").trim();
  const parsed = extractJson<{ categories: Array<{ id: string; name: string; description: string; qa_pair_ids: string[] }> }>(raw);
  if (!parsed?.categories || parsed.categories.length === 0) {
    throw new Error("Failed to categorize Q&A pairs");
  }

  const validQAIds = new Set(qaPairs.map((qa) => qa.id));
  return parsed.categories.slice(0, 4).map((cat, i) => ({
    id: String(cat.id || `cat_${i + 1}`),
    name: String(cat.name || `Categorie ${i + 1}`),
    description: String(cat.description || ""),
    qaPairIds: (cat.qa_pair_ids || []).map(String).filter((id) => validQAIds.has(id)),
  })).filter((cat) => cat.qaPairIds.length >= 1);
}

// ---------------------------------------------------------------------------
// Step 3: Categories → Agents + Scenario
// ---------------------------------------------------------------------------

async function generateAgentsAndScenario(
  categories: QACategory[],
  qaPairs: QAPair[],
  documentTitle: string,
): Promise<{ agents: Agent[]; learningAgent: Agent; scenario: Scenario }> {
  const catSummary = categories
    .map((cat) => {
      const catQAs = qaPairs.filter((qa) => cat.qaPairIds.includes(qa.id));
      return `- ${cat.name}: ${cat.description} (${catQAs.length} questions — ex: "${catQAs[0]?.question || ""}")`;
    })
    .join("\n");

  const message = await mistralChat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Tu es un concepteur de simulations immersives pour la formation professionnelle.

Genere EXACTEMENT ${categories.length} agent(s) (un par categorie) + 1 agent pedagogique special + un scenario.

REGLES AGENTS:
- Chaque agent correspond a UNE categorie et a une personnalite distincte
- voice_type UNIQUEMENT parmi: authoritative_male, warm_female, stressed_young, calm_narrator, gruff_veteran
- Personnalites OPPOSEES entre agents (un presse vs un methodique, un strict vs un bienveillant)
- intro_line: reaction a la situation, pas une presentation generique
- Pas d'apostrophes typographiques dans intro_line

AGENT PEDAGOGIQUE (learningAgent):
- voice_type: "warm_female"
- Personnalite: patiente, bienveillante, pedagogique
- Role: "Formatrice"
- S'active quand le joueur echoue 2 fois — explique la bonne reponse

SCENARIO:
- ${categories.length} acte(s), un par categorie
- Chaque acte = un incident/situation different lie a la categorie
- Le scenario doit etre coherent et immersif

JSON strict:
{
  "agents": [
    {
      "id": "agent_1",
      "name": "Prenom Nom",
      "role": "Titre professionnel",
      "personality": "Description courte",
      "voice_type": "authoritative_male",
      "motivation": "Ce que ce personnage veut",
      "knowledge_topics": ["sujet1", "sujet2"],
      "intro_line": "Phrase d'intro sans apostrophe typographique",
      "relationship_to_player": "Relation avec le joueur"
    }
  ],
  "learningAgent": {
    "id": "learning_agent",
    "name": "Prenom Nom",
    "role": "Formatrice",
    "personality": "Patiente et pedagogique",
    "voice_type": "warm_female",
    "motivation": "Aider le joueur a comprendre",
    "knowledge_topics": [],
    "intro_line": "Je vais vous expliquer cela clairement.",
    "relationship_to_player": "Formatrice bienveillante"
  },
  "scenario": {
    "title": "Titre court (max 60 car)",
    "setting": "Cadre professionnel (1-2 phrases)",
    "initial_situation": "Situation de depart (1-2 phrases)",
    "acts": [
      {
        "act_number": 1,
        "title": "Titre de l'acte",
        "description": "Resume (1 phrase)",
        "key_challenge": "Defi concret",
        "trigger_condition": "Condition de validation"
      }
    ]
  }
}`,
      },
      {
        role: "user",
        content: `Document: "${documentTitle}"\n\nCategories:\n${catSummary}`,
      },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.4,
    maxTokens: 3000,
    timeoutMs: 40000,
  });

  const raw = String(message.content || "").trim();
  const parsed = extractJson<{
    agents: Agent[];
    learningAgent: Agent;
    scenario: Scenario;
  }>(raw);

  if (!parsed?.agents || !parsed?.scenario) {
    throw new Error("Failed to generate agents and scenario");
  }

  const VALID_VOICES = new Set(["authoritative_male", "warm_female", "stressed_young", "calm_narrator", "gruff_veteran"]);
  const VOICE_ROTATION: Agent["voice_type"][] = ["authoritative_male", "stressed_young", "gruff_veteran", "calm_narrator"];

  const agents: Agent[] = parsed.agents.slice(0, categories.length).map((a, i) => ({
    id: String(a.id || `agent_${i + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    name: String(a.name || `Agent ${i + 1}`),
    role: String(a.role || categories[i]?.name || "Expert"),
    personality: String(a.personality || "Professionnel et direct."),
    voice_type: VALID_VOICES.has(String(a.voice_type)) ? a.voice_type as Agent["voice_type"] : VOICE_ROTATION[i % VOICE_ROTATION.length],
    motivation: String(a.motivation || "Résoudre la situation."),
    knowledge_topics: Array.isArray(a.knowledge_topics) ? a.knowledge_topics.map(String) : [categories[i]?.name || ""],
    intro_line: String(a.intro_line || "Situation critique. On doit agir."),
    relationship_to_player: String(a.relationship_to_player || "Collegue direct."),
  }));

  const learningAgent: Agent = {
    id: "learning_agent",
    name: String(parsed.learningAgent?.name || "Sophie Martin"),
    role: String(parsed.learningAgent?.role || "Formatrice"),
    personality: String(parsed.learningAgent?.personality || "Patiente, pedagogique, bienveillante."),
    voice_type: "warm_female",
    motivation: String(parsed.learningAgent?.motivation || "Aider le joueur a comprendre les procedures."),
    knowledge_topics: [],
    intro_line: String(parsed.learningAgent?.intro_line || "Je vais vous expliquer cela clairement."),
    relationship_to_player: String(parsed.learningAgent?.relationship_to_player || "Formatrice bienveillante."),
  };

  const scenario: Scenario = {
    title: String(parsed.scenario.title || `${documentTitle} — Simulation`),
    setting: String(parsed.scenario.setting || "Environnement professionnel."),
    initial_situation: String(parsed.scenario.initial_situation || "Vous prenez votre poste."),
    acts: Array.isArray(parsed.scenario.acts)
      ? parsed.scenario.acts.slice(0, categories.length).map((act, i) => ({
          act_number: i + 1,
          title: String(act.title || categories[i]?.name || `Acte ${i + 1}`),
          description: String(act.description || ""),
          key_challenge: String(act.key_challenge || categories[i]?.description || ""),
          trigger_condition: String(act.trigger_condition || "Repondre correctement aux questions."),
        }))
      : categories.map((cat, i) => ({
          act_number: i + 1,
          title: cat.name,
          description: cat.description,
          key_challenge: cat.description,
          trigger_condition: "Repondre correctement aux questions de cette categorie.",
        })),
  };

  return { agents, learningAgent, scenario };
}

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

function fallbackGamePlan(documentText: string, documentTitle: string): GamePlan {
  const qaPairs: QAPair[] = [
    {
      id: "qa_1",
      question: "Quels sont les principes fondamentaux decrits dans ce document ?",
      expected_answer: "Les principes de base presentes dans le document de formation.",
      keywords: ["principes", "fondamentaux", "base"],
      difficulty: "easy",
      categoryId: "cat_1",
      situation: "Votre responsable vous demande de resumer les bases du document que vous venez de lire.",
    },
    {
      id: "qa_2",
      question: "Quelle est la procedure a suivre en cas de probleme ?",
      expected_answer: "Identifier le probleme, alerter le responsable, suivre le protocole.",
      keywords: ["identifier", "alerter", "protocole", "responsable"],
      difficulty: "medium",
      categoryId: "cat_1",
      situation: "Un incident vient de se produire. Votre collegue panique et vous demande quoi faire.",
    },
    {
      id: "qa_3",
      question: "Comment reagissez-vous face a une situation d'urgence ?",
      expected_answer: "Garder son calme, evaluer la situation, appliquer les procedures d'urgence.",
      keywords: ["calme", "evaluer", "urgence", "procedures"],
      difficulty: "medium",
      categoryId: "cat_1",
      situation: "L'alarme retentit. Plusieurs collegues se tournent vers vous pour savoir quoi faire.",
    },
    {
      id: "qa_4",
      question: "Quelles sont les bonnes pratiques de communication dans ce contexte ?",
      expected_answer: "Communication claire, factuelle et rapide. Informer la hierarchie.",
      keywords: ["communication", "claire", "hierarchie", "informer"],
      difficulty: "easy",
      categoryId: "cat_1",
      situation: "Vous devez transmettre une information critique a votre equipe. Comment procedez-vous ?",
    },
    {
      id: "qa_5",
      question: "Comment assurez-vous le suivi apres un incident ?",
      expected_answer: "Documenter l'incident, analyser les causes, proposer des ameliorations.",
      keywords: ["documenter", "analyser", "causes", "ameliorations"],
      difficulty: "hard",
      categoryId: "cat_1",
      situation: "L'incident est resolu. Votre directeur veut un rapport complet pour demain matin.",
    },
  ];

  const categories: QACategory[] = [
    { id: "cat_1", name: "Procedures et bonnes pratiques", description: "Connaissances fondamentales du document", qaPairIds: qaPairs.map((q) => q.id) },
  ];

  const agents: Agent[] = [
    {
      id: "agent_operations",
      name: "M. Durand",
      role: "Responsable Operations",
      personality: "Direct, presse, focalisé sur l'efficacite.",
      voice_type: "authoritative_male",
      motivation: "S'assurer que les procedures sont respectees.",
      knowledge_topics: ["Procedures et bonnes pratiques"],
      intro_line: "On a un probleme. J'ai besoin de votre avis tout de suite.",
      relationship_to_player: "Superieur hierarchique direct.",
    },
  ];

  const learningAgent: Agent = {
    id: "learning_agent",
    name: "Sophie Martin",
    role: "Formatrice",
    personality: "Patiente, pedagogique, bienveillante.",
    voice_type: "warm_female",
    motivation: "Aider le joueur a comprendre.",
    knowledge_topics: [],
    intro_line: "Pas de souci, je vais vous expliquer.",
    relationship_to_player: "Formatrice bienveillante.",
  };

  const scenario: Scenario = {
    title: `${documentTitle} — Exercice pratique`,
    setting: "Vous etes dans votre environnement de travail habituel.",
    initial_situation: "Une situation inhabituelle se presente. Vos collegues comptent sur vous.",
    acts: [
      {
        act_number: 1,
        title: "Mise en situation",
        description: "Appliquer les procedures du document dans un contexte realiste.",
        key_challenge: "Demontrer la maitrise des procedures fondamentales.",
        trigger_condition: "Repondre correctement aux questions.",
      },
    ],
  };

  return { categories, qaPairs, agents, learningAgent, scenario };
}

// ---------------------------------------------------------------------------
// Main preparation pipeline
// ---------------------------------------------------------------------------

export async function prepareGamePlan(
  documentText: string,
  documentTitle: string,
  onStatus?: (message: string) => void,
): Promise<GamePlan> {
  const status = onStatus || (() => {});

  try {
    // Step 1: Generate Q&A pairs
    status("Analyse du document avec Mistral AI...");
    console.log("[prepare] Step 1: Generating Q&A pairs...");
    const tokenEstimate = documentText.split(/\s+/).length;
    status(`Extraction des connaissances (${tokenEstimate} tokens)...`);
    const qaPairs = await generateQAPairs(documentText);
    console.log(`[prepare] Generated ${qaPairs.length} Q&A pairs`);
    status(`${qaPairs.length} questions generees — validation en cours...`);

    // Step 2: Categorize
    status("Organisation des competences en categories...");
    console.log("[prepare] Step 2: Categorizing...");
    const categories = await categorizeQAPairs(qaPairs);
    console.log(`[prepare] Created ${categories.length} categories`);
    status(`${categories.length} categories identifiees — construction du scenario...`);

    // Assign categoryId to each Q&A pair
    for (const cat of categories) {
      for (const qaId of cat.qaPairIds) {
        const qa = qaPairs.find((q) => q.id === qaId);
        if (qa) qa.categoryId = cat.id;
      }
    }

    // Assign uncategorized Q&As to the first category
    for (const qa of qaPairs) {
      if (!qa.categoryId && categories.length > 0) {
        qa.categoryId = categories[0].id;
        if (!categories[0].qaPairIds.includes(qa.id)) {
          categories[0].qaPairIds.push(qa.id);
        }
      }
    }

    // Step 3: Generate agents + scenario
    status("Creation des personnages et du scenario...");
    console.log("[prepare] Step 3: Generating agents & scenario...");
    status("Initialisation des profils d'agents IA...");
    const { agents, learningAgent, scenario } = await generateAgentsAndScenario(
      categories,
      qaPairs,
      documentTitle,
    );
    console.log(`[prepare] Created ${agents.length} agents + learning agent`);
    status(`${agents.length + 1} agents generes — finalisation...`);

    return { categories, qaPairs, agents, learningAgent, scenario };
  } catch (err) {
    console.error("[prepare] Pipeline failed, using fallback:", err instanceof Error ? err.message : String(err));
    return fallbackGamePlan(documentText, documentTitle);
  }
}
