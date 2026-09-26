"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  type Session,
  type HistoryPage,
} from "@/app/lib/conversation/types";
import { Progress } from "./Workspace";
export default function TrainerProgress() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<HistoryPage["nextCursor"]>(null);
  const [search, setSearch] = useState("");
  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setError("");
    try {
      const data = await api<HistoryPage>(
        `/api/simulation/sessions?scope=cohort&${new URLSearchParams(cursor)}`,
      );
      setSessions((old) => [
        ...old,
        ...data.sessions.filter((s) => !old.some((o) => o.id === s.id)),
      ]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let alive = true;
    api<HistoryPage>("/api/simulation/sessions?scope=cohort")
      .then((data) => {
        if (alive) {
          setSessions(data.sessions);
          setCursor(data.nextCursor);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  const learners = new Map<string, Session[]>();
  for (const session of sessions.filter((s) =>
    (s.learnerName || "Apprenant")
      .toLocaleLowerCase("fr")
      .includes(search.toLocaleLowerCase("fr")),
  )) {
    const key = session.learnerId || "unknown";
    learners.set(key, [...(learners.get(key) || []), session]);
  }
  return (
    <section className="yg-panel">
      <h2 className="yg-h3">Suivre les entretiens</h2>
      <p>
        Sessions sur vos scénarios, regroupées par apprenant. Comparez les
        compétences à scénario, rubrique et modèle de notation identiques.
      </p>
      <label className="yg-field">
        Rechercher un apprenant
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom de l’apprenant"
        />
      </label>
      {loading && <p role="status">Chargement des parcours…</p>}
      {error && (
        <p role="alert" className="yg-alert">
          {error}
        </p>
      )}
      {!loading && !error && !sessions.length && (
        <p>Les premiers entretiens apparaîtront ici.</p>
      )}
      {Array.from(learners, ([id, items]) => (
        <section key={id} className="yg-learner">
          <div className="yg-learner-head">
            <span className="yg-avatar-chip">{(items[0].learnerName || "A").slice(0, 1)}</span>
            <h3 className="yg-h3">{items[0].learnerName || "Apprenant"}</h3>
            <span className="yg-small">{items.length} entretien{items.length > 1 ? "s" : ""}</span>
          </div>
          <Progress sessions={items} trainer />
          <div className="yg-table-scroll">
            <table className="yg-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Scénario</th>
                  <th>Module</th>
                  <th>Rapport</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {new Date(s.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td>{s.scenario?.title}</td>
                    <td>{s.moduleNumber}</td>
                    <td>
                      {s.report ? (
                        <Link href={`/simulation?session=${s.id}`}>
                          Consulter le rapport ↗
                        </Link>
                      ) : s.status === "evaluating" ? (
                        "Analyse en cours"
                      ) : s.status === "evaluation_failed" ? (
                        "Analyse à relancer par l’apprenant"
                      ) : (
                        "En cours"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {cursor && (
        <button
          className="yg-btn yg-btn--ghost"
          disabled={loading}
          onClick={loadMore}
        >
          Charger les entretiens précédents
        </button>
      )}
    </section>
  );
}
