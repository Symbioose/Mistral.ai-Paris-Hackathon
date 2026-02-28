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

function parseToolCallPayload(raw: unknown): SetupSimulationToolOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const call = raw as { function?: { arguments?: string } };
  const argsString = call.function?.arguments;
  if (!argsString) return null;

  try {
    return JSON.parse(argsString) as SetupSimulationToolOutput;
  } catch {
    return null;
  }
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

export async function orchestrateSimulation(input: DocumentAnalysisInput): Promise<SimulationSetup> {
  const message = await mistralChat({
    model: "mistral-large-latest",
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
    temperature: 0.6,
    maxTokens: 1400,
  });

  const toolCall = Array.isArray(message.tool_calls) ? message.tool_calls[0] : null;
  const parsed = parseToolCallPayload(toolCall);

  if (!parsed) {
    throw new Error("Orchestrator did not return setup_simulation payload.");
  }

  return sanitizeSetup(parsed);
}
