import { NextRequest, NextResponse } from "next/server";
import {
  CriticalGap,
  GameAction,
  ManagerAssessment,
  SimulationReport,
  SkillRecommendation,
  SkillReportEntry,
} from "@/app/lib/types";
import {
  buildRagIndex,
  formatRetrievedContext,
  RagIndex,
  retrieveRelevantChunks,
} from "@/app/lib/rag";

function getMistralApiKey(): string {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY not configured");
  return key;
}

function getElevenLabsApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured");
  return key;
}

const MISTRAL_TIMEOUT_MS = 14000;
const ELEVENLABS_TIMEOUT_MS = 10000;

const VOICE_IDS = {
  narrator: "ErXwobaYiN019PkySvjV",
  npc: "pNInz6obpgDQGcFmaJgB",
};

type Role = "system" | "user" | "assistant" | "tool";

type Criticality = "low" | "medium" | "high";

interface ChatMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  criticality: Criticality;
  rules: string[];
  evidences: string[];
}

interface SkillProfile {
  documentSummary: string;
  skills: SkillDefinition[];
  extractionNotes: string[];
}

interface SkillProgress {
  masteryScore: number;
  confidence: number;
  attempts: number;
  failurePatterns: string[];
  lastManagerNote: string;
  lastTurn: number;
}

interface SessionState {
  documentHash: string | null;
  skillProfile: SkillProfile | null;
  mastery: Record<string, SkillProgress>;
  ragIndex: RagIndex | null;
}

interface EvaluatorResult {
  skillId: string;
  skillAssessed: string;
  playerScoreChange: number;
  hpDelta: number;
  confidence: number;
  failurePatterns: string[];
  managerNote: string;
}

interface ParseResult {
  narrative: string;
  speakerType: "narrator" | "npc";
  speakerName: string;
  actions: GameAction[];
}

// WARNING: In-memory stores — data is lost on redeploy and not shared across
// serverless instances. Acceptable for a single-instance demo; for production
// at scale, replace with Redis or a database.
const MAX_SESSIONS = 200;
const conversationHistory = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();
const sessionStore = new Map<string, SessionState>();

function evictOldestSessions() {
  if (sessionStore.size > MAX_SESSIONS) {
    const oldest = sessionStore.keys().next().value;
    if (oldest) {
      sessionStore.delete(oldest);
      conversationHistory.delete(oldest);
    }
  }
}

const SCENARIO_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "narrate",
      description: "OBLIGATOIRE. Narration de la scène en texte brut.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texte brut sans markdown, 2-3 phrases, termine par 'Que fais-tu ?'" },
          speaker_type: { type: "string", enum: ["narrator", "npc"] },
          speaker_name: { type: "string" },
        },
        required: ["text", "speaker_type", "speaker_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "dice_roll",
      description: "Lance un d20 pour la tension ludique.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string" },
          difficulty: { type: "number", description: "Difficulté 1-20" },
          skill_id: { type: "string", description: "ID exact du skill évalué (provenant de la matrice skills)." },
        },
        required: ["action", "difficulty", "skill_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_item",
      description: "Ajoute un objet utile à l'inventaire.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          emoji: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "name", "emoji", "description"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_item",
      description: "Retire un objet de l'inventaire.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "change_station",
      description: "Déplace le joueur vers un nouveau lieu.",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string" },
        },
        required: ["station"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "game_over",
      description: "Termine la simulation si l'erreur est fatale.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
        required: ["reason"],
      },
    },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function criticalityWeight(criticality: Criticality): number {
  if (criticality === "high") return 3;
  if (criticality === "medium") return 2;
  return 1;
}

