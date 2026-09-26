"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import Conversation from "./Conversation";
import {
  api,
  type ScenarioCard,
  type Session,
  type SessionDetail,
} from "@/app/lib/conversation/types";
export default function Workspace() {
  const { profile, isAuthenticated, loading, isManager, signOut } = useAuth();
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<ScenarioCard | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [moduleNumber, setModuleNumber] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mic, setMic] = useState("");
  const refresh = async () => {
    setError("");
    try {
      const [catalog, history] = await Promise.all([
        api<{ scenarios: ScenarioCard[] }>("/api/simulation/catalog"),
        api<{ sessions: Session[] }>("/api/simulation/sessions"),
      ]);
      setScenarios(catalog.scenarios);
      setSessions(history.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => {
    if (isAuthenticated) {
      void refresh();
      const id = new URLSearchParams(window.location.search).get("session");
      if (id) void open(id);
    }
  }, [isAuthenticated]);
  const begin = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<SessionDetail>("/api/simulation/sessions", {
        scenarioId: selected.id,
        moduleNumber,
      });
      setDetail({ ...data, report: null });
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Session indisponible.");
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      setDetail(await api<SessionDetail>(`/api/simulation/sessions/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Session introuvable.");
    } finally {
      setBusy(false);
    }
  };
  const testMicrophone = async () => {
    setMic("Vérification…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      source.connect(analyser);
      setMic("Dites quelques mots…");
      let peak = 0;
      const samples = new Float32Array(analyser.fftSize);
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        peak = Math.max(peak, ...samples.map(Math.abs));
      }, 100);
      setTimeout(() => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        source.disconnect();
        void ctx.close();
        setMic(
          peak > 0.005
            ? "Votre microphone fonctionne."
            : "Microphone autorisé, mais aucun son détecté. Vérifiez votre entrée audio.",
        );
      }, 2500);
    } catch {
      setMic(
        "Autorisez le microphone dans votre navigateur, ou commencez par écrit.",
      );
    }
  };
  if (loading)
    return (
      <div className="yg-shell">
        <div className="yg-loading">Votre espace se prépare…</div>
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="yg-shell">
        <Header />
        <main className="yg-report">
          <h1>
            Retrouvons
            <br />
            <em>votre espace.</em>
          </h1>
          <p className="yg-lead">
            Connectez-vous pour retrouver vos entraînements.
          </p>
          <Link className="yg-button" href="/">
            Se connecter ↗
          </Link>
        </main>
      </div>
    );
  return (
    <div className="yg-shell">
      <Header
        right={
          <>
            <Link
              href="/simulation"
              onClick={(e) => {
                e.preventDefault();
                setDetail(null);
                setSelected(null);
                void refresh();
              }}
            >
              Mon entraînement
            </Link>
            {isManager && <Link href="/studio">Studio pédagogique</Link>}
            <button onClick={() => void signOut()} aria-label="Se déconnecter">
              {profile?.full_name?.split(" ")[0] || "Mon compte"} <span>↗</span>
            </button>
          </>
        }
      />
      {detail ? (
        <Conversation
          key={detail.session.id}
          initial={detail}
          onBack={() => {
            setDetail(null);
            void refresh();
          }}
          onAgain={() => {
            const scenario = detail.scenario;
            setDetail(null);
            setSelected(scenario);
            setModuleNumber(detail.session.moduleNumber);
            void refresh();
          }}
        />
      ) : selected ? (
        <main className="yg-brief yg-enter">
          <button className="yg-link" onClick={() => setSelected(null)}>
            ← Les entraînements
          </button>
          <div className="yg-eyebrow">
            AVANT DE COMMENCER · {selected.durationMinutes} MIN ENVIRON
          </div>
          <h1>{selected.title}</h1>
          <p className="yg-lead">{selected.brief}</p>
          <div className="yg-brief-columns">
            <section className="yg-paper">
              <span className="yg-kicker">VOTRE INTERLOCUTEUR</span>
              <div className="yg-persona-monogram">
                {selected.personaName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <h2>{selected.personaName}</h2>
              <p>{selected.personaRole}</p>
              <hr />
              <p>
                Vous conduisez l’entretien. Prenez le temps de comprendre la
                situation avant de construire une réponse.
              </p>
            </section>
            <section className="yg-paper">
              <span className="yg-kicker">INSTALLEZ-VOUS TRANQUILLEMENT</span>
              <h2>Un espace pour pratiquer.</h2>
              <p>
                Vous pouvez hésiter, reformuler et faire une pause. Votre retour
                vous attend à la fin de l’échange.
              </p>
              <label className="yg-field">
                Module du parcours
                <select
                  value={moduleNumber}
                  onChange={(e) => setModuleNumber(Number(e.target.value))}
                >
                  {selected.modules.map((m) => (
                    <option value={m.number} key={m.number}>
                      Module {m.number} · {m.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="yg-button yg-button-soft"
                onClick={testMicrophone}
              >
                Vérifier mon microphone
              </button>
              {mic && (
                <p className="yg-small" role="status">
                  {mic}
                </p>
              )}
              <p className="yg-small">
                Un casque aide à éviter l’écho. Le mode écrit reste disponible.
              </p>
            </section>
          </div>
          {error && (
            <p className="yg-error" role="alert">
              {error}
            </p>
          )}
          <div className="yg-brief-bottom">
            <p>
              Vos échanges seront conservés pour votre retour
              <br />
              et le suivi de votre progression par votre formateur.
            </p>
            <button className="yg-button" disabled={busy} onClick={begin}>
              {busy ? "Préparation…" : "Rencontrer mon interlocuteur"}{" "}
              <span>↗</span>
            </button>
          </div>
        </main>
      ) : (
        <main className="yg-home yg-enter">
          <div className="yg-home-heading">
            <div>
              <div className="yg-eyebrow">VOTRE ESPACE D’ENTRAÎNEMENT</div>
              <h1>
                La confiance vient
                <br />
                <em>en pratiquant.</em>
              </h1>
              <p className="yg-lead">
                Un vrai échange. Le droit d’essayer.
                <br />
                Des repères pour progresser, à votre rythme.
              </p>
            </div>
            <div className="yg-progress-seal">
              <span>VOTRE PARCOURS</span>
              <strong>
                {sessions
                  .filter((s) => s.status === "completed")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <span>ENTRETIENS TERMINÉS</span>
            </div>
          </div>
          {error && (
            <div className="yg-error" role="alert">
              {error}
              <button className="yg-link" onClick={refresh}>
                Réessayer
              </button>
            </div>
          )}
          <div className="yg-section-title">
            <h2>Votre prochain échange</h2>
            <span>Découvrir le besoin · Relation client IT</span>
          </div>
          {!loaded ? (
            <p>Chargement des entraînements…</p>
          ) : scenarios.length === 0 ? (
            <section className="yg-paper">
              <h2>Votre prochain entretien se prépare.</h2>
              <p>Votre formateur publiera ici le scénario de votre parcours.</p>
              {isManager && (
                <Link className="yg-button" href="/studio">
                  Préparer le scénario ↗
                </Link>
              )}
            </section>
          ) : (
            <div className="yg-scenarios">
              {scenarios.map((s, i) => (
                <button
                  key={s.id}
                  className="yg-scenario"
                  onClick={() => {
                    setSelected(s);
                    setModuleNumber(s.modules[0]?.number || 1);
                  }}
                >
                  <div className="yg-scenario-art">
                    <div className="yg-art-orbit" />
                    <span className="yg-art-index">0{i + 1}</span>
                    <span className="yg-art-label">
                      ÉCOUTER
                      <br />
                      COMPRENDRE
                      <br />
                      EXPLORER
                    </span>
                  </div>
                  <div className="yg-scenario-body">
                    <span className="yg-kicker">
                      ENTRETIEN CLIENT · {s.durationMinutes} MIN
                    </span>
                    <h2>{s.title}</h2>
                    <p>{s.brief}</p>
                    <div>
                      <span>Préparer mon entretien</span>
                      <span className="yg-round-arrow">↗</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="yg-section-title">
            <h2>Votre progression se construit ici</h2>
            <span>Chaque tentative compte.</span>
          </div>
          {sessions.length === 0 ? (
            <div className="yg-empty-history">
              <span>01 →</span>
              <div>
                <h3>Tout commence par une conversation.</h3>
                <p>
                  Après votre premier entretien, retrouvez vos points d’appui et
                  vos pistes de progression.
                </p>
              </div>
            </div>
          ) : (
            <>
              <Progress sessions={sessions} />
              <div className="yg-history">
                {sessions.map((s, i) => (
                  <button key={s.id} disabled={busy} onClick={() => open(s.id)}>
                    <span className="yg-history-index">
                      {String(sessions.length - i).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{s.scenario?.title || "Entretien client"}</strong>
                      <small>
                        Module {s.moduleNumber} ·{" "}
                        {new Date(s.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                        })}
                      </small>
                    </span>
                    <span className="yg-status">
                      {s.status === "completed"
                        ? "Voir mon retour"
                        : s.status === "evaluating"
                          ? "Analyse en cours"
                          : s.status === "evaluation_failed"
                            ? "Relancer l’analyse"
                            : "Reprendre"}
                    </span>
                    <span>↗</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <footer className="yg-footer">
            <span>YouGotIt · L’aisance se travaille.</span>
            <span>EPITA Executive Education</span>
          </footer>
        </main>
      )}
    </div>
  );
}
export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="yg-header">
      <Link href="/" className="yg-brand">
        YouGotIt<span>↗</span>
      </Link>
      <nav>
        {right || (
          <span className="yg-header-label">
            L’ENTRAÎNEMENT QUI CHANGE LA CONVERSATION
          </span>
        )}
      </nav>
    </header>
  );
}
function Progress({ sessions }: { sessions: Session[] }) {
  // Longitudinal view: completed attempts on the same scenario version, oldest first.
  const completed = sessions.filter((s) => s.report).reverse();
  const latest = completed.at(-1);
  if (!latest?.report) return null;
  const series = completed
    .filter(
      (s) =>
        s.scenarioVersionId === latest.scenarioVersionId &&
        s.evaluationMetadata?.promptVersion ===
          latest.evaluationMetadata?.promptVersion &&
        s.evaluationMetadata?.model === latest.evaluationMetadata?.model,
    )
    .slice(-6);
  if (series.length < 2)
    return (
      <section className="yg-paper yg-progression">
        <span className="yg-kicker">VOTRE PROGRESSION</span>
        <p>
          Votre premier retour est prêt. Dès votre deuxième entretien, vous
          verrez ici l’évolution de chaque compétence.
        </p>
      </section>
    );
  return (
    <section className="yg-paper yg-progression">
      <span className="yg-kicker">VOS COMPÉTENCES AU FIL DES ENTRETIENS</span>
      <p className="yg-small">
        Tentatives sur la même version du scénario et de l’évaluation, de la
        plus ancienne à la plus récente. Chaque barre va de 0 à 4.
      </p>
      {latest.report.skills.map((skill) => {
        const scores = series.map(
          (s) =>
            s.report?.skills.find((k) => k.key === skill.key)?.score ?? null,
        );
        const first = scores.find((x) => x !== null),
          last = scores.at(-1);
        const delta = first != null && last != null ? last - first : 0;
        return (
          <div key={skill.key} className="yg-progress-row">
            <span>{skill.label}</span>
            <div>
              {series.map((s, i) => (
                <span
                  key={s.id}
                  title={`Module ${s.moduleNumber} · ${new Date(s.created_at).toLocaleDateString("fr-FR")} : ${scores[i] ?? "non observé"}`}
                >
                  <i
                    style={{
                      height: scores[i] == null ? 3 : 6 + scores[i]! * 9,
                      opacity: i === series.length - 1 ? 1 : 0.55,
                    }}
                  />
                </span>
              ))}
            </div>
            <strong className={delta > 0 ? "yg-up" : ""}>
              {delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : "="}
            </strong>
          </div>
        );
      })}
    </section>
  );
}
