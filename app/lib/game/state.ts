import {
  Agent,
  AgentState,
  EvaluationTopic,
  MultiAgentGameState,
  Scenario,
  SimulationSetup,
} from "@/app/lib/types";

function buildAgentState(agent: Agent, systemPrompt: string): AgentState {
  return {
    agent,
    emotion: "calm",
    isActive: false,
    systemPrompt,
    interactionCount: 0,
  };
}

export function initializeGameState(
  setup: SimulationSetup,
  systemPrompts: Record<string, string>,
): MultiAgentGameState {
  const agents = setup.agents.map((agent, idx) => {
    const state = buildAgentState(agent, systemPrompts[agent.id] || "");
    state.isActive = idx === 0;
    return state;
  });

  const scores = setup.evaluation_grid.map((entry: EvaluationTopic) => ({
    topic: entry.topic,
    score: 0,
    weight: entry.weight,
  }));

  return {
    scenario: setup.scenario,
    currentAct: 1,
    agents,
    activeAgentId: agents[0]?.agent.id || "",
    playerActions: [],
    scores,
    totalScore: computeTotalScore(scores),
    conversationHistory: [],
    triggeredEvents: [],
    chaosMode: false,
    testedTopics: [],
  };
}

export function computeTotalScore(scores: Array<{ score: number; weight: number }>): number {
  const total = scores.reduce(
    (acc, current) => {
      acc.value += current.score * current.weight;
      acc.weight += current.weight;
      return acc;
    },
    { value: 0, weight: 0 },
  );

  if (total.weight === 0) return 0;
  return Math.round(total.value / total.weight);
}

export function updateActiveAgent(state: MultiAgentGameState, nextAgentId: string): MultiAgentGameState {
  return {
    ...state,
    activeAgentId: nextAgentId,
    agents: state.agents.map((agentState) => ({
      ...agentState,
      isActive: agentState.agent.id === nextAgentId,
    })),
  };
}

export function summarizeScenarioForStatus(scenario: Scenario): string {
  return `${scenario.title} · ${scenario.acts.length} actes`;
}
