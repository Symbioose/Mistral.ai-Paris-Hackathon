// Judge calibration harness: grades the fixture transcripts and compares with expected scores.
//   npm run eval:judge -- [--repeat=3] [--fixture=id] [--scenario=path.json] [--corpus=annotations.json] [--output=file.json] [--compare=previous.json] [--concurrency=4] [--dry-run]
// Run it after every rubric or judge prompt change; --compare shows the score drift between two runs.
// The judge is not perfectly deterministic: use --repeat=3 before trusting a comparison (median score + stability).
import fs from "node:fs";
import { judge, JUDGE_PROMPT_VERSION } from "../app/lib/simulation/judge";
import { validateConfig, type Turn } from "../app/lib/simulation/contracts";
import defaultScenario from "../data/simulation/incident-it.v1.json";
import defaultCorpus from "../data/simulation/judge-fixtures.v1.json";
import { compareFixture } from "../app/lib/simulation/preview";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
type Fixture = (typeof defaultCorpus.fixtures)[number];
type Deviation = {
  key: string;
  actual: number | null;
  expected: number;
  withinTolerance: boolean;
  runs?: (number | null)[];
};
type Result = {
  id: string;
  model?: string;
  passed: boolean;
  deviations?: Deviation[];
  report?: unknown;
  error?: string;
};

