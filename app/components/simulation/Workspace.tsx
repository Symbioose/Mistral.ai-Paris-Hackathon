"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/providers/AuthProvider";
import Conversation from "./Conversation";
import { Arrow, Footer, MicIcon, TopBar, initialsOf } from "./Chrome";
import {
  api,
  type ScenarioCard,
  type Session,
  type SessionDetail,
  type HistoryPage,
} from "@/app/lib/conversation/types";

const STATUS: Record<Session["status"], string> = {
  completed: "Retour disponible",
  evaluating: "Analyse en cours",
  evaluation_failed: "Analyse à relancer",
  active: "À reprendre",
};

export default function Workspace() {
  const { profile, isAuthenticated, loading, isManager } = useAuth();
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<ScenarioCard | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [moduleNumber, setModuleNumber] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState<HistoryPage["nextCursor"]>(null);
  const loadMore = async () => {
    if (!cursor) return;
    setBusy(true);
    try {
      const data = await api<HistoryPage>(
        `/api/simulation/sessions?${new URLSearchParams(cursor)}`,
      );
      setSessions((old) => [
        ...old,
        ...data.sessions.filter((s) => !old.some((o) => o.id === s.id)),
      ]);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setError("");
    try {
      const [catalog, history] = await Promise.all([
        api<{ scenarios: ScenarioCard[] }>("/api/simulation/catalog"),
        api<HistoryPage>("/api/simulation/sessions"),
      ]);
      setScenarios(catalog.scenarios);
      setSessions(history.sessions);
      setCursor(history.nextCursor);
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
  const goHome = () => {
    setDetail(null);
    setSelected(null);
    void refresh();
  };

  if (loading)
    return (
      <div className="yg-app">
        <div className="yg-loading">Préparation de votre espace…</div>
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="yg-app">
        <TopBar />
        <main className="yg-page">
          <div className="yg-empty">
            <p className="yg-kicker">Session expirée</p>
            <h1 className="yg-title">Retrouvons votre espace.</h1>
            <p className="yg-small">
              Connectez-vous avec les identifiants transmis par votre formateur.
            </p>
            <div>
              <Link className="yg-btn" href="/">
                Se connecter <Arrow />
              </Link>
            </div>
          </div>
        </main>
      </div>
    );

  if (detail)
    return (
      <div className="yg-app">
        <TopBar current="training" onHome={goHome} />
        <Conversation
          key={detail.session.id}
          initial={detail}
          onBack={goHome}
          onAgain={() => {
            const scenario = detail.scenario;
            setDetail(null);
            setSelected(scenario);
            setModuleNumber(detail.session.moduleNumber);
            void refresh();
          }}
        />
      </div>
    );

  const firstName = profile?.full_name?.split(" ")[0];
  const completed = sessions.filter((s) => s.status === "completed");
  const last = sessions[0];
  const main = scenarios[0];
  return (
    <div className="yg-app">
      <TopBar current="training" onHome={goHome} />
      {selected ? (
        <Brief
          scenario={selected}
          moduleNumber={moduleNumber}
          setModuleNumber={setModuleNumber}
          busy={busy}
          error={error}
          onBack={() => setSelected(null)}
          onBegin={begin}
          attempts={sessions.filter((s) => s.scenario?.id === selected.id).length}
        />
      ) : (
        <main className="yg-page">
          <div className="yg-hello">
            <div className="yg-reveal" style={{ display: "grid", gap: 18 }}>
              <p className="yg-kicker">
                Votre espace d’entraînement
                {isManager && (
                  <>
                    {" · "}
                    <Link className="yg-link" href="/studio">
                      Ouvrir le studio
                    </Link>
                  </>
                )}
              </p>
              <h1 className="yg-display">
                {firstName ? `Bonjour ${firstName}.` : "Bonjour."}
                <br />
                <em>{completed.length ? "On reprend ?" : "On commence ?"}</em>
              </h1>
            </div>
            <div className="yg-stats yg-reveal" aria-label="Votre activité">
              <div className="yg-stat">
                <strong>{String(completed.length).padStart(2, "0")}</strong>
                <span>Entretiens analysés</span>
              </div>
              <div className="yg-stat">
                <strong>
                  {last
                    ? new Date(last.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                    : "—"}
                </strong>
                <span>Dernière séance</span>
              </div>
            </div>
          </div>

          {main && main.modules.length > 1 && (
            <ol className="yg-track" style={{ "--steps": main.modules.length } as React.CSSProperties} aria-label="Parcours">
              {main.modules.map((m) => {
                const done = completed.some((s) => s.moduleNumber === m.number);
                const current = (last?.moduleNumber || main.modules[0].number) === m.number;
                return (
                  <li key={m.number} className={current ? "is-current" : done ? "is-done" : ""}>
                    <span>Module {m.number}</span>
                    <strong>{m.title}</strong>
                  </li>
                );
              })}
            </ol>
          )}

          {error && (
            <div className="yg-alert" role="alert" style={{ marginTop: 32 }}>
              <span>{error}</span>
              <button className="yg-link" onClick={refresh}>
                Réessayer
              </button>
            </div>
          )}

          <section className="yg-section">
            <div className="yg-section-head">
              <h2>Votre prochain entretien</h2>
              <span>{scenarios.length} scénario{scenarios.length > 1 ? "s" : ""} disponible{scenarios.length > 1 ? "s" : ""}</span>
            </div>
            {!loaded ? (
              <p className="yg-small">Chargement des entretiens…</p>
            ) : scenarios.length === 0 ? (
              <div className="yg-empty">
                <h3 className="yg-h3">Votre prochain entretien se prépare.</h3>
                <p className="yg-small">Votre formateur publiera ici le scénario de votre parcours.</p>
                {isManager && (
                  <div>
                    <Link className="yg-btn" href="/studio">
                      Préparer un scénario <Arrow />
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 20 }}>
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    className="yg-mission yg-reveal"
                    onClick={() => {
                      setSelected(s);
                      setModuleNumber(last?.scenario?.id === s.id ? last.moduleNumber : s.modules[0]?.number || 1);
                    }}
                  >
                    <figure className="yg-mission-stage">
                      <span className="yg-kicker">
                        <span className="yg-dot" /> Interlocuteur
                      </span>
                      <span className="yg-monogram" aria-hidden="true">
                        {initialsOf(s.personaName)}
                      </span>
                      <figcaption>
                        <strong>{s.personaName}</strong>
                        <span>{s.personaRole}</span>
                      </figcaption>
                    </figure>
                    <div className="yg-mission-body">
                      <p className="yg-kicker">Entretien de découverte</p>
                      <h3 className="yg-title">{s.title}</h3>
                      <p className="yg-lead" style={{ fontSize: 16 }}>{s.brief}</p>
                      <dl className="yg-meta">
                        <div><dt>Durée</dt><dd>~{s.durationMinutes} min</dd></div>
                        <div><dt>Modules</dt><dd>{s.modules.length}</dd></div>
                        <div><dt>Tentatives</dt><dd>{sessions.filter((x) => x.scenario?.id === s.id).length}</dd></div>
                      </dl>
                      <div className="yg-mission-cta">
                        <span className="yg-small">Préparation en 1 minute, micro ou clavier.</span>
                        <span className="yg-btn">
                          Préparer l’entretien <Arrow />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="yg-section">
            <div className="yg-section-head">
              <h2>Votre progression</h2>
              <span>Niveaux de 0 à 4 · même version du scénario</span>
            </div>
            {sessions.length === 0 ? (
              <div className="yg-empty">
                <h3 className="yg-h3">Tout commence par une conversation.</h3>
                <p className="yg-small">Après votre premier entretien, vos sept compétences apparaîtront ici, séance après séance.</p>
              </div>
            ) : (
              <Progress sessions={sessions} />
            )}
          </section>

          {sessions.length > 0 && (
            <section className="yg-section">
              <div className="yg-section-head">
                <h2>Historique</h2>
                <span>{sessions.length} entretien{sessions.length > 1 ? "s" : ""}</span>
              </div>
              <div className="yg-ledger">
                {sessions.map((s, i) => (
                  <button key={s.id} className="yg-ledger-row" disabled={busy} onClick={() => open(s.id)}>
                    <span>#{String(sessions.length - i).padStart(2, "0")}</span>
                    <span>
                      <strong>{s.scenario?.title || "Entretien client"}</strong>
                      <small>
                        Module {s.moduleNumber} ·{" "}
                        {new Date(s.created_at).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}
                      </small>
                    </span>
                    <span className="yg-status">
                      <span className={`yg-dot ${s.status === "completed" ? "yg-dot--ok" : ""}`} />
                      {STATUS[s.status]}
                    </span>
                    <Arrow />
                  </button>
                ))}
              </div>
              {cursor && (
                <div style={{ marginTop: 20 }}>
                  <button className="yg-btn yg-btn--ghost" disabled={busy} onClick={loadMore}>
                    Entretiens précédents
                  </button>
                </div>
              )}
            </section>
          )}
        </main>
      )}
      <Footer />
    </div>
  );
}

function Brief({
  scenario,
  moduleNumber,
  setModuleNumber,
  busy,
  error,
  onBack,
  onBegin,
  attempts,
}: {
  scenario: ScenarioCard;
  moduleNumber: number;
  setModuleNumber: (n: number) => void;
  busy: boolean;
  error: string;
  onBack: () => void;
  onBegin: () => void;
  attempts: number;
}) {
  return (
    <main className="yg-page">
      <button className="yg-link" onClick={onBack}>
        ← Retour à l’espace
      </button>
      <div className="yg-brief">
        <aside className="yg-dossier yg-reveal">
          <div className="yg-dossier-photo">
            <span className="yg-kicker">Fiche interlocuteur</span>
            <span className="yg-monogram" aria-hidden="true">{initialsOf(scenario.personaName)}</span>
          </div>
          <dl>
            <div><dt>Nom</dt><dd>{scenario.personaName}</dd></div>
            <div><dt>Fonction</dt><dd>{scenario.personaRole}</dd></div>
            <div><dt>Durée</dt><dd>Environ {scenario.durationMinutes} minutes</dd></div>
            <div><dt>Tentatives</dt><dd>{attempts ? `${attempts} déjà réalisée${attempts > 1 ? "s" : ""}` : "Première fois"}</dd></div>
          </dl>
        </aside>
        <section className="yg-reveal">
          <p className="yg-kicker">Avant d’entrer</p>
          <h1 className="yg-title" style={{ marginTop: 14 }}>{scenario.title}</h1>
          <ol className="yg-checklist">
            <li>
              <div>
                <h2 className="yg-h3">La situation</h2>
                <p className="yg-lead" style={{ fontSize: 16 }}>{scenario.brief}</p>
                <p className="yg-small">
                  C’est vous qui menez l’entretien. Votre interlocuteur ne dira pas tout spontanément :
                  le besoin se découvre en posant des questions.
                </p>
              </div>
            </li>
            <li>
              <div>
                <h2 className="yg-h3">Votre module</h2>
                <div className="yg-modules" role="group" aria-label="Module du parcours">
                  {scenario.modules.map((m) => (
                    <button key={m.number} aria-pressed={m.number === moduleNumber} onClick={() => setModuleNumber(m.number)}>
                      <span>{String(m.number).padStart(2, "0")}</span>
                      {m.title}
                    </button>
                  ))}
                </div>
              </div>
            </li>
            <li>
              <div>
                <h2 className="yg-h3">Votre micro</h2>
                <MicCheck />
                <p className="yg-small">Un casque évite l’écho. Vous pourrez aussi écrire à tout moment.</p>
              </div>
            </li>
          </ol>
          {error && <p className="yg-alert" role="alert" style={{ marginTop: 20 }}>{error}</p>}
          <div className="yg-brief-go">
            <p className="yg-small" style={{ maxWidth: "46ch" }}>
              Vos échanges sont conservés pour votre retour et le suivi de votre progression par votre formateur.
            </p>
            <button className="yg-btn yg-btn--signal yg-btn--lg" disabled={busy} onClick={onBegin}>
              {busy ? "Préparation de la salle…" : <>Entrer dans la salle <Arrow /></>}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

/** Live microphone check: the learner sees their own voice move the meter before the interview. */
function MicCheck() {
  const [state, setState] = useState<"idle" | "listening" | "ok" | "silent" | "blocked">("idle");
  const [level, setLevel] = useState(0);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      setState("listening");
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      let frame = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += s * s;
        const rms = Math.min(1, Math.sqrt(sum / samples.length) * 7);
        peak = Math.max(peak, rms);
        setLevel(rms);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      const timer = setTimeout(() => finish(), 4000);
      const finish = () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        source.disconnect();
        void ctx.close();
        setLevel(0);
        setState(peak > 0.06 ? "ok" : "silent");
      };
      stop.current = finish;
    } catch {
      setState("blocked");
    }
  };
  const message = {
    idle: "Testez votre micro en disant quelques mots.",
    listening: "Parlez normalement… « Bonjour, je suis ravi de vous rencontrer. »",
    ok: "Parfait, on vous entend bien.",
    silent: "Aucun son détecté. Vérifiez l’entrée audio de votre ordinateur.",
    blocked: "Le navigateur bloque le micro. Autorisez-le dans la barre d’adresse, ou utilisez le clavier.",
  }[state];
  return (
    <div className="yg-miccheck">
      <button className="yg-btn yg-btn--ghost" onClick={start} disabled={state === "listening"}>
        <MicIcon size={18} /> {state === "idle" ? "Tester" : "Refaire le test"}
      </button>
      <span className="yg-meter" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} className={level * 14 > i ? "on" : ""} style={{ height: 6 + i * 1.2 }} />
        ))}
      </span>
      <span className="yg-small" role="status" style={{ color: state === "ok" ? "var(--good)" : undefined }}>
        {message}
      </span>
    </div>
  );
}

/** Skill × attempt matrix on comparable sessions (same scenario version, judge prompt and model). */
export function Progress({ sessions, trainer = false }: { sessions: Session[]; trainer?: boolean }) {
  const completed = sessions.filter((s) => s.report).reverse();
  const latest = completed.at(-1);
  if (!latest?.report)
    return (
      <div className="yg-empty">
        <p className="yg-small">
          {trainer ? "Aucun rapport terminé pour l’instant." : "Terminez un entretien pour voir apparaître vos niveaux."}
        </p>
      </div>
    );
  const series = completed
    .filter(
      (s) =>
        s.scenarioVersionId === latest.scenarioVersionId &&
        s.evaluationMetadata?.promptVersion === latest.evaluationMetadata?.promptVersion &&
        s.evaluationMetadata?.model === latest.evaluationMetadata?.model,
    )
    .slice(-6);
  return (
    <div className="yg-matrix">
      <table>
        <thead>
          <tr>
            <th scope="col">Compétence</th>
            {series.map((s, i) => (
              <th scope="col" key={s.id}>
                {i === series.length - 1 ? "Dernier" : `#${i + 1}`}
                <br />
                {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </th>
            ))}
            <th scope="col">Évolution</th>
          </tr>
        </thead>
        <tbody>
          {latest.report.skills.map((skill) => {
            const scores = series.map((s) => s.report?.skills.find((k) => k.key === skill.key)?.score ?? null);
            const first = scores.find((x) => x !== null);
            const lastScore = scores.at(-1);
            const delta = series.length > 1 && first != null && lastScore != null ? lastScore - first : null;
            return (
              <tr key={skill.key}>
                <th scope="row">{skill.label}</th>
                {scores.map((score, i) => (
                  <td key={series[i].id}>
                    <span className="yg-cell" data-s={score ?? ""} title={score == null ? "Non observé" : `${score} / 4`}>
                      {score ?? "·"}
                    </span>
                  </td>
                ))}
                <td>
                  <span className={`yg-delta ${delta && delta > 0 ? "is-up" : ""}`}>
                    {delta == null ? "—" : delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : "="}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {series.length < 2 && (
        <p className="yg-small yg-matrix-note">
          {trainer
            ? "Un deuxième entretien comparable permettra de mesurer l’évolution."
            : "Dès votre deuxième entretien, l’évolution de chaque compétence s’affichera ici."}
        </p>
      )}
    </div>
  );
}
