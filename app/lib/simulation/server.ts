import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { publicScenario, validateConfig, type Turn } from "./contracts";
import { HttpError } from "./http";
export { HttpError, body, checkOrigin } from "./http";
export const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
export async function auth(manager = false) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new HttpError(401, "Non authentifié");
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (manager && profile?.role !== "manager")
    throw new HttpError(403, "Accès réservé aux managers");
  return {
    user,
    client,
    admin: createAdminClient(),
    isManager: profile?.role === "manager",
  };
}
export function dbError(error: unknown) {
  if (error) {
    console.error("[simulation database]", error);
    throw new HttpError(
      503,
      "Stockage de simulation indisponible. Vérifiez les migrations.",
    );
  }
}
export function failure(e: unknown) {
  if (!(e instanceof HttpError)) console.error("[simulation]", e);
  return Response.json(
    {
      error:
        e instanceof HttpError
          ? e.message
          : "La simulation est indisponible. Réessayez.",
    },
    { status: e instanceof HttpError ? e.status : 500 },
  );
}
export async function loadSession(id: string, ownerOnly = false) {
  if (!uuid(id)) throw new HttpError(400, "Identifiant invalide");
  const a = await auth();
  // RLS authorizes the learner or the owning manager before service access.
  const { data: session, error } = await a.client
    .from("simulation_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  dbError(error);
  if (!session) throw new HttpError(404, "Session introuvable");
  if (ownerOnly && session.learner_id !== a.user.id)
    throw new HttpError(403, "Seul l’apprenant peut modifier cette session");
  const { data: version, error: ve } = await a.admin
    .from("simulation_versions")
    .select("scenario_id,config")
    .eq("id", session.scenario_version_id)
    .single();
  dbError(ve);
  const config = validateConfig(version!.config);
  const { data: turns, error: te } = await a.admin
    .from("simulation_turns")
    .select("id,role,content,created_at")
    .eq("session_id", id)
    .order("created_at");
  dbError(te);
  return {
    ...a,
    session,
    config,
    scenario: publicScenario(version!.scenario_id, config),
    turns: turns as Turn[],
  };
}
export const cleanSession = (s: Record<string, unknown>) => ({
  id: s.id,
  status: s.status,
  moduleNumber: s.module_number,
  created_at: s.created_at,
  completed_at: s.completed_at,
  createdAt: s.created_at,
  completedAt: s.completed_at,
  scenarioVersionId: s.scenario_version_id,
  conversationModel: s.conversation_model,
});
