import {
  auth,
  body,
  cleanSession,
  dbError,
  failure,
  HttpError,
  uuid,
} from "@/app/lib/simulation/server";
import { publicScenario, validateConfig } from "@/app/lib/simulation/contracts";
import { conversationModel } from "@/app/lib/simulation/models";
export async function GET(req: Request) {
  try {
    const cohort = new URL(req.url).searchParams.get("scope") === "cohort";
    const { client, admin, user } = await auth(cohort);
    let query = client.from("simulation_sessions").select("*");
    if (cohort) {
      const { data: owned, error: oe } = await admin
        .from("simulation_scenarios")
        .select("id")
        .eq("owner_id", user.id);
      dbError(oe);
      if (!owned?.length) return Response.json({ sessions: [] });
      const { data: versions, error: ve } = await admin
        .from("simulation_versions")
        .select("id")
        .in(
          "scenario_id",
          owned.map((s) => s.id),
        );
      dbError(ve);
      if (!versions?.length) return Response.json({ sessions: [] });
      query = query.in(
        "scenario_version_id",
        versions.map((v) => v.id),
      );
    } else query = query.eq("learner_id", user.id);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(200);
    dbError(error);
    if (!data?.length) return Response.json({ sessions: [] });
    const [
      { data: versions, error: ve },
      { data: evaluations, error: ee },
      { data: learners, error: le },
    ] = await Promise.all([
      admin
        .from("simulation_versions")
        .select("id,scenario_id,config")
        .in("id", [...new Set(data.map((s) => s.scenario_version_id))]),
      admin
        .from("simulation_evaluations")
        .select("session_id,report,model,prompt_version")
        .in(
          "session_id",
          data.map((s) => s.id),
        ),
      admin
        .from("profiles")
        .select("id,full_name")
        .in("id", [...new Set(data.map((s) => s.learner_id))]),
    ]);
    dbError(ve);
    dbError(ee);
    dbError(le);
    const versionMap = new Map(versions!.map((v) => [v.id, v])),
      evaluationMap = new Map(evaluations!.map((e) => [e.session_id, e])),
      learnerMap = new Map(learners!.map((l) => [l.id, l.full_name]));
    const sessions = data.map((session) => {
      const version = versionMap.get(session.scenario_version_id);
      if (!version) throw new HttpError(503, "Version de scénario absente");
      const config = validateConfig(version.config),
        evaluation = evaluationMap.get(session.id);
      return {
        ...cleanSession(session),
        learnerId: session.learner_id,
        learnerName: learnerMap.get(session.learner_id) || "Apprenant",
        scenario: publicScenario(version.scenario_id, config),
        report: evaluation?.report || null,
        evaluationMetadata: evaluation
          ? {
              model: evaluation.model,
              promptVersion: evaluation.prompt_version,
              scenarioVersionId: session.scenario_version_id,
              calibrationStatus: "provisional",
            }
          : null,
      };
    });
    return Response.json({ sessions });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { user, admin } = await auth();
    const b = await body(req);
    if (!uuid(b.scenarioId) || !Number.isInteger(b.moduleNumber))
      throw new HttpError(400, "Scénario et module requis");
    const { data: s, error } = await admin
      .from("simulation_scenarios")
      .select("published_version_id")
      .eq("id", b.scenarioId)
      .maybeSingle();
    dbError(error);
    if (!s?.published_version_id)
      throw new HttpError(404, "Scénario publié introuvable");
    const { data: v, error: ve } = await admin
      .from("simulation_versions")
      .select("config")
      .eq("id", s.published_version_id)
      .single();
    dbError(ve);
    const config = validateConfig(v!.config);
    if (!config.modules.some((m) => m.number === b.moduleNumber))
      throw new HttpError(400, "Module inconnu");
    const { data: session, error: se } = await admin
      .from("simulation_sessions")
      .insert({
        learner_id: user.id,
        scenario_version_id: s.published_version_id,
        module_number: b.moduleNumber,
        conversation_model: conversationModel(),
      })
      .select()
      .single();
    dbError(se);
    return Response.json(
      {
        session: cleanSession(session!),
        scenario: publicScenario(b.scenarioId, config),
        turns: [],
      },
      { status: 201 },
    );
  } catch (e) {
    return failure(e);
  }
}