function sanitizeNarrativeForTTS(text: string): string {
  return (text || "")
    .replace(/[*_`#>\-\[\]\(\)]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hashDocument(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }
  return `${content.length}-${hash}`;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractFirstJsonObject<T>(raw: string): T | null {
  const direct = safeJsonParse<T>(raw);
  if (direct) return direct;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  return safeJsonParse<T>(raw.slice(start, end + 1));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callMistral(
  messages: ChatMessage[],
  opts?: { tools?: unknown[]; toolChoice?: "any" | "auto" | "none"; temperature?: number; maxTokens?: number },
) {
  const res = await fetchWithTimeout(
    "https://api.mistral.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getMistralApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages,
        tools: opts?.tools,
        tool_choice: opts?.toolChoice,
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.maxTokens ?? 450,
      }),
    },
    MISTRAL_TIMEOUT_MS,
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mistral error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) {
    throw new Error("Mistral response missing message.");
  }

  return message;
}

function ensureSessionState(sessionId: string): SessionState {
  const existing = sessionStore.get(sessionId);
  if (existing) return existing;

  evictOldestSessions();

  const initial: SessionState = {
    documentHash: null,
    skillProfile: null,
    mastery: {},
    ragIndex: null,
  };
  sessionStore.set(sessionId, initial);
  return initial;
}

function weaknessScore(skill: SkillDefinition, progress: SkillProgress | undefined): number {
  const mastery = progress?.masteryScore ?? 0;
  const confidence = progress?.confidence ?? 0.5;
  const failures = progress?.failurePatterns.length ?? 0;
  return (100 - mastery) * criticalityWeight(skill.criticality) + (1 - confidence) * 30 + failures * 4;
}

function getWeakestSkills(profile: SkillProfile, mastery: Record<string, SkillProgress>, limit = 3): SkillDefinition[] {
  return [...profile.skills]
    .sort((a, b) => weaknessScore(b, mastery[b.id]) - weaknessScore(a, mastery[a.id]))
    .slice(0, limit);
}

function initMastery(profile: SkillProfile): Record<string, SkillProgress> {
  return profile.skills.reduce<Record<string, SkillProgress>>((acc, skill) => {
    acc[skill.id] = {
      masteryScore: 0,
      confidence: 0.5,
      attempts: 0,
      failurePatterns: [],
      lastManagerNote: "",
      lastTurn: 0,
    };
    return acc;
  }, {});
}

function sanitizeCriticality(raw: unknown): Criticality {
  return raw === "high" || raw === "low" || raw === "medium" ? raw : "medium";
}

function sanitizeSkillProfile(profile: SkillProfile): SkillProfile {
  const safeSkills: SkillDefinition[] = (profile.skills || [])
    .filter((skill) => skill && typeof skill.id === "string" && typeof skill.name === "string")
    .slice(0, 12)
    .map((skill, index) => ({
      id: (skill.id || `skill_${index + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 50),
      name: String(skill.name || `Compétence ${index + 1}`).slice(0, 120),
      description: String(skill.description || "Compétence extraite du document.").slice(0, 320),
      criticality: sanitizeCriticality(skill.criticality),
      rules: Array.isArray(skill.rules) ? skill.rules.map((r) => String(r).slice(0, 180)).slice(0, 6) : [],
      evidences: Array.isArray(skill.evidences)
        ? skill.evidences.map((e) => String(e).slice(0, 220)).filter((e) => e.length > 0).slice(0, 5)
        : [],
    }));

  if (safeSkills.length === 0) {
    safeSkills.push({
      id: "comprehension_document",
      name: "Compréhension du document",
      description: "Appliquer correctement les éléments opérationnels du document.",
      criticality: "high",
      rules: [],
      evidences: [],
    });
  }

  return {
    documentSummary: String(profile.documentSummary || "Résumé non disponible.").slice(0, 700),
    extractionNotes: Array.isArray(profile.extractionNotes) ? profile.extractionNotes.map((n) => String(n).slice(0, 200)).slice(0, 8) : [],
    skills: safeSkills,
  };
}

