import type { Report } from "@/app/lib/simulation/contracts";
import type { VoiceStyle } from "./audio";

// Browser-side shapes of the /api/simulation responses.
export interface ScenarioCard {
  id: string;
  title: string;
  brief: string;
  personaName: string;
  personaRole: string;
  durationMinutes: number;
  avatarUrl?: string;
  modules: { number: number; title: string }[];
  voice?: VoiceStyle;
  learnerHints?: { title: string; example: string }[];
}
export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
export type ConversationReport = Report;
export type SkillResult = Report["skills"][number];
export interface Session {
  id: string;
  status: "active" | "evaluating" | "completed" | "evaluation_failed";
  moduleNumber: number;
  created_at: string;
  completed_at?: string | null;
  scenarioVersionId: string;
  learnerId?: string;
  learnerName?: string;
  evaluationMetadata?: {
    model: string;
    promptVersion: string;
    scenarioVersionId: string;
    calibrationStatus: string;
  } | null;
  scenario?: ScenarioCard;
  report?: ConversationReport | null;
}
export interface SessionDetail {
  session: Session;
  scenario: ScenarioCard;
  turns: Turn[];
  report: ConversationReport | null;
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      data.error || "Connexion interrompue. Réessayez dans un instant.",
    );
  return data as T;
}

export interface HistoryPage {
  sessions: Session[];
  nextCursor?: { before: string; beforeId: string } | null;
}
