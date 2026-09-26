import { judge } from "@/app/lib/simulation/judge";
import { type Turn } from "@/app/lib/simulation/contracts";
import {
  checkOrigin,
  dbError,
  failure,
  HttpError,
  loadSession,
} from "@/app/lib/simulation/server";
export const maxDuration = 120;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let release: (() => Promise<void>) | undefined;
  try {
    checkOrigin(req);
    const a = await loadSession((await params).id, true);
    const { data: existing, error: ee } = await a.admin
      .from("simulation_evaluations")
      .select("report")
      .eq("session_id", a.session.id)
      .maybeSingle();
    dbError(ee);
    if (existing) return Response.json({ report: existing.report });
    if (!a.turns.some((t) => t.role === "user"))
      throw new HttpError(400, "Échangez avec le client avant de terminer");
    const token = crypto.randomUUID();
    const { data: claimed, error: ce } = await a.admin.rpc("simulation_claim", {
      sid: a.session.id,
      token,
      evaluating: true,
    });
    dbError(ce);
    if (!claimed)
      throw new HttpError(
        409,
        "Une réponse ou une évaluation est déjà en cours",
      );
    release = async () => {
      const { error } = await a.admin
        .from("simulation_sessions")
        .update({
          status: "evaluation_failed",
          lease_token: null,
          lease_until: null,
        })
        .eq("id", a.session.id)
        .eq("lease_token", token)
        .abortSignal(AbortSignal.timeout(5000));
      if (error) console.error("[simulation evaluation release]", error);
    };
    const { data: history, error: he } = await a.admin
      .from("simulation_turns")
      .select("id,role,content,created_at")
      .eq("session_id", a.session.id)
      .order("created_at");
    dbError(he);
    const { report, model, promptVersion } = await judge(
      a.config,
      history as Turn[],
      a.session.module_number,
    );
    const { error } = await a.admin.rpc("simulation_commit_evaluation", {
      sid: a.session.id,
      token,
      result: report,
      judge_model: model,
      judge_prompt_version: promptVersion,
    });
    dbError(error);
    release = undefined;
    return Response.json({ report });
  } catch (e) {
    try {
      await release?.();
    } catch (releaseError) {
      console.error("[simulation release failed]", releaseError);
    }
    if (e instanceof HttpError) return failure(e);
    console.error("[simulation evaluation]", e);
    return Response.json(
      {
        error:
          "Évaluation indisponible ou rapport non conforme. Aucun score enregistré. Réessayez explicitement.",
      },
      { status: 502 },
    );
  }
}