function fallbackSkillProfile(documentContext: string): SkillProfile {
  const excerpt = documentContext.slice(0, 180).replace(/\n/g, " ");
  return {
    documentSummary: "Référentiel généré en mode secours. Validation manuelle recommandée.",
    extractionNotes: ["Skill extractor indisponible: fallback activé."],
    skills: [
      {
        id: "application_regles",
        name: "Application des règles",
        description: "Utiliser correctement les procédures du document en situation dynamique.",
        criticality: "high",
        rules: ["Citer et appliquer les étapes critiques", "Prioriser la sécurité"],
        evidences: excerpt ? [excerpt] : [],
      },
      {
        id: "communication_crise",
        name: "Communication de crise",
        description: "Transmettre des consignes exactes, courtes et orientées action.",
        criticality: "medium",
        rules: ["Message court", "Destinataire précis", "Consigne vérifiable"],
        evidences: excerpt ? [excerpt] : [],
      },
    ],
  };
}

async function runSkillExtractor(documentContext: string, ragIndex: RagIndex): Promise<SkillProfile> {
  const system = `Tu es Agent 1: Skill Extractor.
Objectif: extraire une matrice de compétences exploitable en entreprise.
Réponds UNIQUEMENT en JSON valide.
Schéma STRICT:
{
  "documentSummary": "string",
  "extractionNotes": ["string"],
  "skills": [
    {
      "id": "snake_case",
      "name": "string",
      "description": "string",
      "criticality": "low|medium|high",
      "rules": ["string"],
      "evidences": ["court extrait exact du document"]
    }
  ]
}
Contraintes:
- 4 à 8 skills.
- evidences: 1 à 3 extraits par skill.
- id unique.
- Français professionnel.`;

  const retrieved = retrieveRelevantChunks(
    ragIndex,
    "procedures critiques securite consignes erreurs frequentes roles responsabilites",
    8,
  );
  const ragContext = formatRetrievedContext(retrieved, 7000);
  const fallbackContext = documentContext.slice(0, 7000);
  const user = `Document source (extraits recupérés):\n${ragContext || fallbackContext}`;

  try {
    const message = await callMistral(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { toolChoice: "none", temperature: 0.15, maxTokens: 1100 },
    );

    const parsed = extractFirstJsonObject<SkillProfile>(message.content || "");
    if (!parsed) {
      throw new Error("Skill extractor returned invalid JSON.");
    }

    return sanitizeSkillProfile(parsed);
  } catch (error) {
    console.error("[SkillExtractor] fallback:", error);
    return sanitizeSkillProfile(fallbackSkillProfile(documentContext));
  }
}

function buildScenarioSystemPrompt(profile: SkillProfile, weakestSkills: SkillDefinition[], ragContext: string): string {
  return `Tu es Agent 2: Scenario Director.
Tu adaptes la prochaine scène pour tester prioritairement les skills faibles.

Règles strictes:
- Appelle narrate EN PREMIER.
- Texte BRUT uniquement, sans markdown.
- 2 à 3 phrases max, orientées action.
- Termine par "Que fais-tu ?".
- Appelle dice_roll à chaque tour.
- Dans dice_roll, renseigne toujours skill_id avec un id de la matrice skills.
- Tu peux appeler add_item, remove_item, change_station, game_over.
- N'appelle JAMAIS update_hp.

Résumé du document:
${profile.documentSummary}

Skills faibles à cibler maintenant:
${weakestSkills
  .map((s) => `- id=${s.id} | ${s.name} [criticité=${s.criticality}] | Description: ${s.description} | Règles: ${s.rules.join("; ")}`)
  .join("\n")}

Contexte RAG (preuves à privilégier dans la scène):
${ragContext || "Aucun extrait RAG disponible."}`;
}

