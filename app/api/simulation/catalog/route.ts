import { auth, dbError, failure } from "@/app/lib/simulation/server";
import { publicScenario, validateConfig } from "@/app/lib/simulation/contracts";
export async function GET() {
  try {
    const { admin } = await auth();
    const { data, error } = await admin
      .from("simulation_scenarios")
      .select("id,published_version_id")
      .not("published_version_id", "is", null);
    dbError(error);
    const scenarios = await Promise.all(
      (data || []).map(async (s) => {
        const { data: v, error: e } = await admin
          .from("simulation_versions")
          .select("config")
          .eq("id", s.published_version_id)
          .single();
        dbError(e);
        return publicScenario(s.id, validateConfig(v!.config));
      }),
    );
    return Response.json({
      scenarios,
      voiceAvailable: !!process.env.GRADIUM_API_KEY,
    });
  } catch (e) {
    return failure(e);
  }
}
