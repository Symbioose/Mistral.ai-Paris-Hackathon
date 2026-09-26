"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/app/lib/conversation/types";
interface Fixture {
  id: string;
  moduleNumber: number;
}
interface Result {
  passed: boolean | null;
  model: string;
  promptVersion: string;
  deviations: {
    key: string;
    actual: number | null;
    expected: number;
    withinTolerance: boolean;
  }[];
  report: { summary: string };
}
export default function StudioEvaluation({
  source,
  fixtures,
}: {
  source: string;
  fixtures: Fixture[];
}) {
  const [fixtureId, setFixtureId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef(source);
  useEffect(() => {
    current.current = source;
  }, [source]);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setResult(null);
    setError("");
  }, [source, fixtureId]);
  const run = async () => {
    const tested = source;
    const runId = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await api<Result>("/api/simulation/admin/test", {
        config: JSON.parse(tested),
        fixtureId: fixtureId || fixtures[0]?.id,
      });
      if (current.current === tested && generation.current === runId)
        setResult(response);
    } catch (e) {
      if (generation.current === runId)
        setError(e instanceof Error ? e.message : "Test indisponible.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="yg-panel">
      <p className="yg-kicker">04 · Tester l’évaluation</p>
      <h2 className="yg-h3">Vérifier la cohérence du juge avant de publier</h2>
      <p>
        Testez le brouillon sur un entretien de référence avant de le publier.
        Chaque essai appelle le juge une fois ; le harnais en ligne de commande
        mesure aussi la stabilité sur plusieurs essais.
      </p>
      <label className="yg-field">
        Entretien de référence
        <select
          value={fixtureId || fixtures[0]?.id || ""}
          disabled={busy}
          onChange={(e) => setFixtureId(e.target.value)}
        >
          {fixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id} · module {f.moduleNumber}
            </option>
          ))}
        </select>
      </label>
      <button
        className="yg-btn yg-btn--ghost"
        disabled={busy || !fixtures.length}
        onClick={run}
      >
        {busy ? "Évaluation du transcript…" : "Tester ce brouillon"}
      </button>
      {error && (
        <p role="alert" className="yg-alert">
          {error}
        </p>
      )}
      {result && (
        <div role="status">
          <h3 className="yg-verdict">
            <span className={`yg-dot ${result.passed ? "yg-dot--ok" : ""}`} />
            {result.passed === null
              ? "Résultat exploratoire"
              : result.passed
                ? "Scores dans les tolérances prévues"
                : "Écarts à examiner"}
          </h3>
          <p>{result.report.summary}</p>
          {result.passed === null ? (
            <p>
              Le contenu ou la rubrique a changé : les attendus de démonstration
              ne permettent plus de valider ces scores. Faites annoter des
              transcripts adaptés à cette version.
            </p>
          ) : (
            <div className="yg-table-scroll">
              <table className="yg-table">
                <thead>
                  <tr>
                    <th>Compétence</th>
                    <th>Attendu</th>
                    <th>Obtenu</th>
                    <th>Comparaison</th>
                  </tr>
                </thead>
                <tbody>
                  {result.deviations.map((d) => (
                    <tr key={d.key}>
                      <th>{d.key}</th>
                      <td>{d.expected}/4</td>
                      <td>
                        {d.actual === null ? "Non observable" : `${d.actual}/4`}
                      </td>
                      <td>
                        {d.withinTolerance ? "Dans la tolérance" : "À examiner"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="yg-small">
            Modèle : {result.model} · Prompt : {result.promptVersion}
          </p>
        </div>
      )}
      <p className="yg-small">
        Attendus provisoires : une réussite à ce test ne remplace pas la
        calibration pédagogique avec EPITA. Toute modification du brouillon
        efface le résultat affiché.
      </p>
    </section>
  );
}
