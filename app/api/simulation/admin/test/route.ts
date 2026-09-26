import { auth, body, failure, HttpError } from "@/app/lib/simulation/server";
import { validateConfig, type Turn } from "@/app/lib/simulation/contracts";
import { judge } from "@/app/lib/simulation/judge";
import { compareFixture, corpus } from "@/app/lib/simulation/preview";
export const maxDuration = 120;
export async function POST(req: Request) {
  try {
    await auth(true);
    const b = await body(req);
    let config;
    try {
      config = validateConfig(b.config);
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Configuration invalide",
      );
    }
    const fixture = corpus.fixtures.find((f) => f.id === b.fixtureId);
    if (!fixture) throw new HttpError(400, "Fixture inconnue");
    if (!config.modules.some((m) => m.number === fixture.moduleNumber))
      throw new HttpError(
        400,
        "Le module de cette fixture est absent du scénario",
      );
    const { report, model, promptVersion } = await judge(
      config,
      fixture.transcript as Turn[],
      fixture.moduleNumber,
      { maxAttempts: 1 },
    );
    return Response.json({
      report,
      ...compareFixture(config, report, fixture),
      model,
      promptVersion,
      fixtureId: fixture.id,
      corpusVersion: corpus.version,
    });
  } catch (e) {
    return failure(e);
  }
}
