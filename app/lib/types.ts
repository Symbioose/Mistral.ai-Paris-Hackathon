// ============================================
// RATP Survival - Game Types & Constants
// ============================================

export interface InventoryItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export interface DiceRoll {
  id: string;
  action: string;
  skillId?: string;
  skillName?: string;
  skillEvidence?: string;
  roll: number;
  needed: number;
  success: boolean;
  timestamp: number;
}

export interface GameState {
  hp: number;
  maxHp: number;
  inventory: InventoryItem[];
  diceLog: DiceRoll[];
  dialogue: string;
  isGameStarted: boolean;
  isGameOver: boolean;
  turnCount: number;
  currentStation: string;
}

export interface ManagerAssessment {
  skillId?: string;
  skillAssessed: string;
  playerScoreChange: number;
  managerNote: string;
  confidence?: number;
  failurePatterns?: string[];
  turn: number;
  timestamp: number;
}

export interface SkillReportEntry {
  id: string;
  name: string;
  description: string;
  criticality: "low" | "medium" | "high";
  evidences: string[];
  masteryScore: number;
  confidence: number;
  failurePatterns: string[];
  attempts: number;
  lastManagerNote: string;
}

export interface CriticalGap {
  skillId: string;
  skillName: string;
  criticality: "low" | "medium" | "high";
  masteryScore: number;
  confidence: number;
  failurePatterns: string[];
  evidenceExcerpts: string[];
  managerNote: string;
}

export interface SkillRecommendation {
  skillId: string;
  skillName: string;
  recommendation: string;
  priority: "high" | "medium" | "low";
}

export interface SimulationReport {
  generatedAt: string;
  globalWeightedScore: number;
  skills: SkillReportEntry[];
  topCriticalGaps: CriticalGap[];
  recommendations: SkillRecommendation[];
}

// Function call types from Mistral
export type GameAction =
  | { type: "update_hp"; amount: number }
  | { type: "manager_assessment"; assessment: ManagerAssessment }
  | { type: "add_item"; item: InventoryItem }
  | { type: "remove_item"; itemId: string }
  | { type: "dice_roll"; roll: DiceRoll }
  | { type: "change_station"; station: string }
  | { type: "game_over"; reason: string };

export interface GameResponse {
  narrative: string;
  actions: GameAction[];
  audioBase64: string | null;
  speakerName: string;
  speakerType: "narrator" | "npc";
  report?: SimulationReport;
}

// Starting inventory
export const STARTING_ITEMS: InventoryItem[] = [
  { id: "navigo", name: "Pass Navigo", emoji: "💳", description: "Votre précieux sésame. Périmé depuis 3 jours." },
  { id: "cafe", name: "Café froid", emoji: "☕", description: "Un gobelet de café tiède. Réconfortant." },
];

export const METRO_STATIONS = [
  "Châtelet-Les Halles",
  "Gare du Nord",
  "République",
  "Bastille",
  "Nation",
  "Belleville",
  "Stalingrad",
  "Barbès-Rochechouart",
  "Montparnasse",
  "Saint-Lazare",
];

export const INITIAL_GAME_STATE: GameState = {
  hp: 100,
  maxHp: 100,
  inventory: [...STARTING_ITEMS],
  diceLog: [],
  dialogue: "",
  isGameStarted: false,
  isGameOver: false,
  turnCount: 0,
  currentStation: "Châtelet-Les Halles",
};

// ============================================
// Multi-Agent System Types
// ============================================

export type VoiceType = "authoritative_male" | "warm_female" | "stressed_young" | "calm_narrator" | "gruff_veteran";

export type AgentEmotion = "calm" | "stressed" | "angry" | "panicked" | "suspicious";

export interface Agent {
  id: string;
  name: string;
  role: string;
  personality: string;
  voice_type: VoiceType;
  motivation: string;
  knowledge_topics: string[];
  intro_line: string;
  relationship_to_player: string;
}

export interface Scenario {
  title: string;
  setting: string;
  initial_situation: string;
  acts: Array<{
    act_number: number;
    title: string;
    description: string;
    key_challenge: string;
    trigger_condition: string;
  }>;
}

export interface EvaluationTopic {
  topic: string;
  weight: number;
  test_method: string;
}

export interface SimulationSetup {
  scenario: Scenario;
  agents: Agent[];
  evaluation_grid: EvaluationTopic[];
}

export interface AgentState {
  agent: Agent;
  emotion: AgentEmotion;
  isActive: boolean;
  systemPrompt: string;
  interactionCount: number;
}

export interface MultiAgentGameState {
  scenario: Scenario;
  currentAct: number;
  agents: AgentState[];
  activeAgentId: string;
  playerActions: string[];
  scores: Array<{ topic: string; score: number; weight: number }>;
  totalScore: number;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  triggeredEvents: string[];
  chaosMode: boolean;
  /** Topics already tested via check_knowledge — agents must not repeat them. */
  testedTopics: string[];
}
