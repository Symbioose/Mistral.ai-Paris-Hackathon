"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Session } from "@/app/lib/conversation/types";
export default function TrainerProgress() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<{ sessions: Session[] }>("/api/simulation/sessions?scope=cohort")
      .then((data) => {
        if (alive) setSessions(data.sessions);
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
  for (const session of sessions) {
    const key = session.learnerId || "unknown";
    learners.set(key, [...(learners.get(key) || []), session]);
  }
  return (
    <section className="yg-paper">
      <h2>Suivre les entretiens</h2>
      <p>
        Sessions sur vos scénarios, regroupées par apprenant. Comparez les
        compétences à scénario, rubrique et modèle de notation identiques.
      </p>
      {loading && <p role="status">Chargement des parcours…</p>}
      {error && (
        <p role="alert" className="yg-error">
          {error}
        </p>
      )}
      {!loading && !error && !sessions.length && (
        <p>Les premiers entretiens apparaîtront ici.</p>
      )}
      {Array.from(learners, ([id, items]) => (
        <section key={id}>
          <h3>{items[0].learnerName || "Apprenant"}</h3>
          <div className="yg-table-scroll">
            <table className="yg-audit-table">
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
      {sessions.length >= 200 && (
        <p className="yg-small">
          Les 200 sessions les plus récentes sont affichées.
        </p>
      )}
    </section>
  );
}
