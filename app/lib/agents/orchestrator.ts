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

const ORCHESTRATION_MODEL = process.env.MISTRAL_ORCHESTRATION_MODEL || "mistral-small-latest";
const ENABLE_PLAIN_JSON_RETRY = process.env.MISTRAL_ORCHESTRATION_RETRY === "true";

function extractJsonObject(raw: string): SetupSimulationToolOutput | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as SetupSimulationToolOutput;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as SetupSimulationToolOutput;
    } catch {
      return null;
    }
  }
}

function parseToolCallPayload(raw: unknown): SetupSimulationToolOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const call = raw as { function?: { arguments?: string } };
  const argsString = call.function?.arguments;
  if (!argsString) return null;

  return extractJsonObject(argsString);
}

function sanitizeSetup(setup: SetupSimulationToolOutput): SimulationSetup {
  const scenario: Scenario = {
    title: String(setup.scenario?.title || "Simulation de crise"),
    setting: String(setup.scenario?.setting || "Contexte professionnel à haut risque."),
    initial_situation: String(setup.scenario?.initial_situation || "Vous prenez votre poste dans une situation instable."),
    acts: Array.isArray(setup.scenario?.acts)
      ? setup.scenario.acts.slice(0, 3).map((act, index) => ({
          act_number: Number(act.act_number || index + 1),
          title: String(act.title || `Acte ${index + 1}`),
          description: String(act.description || "Acte de simulation"),
          key_challenge: String(act.key_challenge || "Appliquer les bonnes procédures."),
          trigger_condition: String(act.trigger_condition || "Atteindre le seuil de réussite demandé."),
        }))
      : [],
  };

  const agents: Agent[] = (Array.isArray(setup.agents) ? setup.agents : [])
    .slice(0, 5)
    .map((agent, index) => ({
      id: String(agent.id || `agent_${index + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      name: String(agent.name || `Agent ${index + 1}`),
      role: String(agent.role || "Expert opérationnel"),
      personality: String(agent.personality || "Calme, analytique, orienté résultat."),
      voice_type: ["authoritative_male", "warm_female", "stressed_young", "calm_narrator", "gruff_veteran"].includes(String(agent.voice_type))
        ? (agent.voice_type as Agent["voice_type"])
        : "calm_narrator",
      motivation: String(agent.motivation || "Résoudre la crise avec un impact minimal."),
      knowledge_topics: Array.isArray(agent.knowledge_topics) ? agent.knowledge_topics.map((t) => String(t)).slice(0, 8) : [],
      intro_line: String(agent.intro_line || "On n'a pas de temps, je vais droit au but."),
      relationship_to_player: String(agent.relationship_to_player || "Observe votre niveau avec prudence."),
    }));

  const evaluation_grid: EvaluationTopic[] = (Array.isArray(setup.evaluation_grid) ? setup.evaluation_grid : [])
    .slice(0, 12)
    .map((entry) => ({
      topic: String(entry.topic || "Application des procédures"),
      weight: Math.max(1, Math.min(5, Number(entry.weight || 3))),
      test_method: String(entry.test_method || "Décisions sous contrainte de temps."),
    }));

  return {
    scenario,
    agents,
    evaluation_grid,
  };
}

export function fallbackSimulationSetup(input: DocumentAnalysisInput): SimulationSetup {
  const topicA = input.keyConcepts[0] || "Application des procédures";
  const topicB = input.keyConcepts[1] || "Communication de crise";
  const topicC = input.keyConcepts[2] || "Gestion des priorités";

  return sanitizeSetup({
    scenario: {
      title: `${input.docTitle} · Exercice de crise`,
      setting: "Un incident critique éclate sur votre site. Les décisions doivent être prises vite, avec informations incomplètes.",
      initial_situation: "Vous prenez la main sur une situation tendue. Plusieurs interlocuteurs vous sollicitent en même temps.",
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
          trigger_condition: "Le joueur sécurise la situation et formalise la décision finale.",
        },
      ],
    },
    agents: [
      {
        id: "chef_operations",
        name: "M. Durand",
        role: "Chef des opérations",
        personality: "Directif, pressé, focalisé sur le temps de reprise. Tendance à couper les étapes jugées lentes.",
        voice_type: "authoritative_male",
        motivation: "Rétablir l'activité immédiatement, même avec un niveau de risque plus élevé.",
        knowledge_topics: [topicA, topicC],
        intro_line: "Situation critique en cours. Je veux votre plan d'action immediat, en trois etapes.",
        relationship_to_player: "Vous teste en continu sur votre capacité à trancher vite.",
      },
      {
        id: "inspectrice_qualite",
        name: "Mme Lefevre",
        role: "Inspectrice qualité et conformité",
        personality: "Rigoureuse, factuelle, exigeante sur les preuves et la traçabilité.",
        voice_type: "warm_female",
        motivation: "Assurer la conformité stricte aux procédures du document.",
        knowledge_topics: [topicA, topicB],
        intro_line: "Je validerai chaque decision avec les preuves et la procedure associee.",
        relationship_to_player: "Observe vos choix pour évaluer votre niveau de maîtrise.",
      },
      {
        id: "technicien_junior",
        name: "Lucas",
        role: "Technicien junior",
        personality: "Stressé, volontaire, parfois imprécis sous pression.",
        voice_type: "stressed_young",
        motivation: "Bien faire mais a besoin d'instructions simples et priorisées.",
        knowledge_topics: [topicB, topicC],
        intro_line: "Je suis en poste et pret a agir. Quelle est ma toute premiere action ?",
        relationship_to_player: "Dépend de vos instructions pour agir correctement.",
      },
    ],
    evaluation_grid: [
      { topic: topicA, weight: 5, test_method: "Décisions initiales et priorisation des mesures critiques." },
      { topic: topicB, weight: 4, test_method: "Qualité des consignes et coordination des acteurs." },
      { topic: topicC, weight: 3, test_method: "Clôture de crise et justification des choix." },
    ],
  });
}

async function requestSetupByPlainJson(input: DocumentAnalysisInput): Promise<SetupSimulationToolOutput | null> {
  const message = await mistralChat({
    model: ORCHESTRATION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Retourne UNIQUEMENT un JSON valide avec ce schéma: { scenario, agents, evaluation_grid }. Ne mets aucun markdown.",
      },
      {
        role: "user",
        content: `Titre: ${input.docTitle}\nConcepts: ${input.keyConcepts.join(", ")}\nSections: ${input.sectionSummaries.join("\n")}`,
      },
    ],
    toolChoice: "none",
    temperature: 0.25,
    maxTokens: 850,
    timeoutMs: 5000,
  });

  return extractJsonObject(String(message.content || ""));
}

export async function orchestrateSimulation(input: DocumentAnalysisInput): Promise<SimulationSetup> {
  const message = await mistralChat({
    model: ORCHESTRATION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Tu es un game designer expert. A partir de l'analyse d'un document, tu dois creer une simulation immersive de formation. Tu DOIS appeler setup_simulation avec 3 a 5 personnages, un scenario en 3 actes, et une grille d'evaluation. Les personnages ont des motivations potentiellement contradictoires. Pas de quiz: dilemmes, crises, choix sous pression.",
      },
      {
        role: "user",
        content: `Voici l'analyse du document:\n\nTitre: ${input.docTitle}\n\nConcepts cles:\n${input.keyConcepts.join("\n")}\n\nResume par section:\n${input.sectionSummaries.join("\n\n")}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "setup_simulation",
          description: "Configure la simulation de formation avec les agents et le scenario",
          parameters: {
            type: "object",
            properties: {
              scenario: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  setting: { type: "string" },
                  initial_situation: { type: "string" },
                  acts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        act_number: { type: "number" },
                        title: { type: "string" },
                        description: { type: "string" },
                        key_challenge: { type: "string" },
                        trigger_condition: { type: "string" },
                      },
                    },
                  },
                },
              },
              agents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    role: { type: "string" },
                    personality: { type: "string" },
                    voice_type: {
                      type: "string",
                      enum: ["authoritative_male", "warm_female", "stressed_young", "calm_narrator", "gruff_veteran"],
                    },
                    motivation: { type: "string" },
                    knowledge_topics: { type: "array", items: { type: "string" } },
                    intro_line: { type: "string" },
                    relationship_to_player: { type: "string" },
                  },
                },
              },
              evaluation_grid: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    topic: { type: "string" },
                    weight: { type: "number" },
                    test_method: { type: "string" },
                  },
                },
              },
            },
            required: ["scenario", "agents", "evaluation_grid"],
          },
        },
      },
    ],
    toolChoice: { type: "function", function: { name: "setup_simulation" } },
    temperature: 0.45,
    maxTokens: 950,
    timeoutMs: 14000,
  });

  const toolCall = Array.isArray(message.tool_calls) ? message.tool_calls[0] : null;
  let parsed = parseToolCallPayload(toolCall);
  if (!parsed && typeof message.content === "string") {
    parsed = extractJsonObject(message.content);
  }
  if (!parsed && ENABLE_PLAIN_JSON_RETRY) {
    parsed = await requestSetupByPlainJson(input);
  }

  if (!parsed) {
    return fallbackSimulationSetup(input);
  }

  return sanitizeSetup(parsed);
}
