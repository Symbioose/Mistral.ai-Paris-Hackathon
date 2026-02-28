import { Agent, EvaluationTopic, Scenario, SimulationSetup } from "@/app/lib/types";
import { mistralChat } from "@/app/lib/agents/mistral-client";

interface DocumentAnalysisInput {
  docTitle: string;
  keyConcepts: string[];
  sectionSummaries: string[];
}

interface SetupSimulationToolOutput {
  scenario: Scenario;
  agents: Agent[];
  evaluation_grid: EvaluationTopic[];
}

const ORCHESTRATION_MODEL =
  process.env.MISTRAL_ORCHESTRATION_MODEL || "mistral-large-latest";

// ---------------------------------------------------------------------------
// JSON extraction helpers
// ---------------------------------------------------------------------------

function extractJsonObject(raw: string): SetupSimulationToolOutput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try the whole string first (JSON mode should always give clean JSON).
  try {
    return JSON.parse(trimmed) as SetupSimulationToolOutput;
  } catch {
    // Fallback: find the outermost { } pair in case there is surrounding noise.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as SetupSimulationToolOutput;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Sanitize & validate the raw output into a typed SimulationSetup
// ---------------------------------------------------------------------------

function sanitizeSetup(setup: SetupSimulationToolOutput): SimulationSetup {
  const scenario: Scenario = {
    title: String(setup.scenario?.title || "Simulation de crise"),
    setting: String(
      setup.scenario?.setting || "Contexte professionnel à haut risque.",
    ),
    initial_situation: String(
      setup.scenario?.initial_situation ||
        "Vous prenez votre poste dans une situation instable.",
    ),
    acts: Array.isArray(setup.scenario?.acts)
      ? setup.scenario.acts.slice(0, 3).map((act, index) => ({
          act_number: Number(act.act_number || index + 1),
          title: String(act.title || `Acte ${index + 1}`),
          description: String(act.description || "Acte de simulation"),
          key_challenge: String(
            act.key_challenge || "Appliquer les bonnes procédures.",
          ),
          trigger_condition: String(
            act.trigger_condition || "Atteindre le seuil de réussite demandé.",
          ),
        }))
      : [],
  };

  const VALID_VOICE_TYPES = new Set([
    "authoritative_male",
    "warm_female",
    "stressed_young",
    "calm_narrator",
    "gruff_veteran",
  ]);

  const agents: Agent[] = (Array.isArray(setup.agents) ? setup.agents : [])
    .slice(0, 5)
    .map((agent, index) => ({
      id: String(agent.id || `agent_${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_"),
      name: String(agent.name || `Agent ${index + 1}`),
      role: String(agent.role || "Expert opérationnel"),
      personality: String(agent.personality || "Calme, analytique, orienté résultat."),
      voice_type: VALID_VOICE_TYPES.has(String(agent.voice_type))
        ? (agent.voice_type as Agent["voice_type"])
        : "calm_narrator",
      motivation: String(agent.motivation || "Résoudre la crise avec un impact minimal."),
      knowledge_topics: Array.isArray(agent.knowledge_topics)
        ? agent.knowledge_topics.map((t) => String(t)).slice(0, 8)
        : [],
      intro_line: String(agent.intro_line || "On n'a pas de temps, je vais droit au but."),
      relationship_to_player: String(
        agent.relationship_to_player || "Observe votre niveau avec prudence.",
      ),
    }));

  const evaluation_grid: EvaluationTopic[] = (
    Array.isArray(setup.evaluation_grid) ? setup.evaluation_grid : []
  )
    .slice(0, 12)
    .map((entry) => ({
      topic: String(entry.topic || "Application des procédures"),
      weight: Math.max(1, Math.min(5, Number(entry.weight || 3))),
      test_method: String(entry.test_method || "Décisions sous contrainte de temps."),
    }));

  return { scenario, agents, evaluation_grid };
}

// ---------------------------------------------------------------------------
// Fallback — always kept as the last safety net
// ---------------------------------------------------------------------------

export function fallbackSimulationSetup(input: DocumentAnalysisInput): SimulationSetup {
  const topicA = input.keyConcepts[0] || "Application des procédures";
  const topicB = input.keyConcepts[1] || "Communication de crise";
  const topicC = input.keyConcepts[2] || "Gestion des priorités";

  return sanitizeSetup({
    scenario: {
      title: `${input.docTitle} · Exercice de crise`,
      setting:
        "Un incident critique éclate sur votre site. Les décisions doivent être prises vite, avec informations incomplètes.",
      initial_situation:
        "Vous prenez la main sur une situation tendue. Plusieurs interlocuteurs vous sollicitent en même temps.",
      acts: [
        {
          act_number: 1,
          title: "Détection",
          description: "Identifier le problème réel et les signaux utiles.",
          key_challenge: `Appliquer ${topicA} dans les 3 premières décisions.`,
          trigger_condition: "Le joueur formule un plan d'action cohérent.",
        },
        {
          act_number: 2,
          title: "Conflit",
          description: "Des objectifs contradictoires apparaissent entre les acteurs.",
          key_challenge: `Arbitrer sans violer ${topicB}.`,
          trigger_condition: "Le joueur maintient une stratégie alignée document.",
        },
        {
          act_number: 3,
          title: "Résolution",
          description: "La pression monte, il faut clôturer avec des actions traçables.",
          key_challenge: `Finaliser avec rigueur sur ${topicC}.`,
          trigger_condition:
            "Le joueur sécurise la situation et formalise la décision finale.",
        },
      ],
    },
    agents: [
      {
        id: "chef_operations",
        name: "M. Durand",
        role: "Chef des opérations",
        personality:
          "Directif, pressé, focalisé sur le temps de reprise. Tendance à couper les étapes jugées lentes.",
        voice_type: "authoritative_male",
        motivation:
          "Rétablir l'activité immédiatement, même avec un niveau de risque plus élevé.",
        knowledge_topics: [topicA, topicC],
        intro_line:
          "Situation critique en cours. Je veux votre plan d'action immediat, en trois etapes.",
        relationship_to_player: "Vous teste en continu sur votre capacité à trancher vite.",
      },
      {
        id: "inspectrice_qualite",
        name: "Mme Lefevre",
        role: "Inspectrice qualité et conformité",
        personality:
          "Rigoureuse, factuelle, exigeante sur les preuves et la traçabilité.",
        voice_type: "warm_female",
        motivation: "Assurer la conformité stricte aux procédures du document.",
        knowledge_topics: [topicA, topicB],
        intro_line:
          "Je validerai chaque decision avec les preuves et la procedure associee.",
        relationship_to_player:
          "Observe vos choix pour évaluer votre niveau de maîtrise.",
      },
    ],
    evaluation_grid: [
      {
        topic: topicA,
        weight: 5,
        test_method: "Décisions initiales et priorisation des mesures critiques.",
      },
      {
        topic: topicB,
        weight: 4,
        test_method: "Qualité des consignes et coordination des acteurs.",
      },
      {
        topic: topicC,
        weight: 3,
        test_method: "Clôture de crise et justification des choix.",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// System prompt — explicit schema embedded directly in the prompt so the
// model knows exactly what to produce without function-calling overhead.
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `Tu es un game designer expert en serious games de formation professionnelle.

Génère UNIQUEMENT du JSON valide (aucun markdown, aucun backtick, aucun texte avant ou après).

Le JSON doit respecter EXACTEMENT ce schéma :

{
  "scenario": {
    "title": "Titre court du scénario (max 60 caractères)",
    "setting": "Description du cadre (1-2 phrases)",
    "initial_situation": "Situation de départ du joueur (1-2 phrases)",
    "acts": [
      {
        "act_number": 1,
        "title": "Titre de l'acte",
        "description": "Résumé de l'acte (1 phrase)",
        "key_challenge": "Défi principal à relever",
        "trigger_condition": "Ce qui fait avancer au prochain acte"
      },
      { "act_number": 2, "title": "...", "description": "...", "key_challenge": "...", "trigger_condition": "..." },
      { "act_number": 3, "title": "...", "description": "...", "key_challenge": "...", "trigger_condition": "..." }
    ]
  },
  "agents": [
    {
      "id": "identifiant_snake_case",
      "name": "Prénom Nom",
      "role": "Titre professionnel",
      "personality": "Description de la personnalité (1 phrase)",
      "voice_type": "authoritative_male",
      "motivation": "Ce que ce personnage veut obtenir",
      "knowledge_topics": ["sujet1", "sujet2", "sujet3"],
      "intro_line": "Phrase d'introduction du personnage (sans apostrophe typographique)",
      "relationship_to_player": "Relation avec le joueur (1 phrase)"
    },
    {
      "id": "deuxieme_agent_id",
      "name": "Prénom Nom",
      "role": "Titre professionnel",
      "personality": "Personnalité différente du premier agent",
      "voice_type": "warm_female",
      "motivation": "Motivation différente, potentiellement en tension",
      "knowledge_topics": ["sujet1", "sujet2"],
      "intro_line": "Phrase d'introduction (sans apostrophe typographique)",
      "relationship_to_player": "Relation avec le joueur"
    }
  ],
  "evaluation_grid": [
    { "topic": "Compétence évaluée 1", "weight": 5, "test_method": "Comment on évalue cette compétence" },
    { "topic": "Compétence évaluée 2", "weight": 3, "test_method": "..." },
    { "topic": "Compétence évaluée 3", "weight": 2, "test_method": "..." }
  ]
}

RÈGLES ABSOLUES :
- EXACTEMENT 2 agents dans le tableau "agents"
- EXACTEMENT 3 actes dans "acts" (act_number 1, 2, 3)
- voice_type UNIQUEMENT parmi : authoritative_male, warm_female, stressed_young, calm_narrator, gruff_veteran
- Les 2 agents ont des personnalités et motivations contrastées (conflit de valeurs)
- Adapte tout le contenu au domaine du document fourni
- id en snake_case minuscule, sans espaces ni caractères spéciaux
- Pas de guillemets typographiques (utilise uniquement "), pas d'apostrophes typographiques
- JSON pur uniquement, zéro texte hors JSON`;
}

// ---------------------------------------------------------------------------
// Main orchestration — pure JSON mode, no function calling
// ---------------------------------------------------------------------------

export async function orchestrateSimulation(
  input: DocumentAnalysisInput,
): Promise<SimulationSetup> {
  const userContent = [
    `Titre du document : ${input.docTitle}`,
    `Concepts clés : ${input.keyConcepts.slice(0, 10).join(", ")}`,
    `Résumé par section :\n${input.sectionSummaries.slice(0, 5).join("\n---\n")}`,
  ].join("\n\n");

  try {
    console.log("[orchestrator] Appel Mistral JSON mode — model:", ORCHESTRATION_MODEL);

    const message = await mistralChat({
      model: ORCHESTRATION_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userContent },
      ],
      // No tools — pure JSON mode is more reliable for large nested structures.
      responseFormat: { type: "json_object" },
      temperature: 0.35,
      maxTokens: 3000,
      timeoutMs: 45000,
    });

    const raw = String(message.content || "").trim();
    console.log("[orchestrator] Réponse reçue (600 chars) :", raw.slice(0, 600));

    if (!raw) {
      console.error("[orchestrator] ❌ Réponse vide.");
      return fallbackSimulationSetup(input);
    }

    const parsed = extractJsonObject(raw);
    if (!parsed) {
      console.error("[orchestrator] ❌ Parsing JSON échoué. Raw complet :", raw);
      return fallbackSimulationSetup(input);
    }

    // Minimal structural validation before sanitizing.
    if (
      !parsed.scenario ||
      !Array.isArray(parsed.agents) ||
      parsed.agents.length === 0 ||
      !Array.isArray(parsed.evaluation_grid)
    ) {
      console.error(
        "[orchestrator] ❌ Structure JSON invalide :",
        JSON.stringify(parsed).slice(0, 400),
      );
      return fallbackSimulationSetup(input);
    }

    const setup = sanitizeSetup(parsed);
    console.log(
      "[orchestrator] ✅ Succès — scénario:",
      setup.scenario.title,
      "| agents:",
      setup.agents.map((a) => a.name).join(", "),
    );
    return setup;
  } catch (err) {
    console.error(
      "[orchestrator] ❌ Exception durant l'appel API :",
      err instanceof Error ? err.message : String(err),
    );
    return fallbackSimulationSetup(input);
  }
}