function parseScenarioTools(toolCalls: ToolCall[], profile: SkillProfile): ParseResult {
  let narrative = "";
  let speakerType: "narrator" | "npc" = "narrator";
  let speakerName = "Maître du Jeu";
  const actions: GameAction[] = [];
  const skillsById = new Map(profile.skills.map((skill) => [skill.id, skill]));

  for (const call of toolCalls) {
    const args = safeJsonParse<Record<string, unknown>>(call.function.arguments);
    if (!args) continue;

    switch (call.function.name) {
      case "narrate":
        narrative = String(args.text || "");
        speakerType = args.speaker_type === "npc" ? "npc" : "narrator";
        speakerName = String(args.speaker_name || "Maître du Jeu");
        break;
      case "dice_roll": {
        const roll = Math.floor(Math.random() * 20) + 1;
        const needed = clamp(Number(args.difficulty ?? 10), 1, 20);
        const requestedSkillId = String(args.skill_id || "").trim().toLowerCase();
        const resolvedSkill = skillsById.get(requestedSkillId) || profile.skills[0];
        actions.push({
          type: "dice_roll",
          roll: {
            id: crypto.randomUUID(),
            action: String(args.action || "Action"),
            skillId: resolvedSkill?.id,
            skillName: resolvedSkill?.name,
            skillEvidence: resolvedSkill?.evidences?.[0] || "",
            roll,
            needed,
            success: roll >= needed,
            timestamp: Date.now(),
          },
        });
        break;
      }
      case "add_item":
        actions.push({
          type: "add_item",
          item: {
            id: String(args.id || crypto.randomUUID()),
            name: String(args.name || "Objet"),
            emoji: String(args.emoji || "📦"),
            description: String(args.description || "Objet récupéré."),
          },
        });
        break;
      case "remove_item":
        actions.push({ type: "remove_item", itemId: String(args.item_id || "") });
        break;
      case "change_station":
        actions.push({ type: "change_station", station: String(args.station || "Zone inconnue") });
        break;
      case "game_over":
        actions.push({ type: "game_over", reason: String(args.reason || "Erreur fatale") });
        break;
      default:
        break;
    }
  }

  return { narrative, speakerType, speakerName, actions };
}

async function runScenarioDirector(params: {
  profile: SkillProfile;
  ragIndex: RagIndex;
  mastery: Record<string, SkillProgress>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): Promise<ParseResult> {
  const weakest = getWeakestSkills(params.profile, params.mastery, 3);
  const retrievalQuery = [
    params.userMessage,
    ...weakest.map((skill) => `${skill.name} ${skill.description} ${skill.rules.join(" ")}`),
  ].join(" ");
  const retrieved = retrieveRelevantChunks(params.ragIndex, retrievalQuery, 4);
  const ragContext = formatRetrievedContext(retrieved, 1800);
  const systemPrompt = buildScenarioSystemPrompt(params.profile, weakest, ragContext);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...params.history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: params.userMessage },
  ];

  const message = await callMistral(messages, {
    tools: SCENARIO_TOOLS,
    toolChoice: "any",
    temperature: 0.5,
    maxTokens: 420,
  });

  let parsed: ParseResult = { narrative: "", speakerType: "narrator", speakerName: "Maître du Jeu", actions: [] };

  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    parsed = parseScenarioTools(message.tool_calls as ToolCall[], params.profile);
  }

  if (!parsed.narrative) {
    parsed.narrative = sanitizeNarrativeForTTS(String(message.content || ""));
  }

  if (!parsed.narrative) {
    parsed.narrative = "La pression monte et tout se joue maintenant. Que fais-tu ?";
  }

  parsed.narrative = sanitizeNarrativeForTTS(parsed.narrative);
  return parsed;
}

