// ============================================
// Serious Game - Game Types & Constants
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

export interface FailurePattern {
  pattern: string;
  frequency: number;
  affectedSkills: string[];
  recommendation: string;
}

export interface EmployeeVibe {
  tone: string;
  stressResilience: string;
  overallAssessment: string;
  details: string[];
}

export interface SimulationReport {
  generatedAt: string;
  globalWeightedScore: number;
  skills: SkillReportEntry[];
  topCriticalGaps: CriticalGap[];
  recommendations: SkillRecommendation[];
  executiveSummary?: string;
  actionablePlan7Days?: string[];
  decisionTrace?: Array<{
    step: number;
    situation: string;
    playerDecision: string;
    impact: string;
    skillsInvolved: string[];
  }>;
  failurePatternAnalysis?: FailurePattern[];
  employeeVibe?: EmployeeVibe;
}

// Function call types from LLM
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

export type VoiceType = "authoritative_male" | "warm_female" | "assertive_female" | "stressed_young" | "calm_narrator" | "gruff_veteran";

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

export interface SharedMemoryNote {
  fromAgent: string;
  toAgent: string;
  note: string;
  priority: "low" | "medium" | "high";
  timestamp: number;
}

export interface MultiAgentGameState {
  scenario: Scenario;
  currentAct: number;
  agents: AgentState[];
  activeAgentId: string;
  playerActions: string[];
  scores: Array<{ topic: string; score: number; weight: number }>;
  totalScore: number;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    agentId?: string;
  }>;
  triggeredEvents: string[];
  chaosMode: boolean;
  /** Topics already tested via check_knowledge — agents must not repeat them. */
  testedTopics: string[];
  /** Pre-determined Q&A game plan */
  gamePlan?: GamePlan;
  /** Current interaction state machine position */
  interactionState?: InteractionState;
  /** Inter-agent shared memory for orchestration synergie */
  sharedMemory?: SharedMemoryNote[];
  /** Current emotion state of the active agent (deterministic engine) */
  emotionState?: EmotionState;
}

// ============================================
// Pre-Determined Q&A System
// ============================================

export interface QAPair {
  id: string;
  question: string;
  expected_answer: string;
  keywords: string[];
  difficulty: "easy" | "medium" | "hard";
  categoryId: string;
  /** RPG situation context for the agent to role-play */
  situation: string;
  /** Exact passage from the source document that supports the expected answer */
  source_excerpt: string;
}

export interface QACategory {
  id: string;
  name: string;
  description: string;
  qaPairIds: string[];
}

export interface GamePlan {
  categories: QACategory[];
  qaPairs: QAPair[];
  /** One agent per category */
  agents: Agent[];
  /** Dedicated pedagogical agent for learning mode */
  learningAgent: Agent;
  scenario: Scenario;
  /** True when automatic generation failed and generic fallback questions are used */
  isFallback: boolean;
}

export type InteractionPhase = "ASKING" | "REPHRASING" | "LEARNING" | "RE_ASKING" | "COMPLETE";

export interface InteractionState {
  phase: InteractionPhase;
  currentCategoryIndex: number;
  currentQAIndex: number;
  /** 0 = first attempt, 1 = rephrased, 2 = sent to learning */
  failCount: number;
  completedQAs: string[];
  failedQAs: string[];
  currentQAPairId: string;
  /** Number of exchanges in LEARNING phase without confirmation (auto-advance at 3) */
  learningTurns?: number;
}

// ============================================
// Emotion Engine Types
// ============================================

export type EmotionType = 'neutral' | 'pleased' | 'annoyed' | 'angry' | 'suspicious' | 'relieved' | 'stressed';

export interface EmotionState {
  current: EmotionType;
  intensity: number;       // 0.0 → 1.0
  trajectory: 'escalating' | 'stable' | 'cooling';
  reason?: string;         // Why this emotion (for debug/UI)
}

export type EmotionEvent =
  | { type: 'correct_answer'; firstTry: boolean }
  | { type: 'wrong_answer'; failCount: number }
  | { type: 'hesitation'; responseTimeMs: number }
  | { type: 'learning_complete' }
  | { type: 'act_change' };

// ============================================
// Turn Response Types
// ============================================

export interface TurnResponse {
  narrator?: string;       // Scene-setting text (always calm_narrator voice)
  dialogue: string;        // Client virtual's line
  emotion: EmotionState;   // Current emotional state
  stateTransition: InteractionState; // New state after this turn
}

// ============================================
// Mission Feed (Live orchestration terminal)
// ============================================

export type FeedItemType =
  | "agent_switch"
  | "knowledge_check"
  | "score_change"
  | "act_transition"
  | "event_triggered"
  | "eval_decision"
  | "emotion_change"
  | "learning_mode"
  | "agent_note";

export interface MissionFeedItem {
  id: string;
  type: FeedItemType;
  timestamp: number;
  agentName?: string;
  fromAgent?: string;
  toAgent?: string;
  reason?: string;
  topic?: string;
  wasCorrect?: boolean;
  scoreDelta?: number;
  newScore?: number;
  actNumber?: number;
  actTitle?: string;
  eventType?: string;
  emotion?: string;
  detail?: string;
}
