import { corpus } from "@/app/lib/simulation/preview";
import demoConfig from "@/data/simulation/incident-it.v1.json";
import { validateConfig } from "@/app/lib/simulation/contracts";
import {
  auth,
  body,
  dbError,
  failure,
  HttpError,
  uuid,
} from "@/app/lib/simulation/server";
export async function GET() {
  try {
    const { admin, user } = await auth(true);
    const { data, error } = await admin
      .from("simulation_scenarios")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    dbError(error);
    return Response.json({
      scenarios: data || [],
      demoConfig: validateConfig(demoConfig),
      fixtures: corpus.fixtures.map((f) => ({
        id: f.id,
        moduleNumber: f.moduleNumber,
      })),
      calibrationStatus: "provisional: EPITA review pending",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { admin, user } = await auth(true);
    const b = await body(req);
    if (typeof b.action !== "string" || !["save", "publish"].includes(b.action))
      throw new HttpError(400, "Action save ou publish requise");
    if (b.scenarioId !== undefined && !uuid(b.scenarioId))
      throw new HttpError(400, "Identifiant invalide");
    let id = b.scenarioId;
    if (id) {
      const { data, error } = await admin
        .from("simulation_scenarios")
        .select("id")
        .eq("id", id)
        .eq("owner_id", user.id)
        .maybeSingle();
      dbError(error);
      if (!data) throw new HttpError(404, "Scénario introuvable");
    }
    if (b.config !== undefined) {
      let config;
      try {
        config = validateConfig(b.config);
      } catch (e) {
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Configuration invalide",
        );
      }
      const query = id
        ? admin
            .from("simulation_scenarios")
            .update({ draft_config: config })
            .eq("id", id)
            .eq("owner_id", user.id)
        : admin
            .from("simulation_scenarios")
            .insert({ draft_config: config, owner_id: user.id });
      const { data, error } = await query.select("id").single();
      dbError(error);
      id = data!.id;
    }
    if (!id)
      throw new HttpError(400, "Configuration requise pour créer un scénario");
    if (b.action === "publish") {
      const { data: sc, error: se } = await admin
        .from("simulation_scenarios")
        .select("draft_config")
        .eq("id", id)
        .eq("owner_id", user.id)
        .single();
      dbError(se);
      const resolved = validateConfig(sc!.draft_config);
      const { error: resolveError } = await admin
        .from("simulation_scenarios")
        .update({ draft_config: resolved })
        .eq("id", id)
        .eq("owner_id", user.id);
      dbError(resolveError);
      const { data: versionId, error } = await admin.rpc("simulation_publish", {
        scenario: id,
        manager: user.id,
      });
      dbError(error);
      return Response.json({
        scenarioId: id,
        publishedVersionId: versionId,
        calibrationStatus: "provisional: EPITA review pending",
      });
    }
    return Response.json({ scenarioId: id });
  } catch (e) {
    return failure(e);
  }
}