async function pool<T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const scenarioPath = arg("scenario");
  const config = validateConfig(
    scenarioPath
      ? JSON.parse(fs.readFileSync(scenarioPath, "utf8"))
      : defaultScenario,
  );
  const corpusPath = arg("corpus");
  const corpus: typeof defaultCorpus = corpusPath
    ? JSON.parse(fs.readFileSync(corpusPath, "utf8"))
    : defaultCorpus;
  if (
    !corpusPath &&
    compareFixture(config, { skills: [] } as never, defaultCorpus.fixtures[0])
      .passed === null
  )
    throw new Error(
      "Cette configuration exige des attendus adaptés : fournissez --corpus=annotations.json. Le corpus de démonstration ne peut pas la valider.",
    );
  for (const fixture of corpus.fixtures) {
    if (!config.modules.some((m) => m.number === fixture.moduleNumber))
      throw new Error("Module absent pour " + fixture.id);
    const expected = fixture.expected as Record<string, number>;
    if (
      config.rubric.length !== Object.keys(expected).length ||
      config.rubric.some(
        (skill) =>
          !Number.isInteger(expected[skill.key]) ||
          expected[skill.key] < 0 ||
          expected[skill.key] > 4,
      )
    )
      throw new Error("Attendus incomplets ou invalides pour " + fixture.id);
    if (!Number.isFinite(fixture.tolerance) || fixture.tolerance < 0)
      throw new Error("Tolérance invalide pour " + fixture.id);
  }
  const selected = arg("fixture");
  const fixtures = corpus.fixtures.filter(
    (f) => !selected || f.id === selected,
  );
  if (!fixtures.length) throw new Error("Unknown fixture");
  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify({
        version: corpus.version,
        promptVersion: config.prompts?.version || JUDGE_PROMPT_VERSION,
        fixtures: fixtures.length,
        status: corpus.status,
      }),
    );
    return;
  }
  if (!process.env.OPENAI_API_KEY)
    throw new Error(
      "OPENAI_API_KEY is required; no synthetic reports generated",
    );

  const repeat = Number(arg("repeat") || 1),
    concurrency = Number(arg("concurrency") || 2);
  if (
    !Number.isInteger(repeat) ||
    repeat < 1 ||
    repeat > 20 ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 8
  )
    throw new Error(
      "repeat doit être un entier de 1 à 20, concurrency de 1 à 8",
    );
  const results = await pool(
    fixtures,
    concurrency,
    async (fixture: Fixture): Promise<Result> => {
      try {
        const runs: Awaited<ReturnType<typeof judge>>[] = [];
        for (let i = 0; i < repeat; i++)
          runs.push(
            await judge(
              config,
              fixture.transcript as Turn[],
              fixture.moduleNumber,
            ),
          );
        const { report, model } = runs[0];
        const expected = fixture.expected as Record<string, number>;
        const median = (xs: (number | null)[]) => {
          const v = xs
            .filter((x): x is number => x !== null)
            .sort((a, b) => a - b);
          return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
        };
        const deviations = report.skills
          .filter((s) => s.key in expected)
          .map((s) => {
            const scores = runs.map(
              (r) =>
                r.report.skills.find((k) => k.key === s.key)?.score ?? null,
            );
            const actual = median(scores);
            return {
              key: s.key,
              actual,
              expected: expected[s.key],
              runs: scores,
              withinTolerance:
                actual !== null &&
                Math.abs(actual - expected[s.key]) <= fixture.tolerance,
            };
          });
        const passed = deviations.every((d) => d.withinTolerance);
        console.log(
          `${passed ? "PASS" : "FAIL"} ${fixture.id}${
            passed
              ? ""
              : "  " +
                deviations
                  .filter((d) => !d.withinTolerance)
                  .map((d) => `${d.key}: ${d.actual} (attendu ${d.expected})`)
                  .join(", ")
          }`,
        );
        return { id: fixture.id, model, passed, deviations, report };
      } catch (error) {
        console.error(
          `ERROR ${fixture.id}: ${error instanceof Error ? error.message : error}`,
        );
        return {
          id: fixture.id,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // Agreement metrics per competency.
  const all = results.flatMap((r) => r.deviations || []);
  const scored = all.filter((d) => d.actual !== null);
  const mae = (ds: Deviation[]) =>
    ds.length
      ? ds.reduce(
          (s, d) => s + Math.abs((d.actual as number) - d.expected),
          0,
        ) / ds.length
      : NaN;
  const keys = [...new Set(all.map((d) => d.key))];
  const metrics = {
    fixtures: results.length,
    passed: results.filter((r) => r.passed).length,
    errors: results.filter((r) => r.error).length,
    meanAbsoluteError: mae(scored),
    exactAgreement: scored.length
      ? scored.filter((d) => d.actual === d.expected).length / scored.length
      : NaN,
    nullScores: all.length - scored.length,
    repeat,
    stability:
      repeat > 1 && all.length
        ? all.filter((d) => new Set(d.runs).size === 1).length / all.length
        : null,
    perSkill: Object.fromEntries(
      keys.map((k) => {
        const ds = scored.filter((d) => d.key === k);
        return [
          k,
          {
            mae: mae(ds),
            withinTolerance:
              all.filter((d) => d.key === k && d.withinTolerance).length +
              "/" +
              all.filter((d) => d.key === k).length,
          },
        ];
      }),
    ),
  };
  console.log("\nCompétence            MAE   dans tolérance");
  for (const [k, m] of Object.entries(metrics.perSkill))
    console.log(`${k.padEnd(20)}  ${m.mae.toFixed(2)}  ${m.withinTolerance}`);
  console.log(
    `\n${metrics.passed}/${metrics.fixtures} fixtures dans la tolérance · MAE ${metrics.meanAbsoluteError.toFixed(2)} · accord exact ${(metrics.exactAgreement * 100).toFixed(0)} % · erreurs ${metrics.errors}${metrics.stability !== null ? ` · stabilité ${(metrics.stability * 100).toFixed(0)} % sur ${repeat} répétitions` : ""}`,
  );

  const compare = arg("compare");
  if (compare) {
    const previous = JSON.parse(fs.readFileSync(compare, "utf8")) as {
      promptVersion?: string;
      results: Result[];
    };
    let changed = 0;
    console.log(
      `\nDérive par rapport à ${compare} (${previous.promptVersion || "version inconnue"}):`,
    );
    for (const r of results) {
      const p = previous.results.find((x) => x.id === r.id);
      for (const d of r.deviations || []) {
        const before = p?.deviations?.find((x) => x.key === d.key)?.actual;
        if (before !== undefined && before !== d.actual) {
          changed++;
          console.log(`  ${r.id} · ${d.key}: ${before} → ${d.actual}`);
        }
      }
    }
    console.log(`${changed} score(s) modifié(s).`);
  }

  const output = arg("output") || "/tmp/simulation-judge-results.json";
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        corpusVersion: corpus.version,
        calibrationStatus: corpus.status,
        promptVersion: config.prompts?.version || JUDGE_PROMPT_VERSION,
        scenario: config.title,
        createdAt: new Date().toISOString(),
        metrics,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`Résultats: ${output}`);
  if (metrics.passed < metrics.fixtures) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