async function runEvaluator(params: {
  profile: SkillProfile;
  ragIndex: RagIndex;
  mastery: Record<string, SkillProgress>;
  playerText: string;
  scenarioNarrative: string;
  turnCount: number;
}): Promise<EvaluatorResult> {
  const system = `Tu es Agent 3: Evaluator indépendant.
Tu notes la réponse du joueur contre la matrice de skills.
Réponds UNIQUEMENT en JSON valide.
Schéma STRICT:
{
  "skill_id": "string",
  "skill_assessed": "string",
  "player_score_change": 0,
  "hp_delta": 0,
  "confidence": 0.0,
  "failure_patterns": ["string"],
  "manager_note": "string"
}
Règles:
- player_score_change entre -10 et 10.
- hp_delta entre -25 et 15.
- confidence entre 0 et 1.
- failure_patterns: liste courte et concrète.
- manager_note factuelle et actionnable.
- Pas de narration.`;

  const retrievalQuery = `${params.playerText} ${params.scenarioNarrative} ${params.profile.skills.map((s) => s.name).join(" ")}`;
  const retrieved = retrieveRelevantChunks(params.ragIndex, retrievalQuery, 4);

  const userPayload = {
    turn: params.turnCount,
    player_text: params.playerText,
    scenario_narrative: params.scenarioNarrative,
    skill_profile: params.profile,
    mastery_snapshot: params.mastery,
    rag_evidence_chunks: retrieved,
  };

  const message = await callMistral(
    [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    { toolChoice: "none", temperature: 0.1, maxTokens: 380 },
  );

  const raw = extractFirstJsonObject<Record<string, unknown>>(message.content || "");
  if (!raw) {
    throw new Error("Evaluator returned invalid JSON.");
  }

  const skillId = String(raw.skill_id || "").trim();
  const skillAssessed = String(raw.skill_assessed || "Compétence non précisée").trim();
  const playerScoreChange = clamp(Number(raw.player_score_change ?? 0), -10, 10);
  const hpDelta = clamp(Number(raw.hp_delta ?? 0), -25, 15);
  const confidence = clamp(Number(raw.confidence ?? 0.5), 0, 1);
  const failurePatterns = Array.isArray(raw.failure_patterns)
    ? raw.failure_patterns.map((p) => String(p).trim()).filter((p) => p.length > 0).slice(0, 4)
    : [];
  const managerNote = String(raw.manager_note || "Évaluation indisponible.").trim();

  return {
    skillId,
    skillAssessed,
    playerScoreChange,
    hpDelta,
    confidence,
    failurePatterns,
    managerNote,
  };
}

function mergeFailurePatterns(current: string[], incoming: string[]): string[] {
  const next = [...current];
  for (const pattern of incoming) {
    if (!next.some((p) => p.toLowerCase() === pattern.toLowerCase())) {
      next.push(pattern);
    }
  }
  return next.slice(-8);
}

function applyEvaluationToMastery(
  profile: SkillProfile,
  mastery: Record<string, SkillProgress>,
  evaluation: EvaluatorResult,
  turnCount: number,
): string {
  const fallbackSkillId = profile.skills[0]?.id;
  const targetSkillId = evaluation.skillId && mastery[evaluation.skillId] ? evaluation.skillId : fallbackSkillId;
  if (!targetSkillId) return "";

  const current = mastery[targetSkillId] || {
    masteryScore: 50,
    confidence: 0.5,
    attempts: 0,
    failurePatterns: [],
    lastManagerNote: "",
    lastTurn: 0,
  };

  mastery[targetSkillId] = {
    masteryScore: clamp(current.masteryScore + evaluation.playerScoreChange * 4, 0, 100),
    confidence: clamp(current.confidence * 0.65 + evaluation.confidence * 0.35, 0, 1),
    attempts: current.attempts + 1,
    failurePatterns: mergeFailurePatterns(current.failurePatterns, evaluation.failurePatterns),
    lastManagerNote: evaluation.managerNote,
    lastTurn: turnCount,
  };

  return targetSkillId;
}

function buildRecommendation(entry: SkillReportEntry): SkillRecommendation {
  const primaryFailure = entry.failurePatterns[0] || "application incomplète des consignes";
  const priority: "high" | "medium" | "low" =
    entry.criticality === "high" || entry.masteryScore < 40 ? "high" : entry.masteryScore < 65 ? "medium" : "low";

  return {
    skillId: entry.id,
    skillName: entry.name,
    priority,
    recommendation:
      `Renforcer ${entry.name} via un micro-module ciblé. ` +
      `Point de friction observé: ${primaryFailure}. ` +
      `Objectif court terme: atteindre un score de maîtrise >= ${entry.masteryScore < 50 ? "70" : "80"}.`,
  };
}

function buildSimulationReport(profile: SkillProfile, mastery: Record<string, SkillProgress>): SimulationReport {
  const skills: SkillReportEntry[] = profile.skills.map((skill) => {
    const progress = mastery[skill.id] || {
      masteryScore: 0,
      confidence: 0.5,
      attempts: 0,
      failurePatterns: [],
      lastManagerNote: "",
    };

    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      criticality: skill.criticality,
      evidences: skill.evidences,
      masteryScore: clamp(progress.masteryScore, 0, 100),
      confidence: clamp(progress.confidence, 0, 1),
      failurePatterns: progress.failurePatterns.slice(0, 5),
      attempts: progress.attempts,
      lastManagerNote: progress.lastManagerNote,
    };
  });

  const weightedTotal = skills.reduce(
    (acc, skill) => {
      const weight = criticalityWeight(skill.criticality);
      acc.score += skill.masteryScore * weight;
      acc.weight += weight;
      return acc;
    },
    { score: 0, weight: 0 },
  );

  const globalWeightedScore = weightedTotal.weight > 0 ? Number((weightedTotal.score / weightedTotal.weight).toFixed(1)) : 0;

  const topCriticalGaps: CriticalGap[] = [...skills]
    .sort((a, b) => {
      const aGap = weaknessScore(
        {
          id: a.id,
          name: a.name,
          description: a.description,
          criticality: a.criticality,
          rules: [],
          evidences: a.evidences,
        },
        {
          masteryScore: a.masteryScore,
          confidence: a.confidence,
          attempts: a.attempts,
          failurePatterns: a.failurePatterns,
          lastManagerNote: a.lastManagerNote,
          lastTurn: 0,
        },
      );
      const bGap = weaknessScore(
        {
          id: b.id,
          name: b.name,
          description: b.description,
          criticality: b.criticality,
          rules: [],
          evidences: b.evidences,
        },
        {
          masteryScore: b.masteryScore,
          confidence: b.confidence,
          attempts: b.attempts,
          failurePatterns: b.failurePatterns,
          lastManagerNote: b.lastManagerNote,
          lastTurn: 0,
        },
      );
      return bGap - aGap;
    })
    .slice(0, 3)
    .map((skill) => ({
      skillId: skill.id,
      skillName: skill.name,
      criticality: skill.criticality,
      masteryScore: skill.masteryScore,
      confidence: skill.confidence,
      failurePatterns: skill.failurePatterns,
      evidenceExcerpts: skill.evidences.slice(0, 2),
      managerNote: skill.lastManagerNote || "Pas de note disponible.",
    }));

  const recommendations = skills
    .filter((skill) => skill.masteryScore < 75 || skill.confidence < 0.65)
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 5)
    .map(buildRecommendation);

  return {
    generatedAt: new Date().toISOString(),
    globalWeightedScore,
    skills,
    topCriticalGaps,
    recommendations,
  };
}

