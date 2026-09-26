import demo from "@/data/simulation/incident-it.v1.json";
import corpus from "@/data/simulation/judge-fixtures.v1.json";
import { type ScenarioConfig, type Report } from "./contracts";
export { corpus };
export function compareFixture(
  config: ScenarioConfig,
  report: Report,
  fixture: (typeof corpus.fixtures)[number],
) {
  // Fixture expectations describe the authored IT scenario; other rubrics have no ground truth here.
  const comparable =
    JSON.stringify(config.rubric) === JSON.stringify(demo.rubric) &&
    JSON.stringify(config.persona.hiddenFacts) ===
      JSON.stringify(demo.persona.hiddenFacts) &&
    config.reference === demo.reference;
  if (!comparable)
    return {
      deviations: [],
      passed: null,
      calibrationStatus:
        "custom_unscored: no authored expectations for this configuration",
    };
  const expected = fixture.expected as Record<string, number>;
  const deviations = report.skills.map((s) => ({
    key: s.key,
    actual: s.score,
    expected: expected[s.key],
    withinTolerance:
      s.score !== null &&
      Math.abs(s.score - expected[s.key]) <= fixture.tolerance,
  }));
  return {
    deviations,
    passed: deviations.every((d) => d.withinTolerance),
    calibrationStatus: corpus.status,
  };
}
