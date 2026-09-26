import {
  cleanSession,
  dbError,
  failure,
  loadSession,
} from "@/app/lib/simulation/server";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await loadSession((await params).id);
    const { data, error } = await a.admin
      .from("simulation_evaluations")
      .select("report,model,prompt_version")
      .eq("session_id", a.session.id)
      .maybeSingle();
    dbError(error);
    return Response.json({
      session: cleanSession(a.session),
      scenario: a.scenario,
      turns: a.turns,
      report: data?.report || null,
      evaluationMetadata: data
        ? {
            model: data.model,
            promptVersion: data.prompt_version,
            scenarioVersionId: a.session.scenario_version_id,
            calibrationStatus: "provisional",
          }
        : null,
    });
  } catch (e) {
    return failure(e);
  }
}