async function generateSpeech(text: string, speakerType: "narrator" | "npc"): Promise<Buffer | null> {
  const voiceId = VOICE_IDS[speakerType] ?? VOICE_IDS.narrator;
  const cleanText = sanitizeNarrativeForTTS(text);
  if (!cleanText) return null;

  try {
    const res = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": getElevenLabsApiKey(),
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.55,
            use_speaker_boost: true,
          },
        }),
      },
      ELEVENLABS_TIMEOUT_MS,
    );

    if (!res.ok) {
      console.error("[ElevenLabs] Error:", res.status, await res.text());
      return null;
    }

    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error("[ElevenLabs] Fetch error:", error);
    return null;
  }
}

function buildDefaultSkillProfile(): SkillProfile {
  return {
    documentSummary: "Mode survie générique sans document. Le joueur doit analyser la situation, décider vite et appliquer des règles de sécurité opérationnelle.",
    extractionNotes: ["Profil par défaut activé"],
    skills: [
      {
        id: "analyse_situation",
        name: "Analyse de situation",
        description: "Identifier rapidement les risques et priorités d'action.",
        criticality: "high",
        rules: ["Repérer danger principal", "Évaluer impact immédiat"],
        evidences: ["Le contexte impose une réponse rapide et structurée."],
      },
      {
        id: "communication_crise",
        name: "Communication de crise",
        description: "Transmettre une information claire et utile sous stress.",
        criticality: "medium",
        rules: ["Message court", "Info vérifiable", "Canal approprié"],
        evidences: ["Les instructions doivent être claires et traçables."],
      },
    ],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const playerText = typeof body.playerText === "string" ? body.playerText.trim() : "";
    const turnCount = Number.isFinite(body.turnCount) ? Number(body.turnCount) : 0;
    const gameState = body.gameState;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "default";
    const documentContext = typeof body.documentContext === "string" ? normalizeText(body.documentContext).slice(0, 12000) : "";

    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId)!;

    const sessionState = ensureSessionState(sessionId);
    const currentDocHash = documentContext ? hashDocument(documentContext) : "default";
    const defaultProfile = buildDefaultSkillProfile();
    const ragSource = documentContext
      ? documentContext
      : `${defaultProfile.documentSummary}\n${defaultProfile.skills.map((s) => `${s.name}. ${s.description}. ${s.rules.join(" ")}`).join("\n")}`;
    const ragIndex = buildRagIndex(ragSource);

    if (!sessionState.skillProfile || !sessionState.ragIndex || sessionState.documentHash !== currentDocHash) {
      const extracted = documentContext ? await runSkillExtractor(documentContext, ragIndex) : defaultProfile;
      sessionState.skillProfile = extracted;
      sessionState.documentHash = currentDocHash;
      sessionState.mastery = initMastery(extracted);
      sessionState.ragIndex = ragIndex;
    }

    const skillProfile = sessionState.skillProfile || buildDefaultSkillProfile();
    const activeRagIndex = sessionState.ragIndex || buildRagIndex(ragSource);

    const userMessage =
      turnCount === 0 || !playerText
        ? "Le joueur commence la simulation. Lance une scène d'ouverture immersive alignée avec les compétences cibles."
        : `${gameState ? `[HP:${gameState.hp}/${gameState.maxHp} | Zone:${gameState.currentStation} | Tour:${turnCount}]` : ""}\nRéponse joueur: "${playerText}"`;

    history.push({ role: "user", content: userMessage });

    const scenario = await runScenarioDirector({
      profile: skillProfile,
      ragIndex: activeRagIndex,
      mastery: sessionState.mastery,
      history,
      userMessage,
    });

    const actions: GameAction[] = [...scenario.actions];

    if (turnCount > 0 && playerText) {
      const evaluation = await runEvaluator({
        profile: skillProfile,
        ragIndex: activeRagIndex,
        mastery: sessionState.mastery,
        playerText,
        scenarioNarrative: scenario.narrative,
        turnCount: turnCount + 1,
      });

      const resolvedSkillId = applyEvaluationToMastery(skillProfile, sessionState.mastery, evaluation, turnCount + 1);

      const assessment: ManagerAssessment = {
        skillId: resolvedSkillId,
        skillAssessed: evaluation.skillAssessed,
        playerScoreChange: evaluation.playerScoreChange,
        managerNote: evaluation.managerNote,
        confidence: evaluation.confidence,
        failurePatterns: evaluation.failurePatterns,
        turn: turnCount + 1,
        timestamp: Date.now(),
      };

      actions.push({ type: "update_hp", amount: evaluation.hpDelta });
      actions.push({ type: "manager_assessment", assessment });
    }

    history.push({ role: "assistant", content: scenario.narrative });
    if (history.length > 20) history.splice(0, history.length - 20);

    const report = buildSimulationReport(skillProfile, sessionState.mastery);

    let audioBase64: string | null = null;
    const audioBuffer = await generateSpeech(scenario.narrative, scenario.speakerType);
    if (audioBuffer) {
      audioBase64 = audioBuffer.toString("base64");
    }

    return NextResponse.json({
      narrative: scenario.narrative,
      actions,
      audioBase64,
      speakerName: scenario.speakerName,
      speakerType: scenario.speakerType,
      report,
    });
  } catch (error) {
    console.error("[Game Route] Error:", error);
    return NextResponse.json(
      {
        narrative: "Incident technique sur la simulation. Redémarrage en cours. Que fais-tu ?",
        actions: [],
        audioBase64: null,
        speakerName: "Système",
        speakerType: "narrator",
      },
      { status: 500 },
    );
  }
}
