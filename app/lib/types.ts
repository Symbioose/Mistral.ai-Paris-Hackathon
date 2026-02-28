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

// Function call types from Mistral
export type GameAction =
  | { type: "update_hp"; amount: number }
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
