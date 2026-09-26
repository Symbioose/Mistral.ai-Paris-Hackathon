"use client";
import { useEffect, useRef, useState } from "react";
import Avatar, { type AvatarController, type AvatarMood } from "./Avatar";
import Report from "./Report";
import { Arrow, MicIcon } from "./Chrome";
import { Listener, voiceProvider } from "@/app/lib/conversation/audio";
import { api, type SessionDetail } from "@/app/lib/conversation/types";

import { useDialog } from "@/app/lib/conversation/useDialog";

type Phase = "intro" | "live";

export default function Conversation({
  initial,
  onBack,
  onAgain,
}: {
  initial: SessionDetail;
  onBack: () => void;
  onAgain: () => void;
}) {
  const [detail, setDetail] = useState(initial);
  const [phase, setPhase] = useState<Phase>(
    initial.turns.length ? "live" : "intro",
  );
  const [input, setInput] = useState("");
  const [partial, setPartial] = useState("");
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState("");
  const [busy, setBusy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sound, setSound] = useState(false);
  const [panel, setPanel] = useState<"transcript" | "tips" | null>(null);
  const [writing, setWriting] = useState(false);
  const [analysisSeconds, setAnalysisSeconds] = useState(0);
  const avatar = useRef<AvatarController | null>(null);
  const listener = useRef<Listener | null>(null);
  const audioAllowed = useRef(false);
  const mutedTurn = useRef(false);
  const busyRef = useRef(false);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const queued = useRef("");
  const retry = useRef<{ text: string; id: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const meter = useRef<HTMLSpanElement>(null);
  const turnEndedAt = useRef(0);
  const request = useRef<AbortController | null>(null);
  useDialog(confirmEnd, () => setConfirmEnd(false));
  const analysisPending = evaluating || detail.session.status === "evaluating";
  const canTalk = detail.session.status === "active" && !evaluating;
  useEffect(() => {
    if (detail.session.status !== "evaluating" || detail.report) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void api<SessionDetail>(`/api/simulation/sessions/${detail.session.id}`)
        .then((value) => {
          if (!cancelled) setDetail(value);
        })
        .catch(() => {});
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [detail.session.status, detail.session.id, detail.report]);

  // Drives the analysis screen: the judge takes 20–50 s, the learner sees what is happening.
  useEffect(() => {
    if (!analysisPending) return;
    setAnalysisSeconds(0);
    const timer = setInterval(() => setAnalysisSeconds((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [analysisPending]);
  useEffect(() => {
    alive.current = true;
    void voiceProvider();
    return () => {
      alive.current = false;
      request.current?.abort();
      listener.current?.dispose();
      avatar.current?.speaker.interrupt();
    };
  }, []);
  useEffect(() => {
    scroll.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [reply, detail.turns, panel]);
  useEffect(() => {
    if (phase !== "live") return;
    const started = Date.now() - elapsed * 1000;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live microphone level: the learner sees that they are heard.
  useEffect(() => {
    if (!listening) return;
    let frame = 0;
    const tick = () => {
      const level = listener.current?.level() || 0;
      meter.current?.style.setProperty("--level", String(level));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [listening]);

  const react = (mood: AvatarMood) => avatar.current?.react(mood);
  const stopListening = () => {
    listener.current?.dispose();
    listener.current = null;
    setListening(false);
    setConnecting(false);
  };
  const interrupt = () => {
    mutedTurn.current = true;
    avatar.current?.speaker.interrupt();
    setSpeaking(false);
  };

  const send = async (text: string) => {
    if (!text.trim() || !canTalk || !alive.current) return;
    if (busyRef.current) {
      queued.current = [queued.current, text].filter(Boolean).join(" ");
      interrupt();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setInput("");
    setPartial("");
    setReply("");
    setPending(text);
    mutedTurn.current = false;
    react("thinking");
    const rid =
      retry.current?.text === text ? retry.current.id : crypto.randomUUID();
    retry.current = { text, id: rid };
    const started = turnEndedAt.current || performance.now();
    turnEndedAt.current = 0;
    let first = true;
    let done = false;
    const speaker = avatar.current?.speaker;
    // TTS connects while the persona request is in flight; text never waits for audio.
    const voice =
      audioAllowed.current && speaker
        ? speaker.begin(detail.scenario.voice || {}).catch((e) => {
            audioAllowed.current = false;
            setError(
              e instanceof Error
                ? e.message
                : "Voix indisponible, la réponse reste affichée.",
            );
          })
        : Promise.resolve();
    try {
      request.current = new AbortController();
      const response = await fetch(
        `/api/simulation/sessions/${detail.session.id}/turn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, requestId: rid }),
          signal: request.current.signal,
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || "Connexion interrompue. Réessayez votre message.",
        );
      }
      if (!response.body) throw new Error("La réponse est vide.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let spoken = "";
      for (;;) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const raw = frame.match(/^data: (.+)$/m)?.[1];
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (event === "error") throw new Error(data.message);
          if (event === "delta") {
            if (first) {
              first = false;
              performance.measure("yougotit-first-token", {
                start: started,
                end: performance.now(),
              });
            }
            spoken += data.text;
            if (alive.current) setReply(spoken);
            await voice;
            if (alive.current && !mutedTurn.current && audioAllowed.current)
              speaker?.push(data.text);
          }
          if (event === "done") done = true;
        }
        if (chunk.done) break;
      }
      if (!done)
        throw new Error(
          "La connexion a été interrompue. Réessayez votre message.",
        );
      if (!mutedTurn.current) speaker?.finish();
      const saved = await api<SessionDetail>(
        `/api/simulation/sessions/${detail.session.id}`,
      );
      if (alive.current) {
        setDetail(saved);
        setPending("");
        setReply("");
      }
      retry.current = null;
    } catch (e) {
      interrupt();
      if (alive.current) {
        setError(e instanceof Error ? e.message : "Réponse interrompue.");
        setInput(text);
        setReply("");
        setPending("");
      }
    } finally {
      busyRef.current = false;
      if (alive.current) {
        setBusy(false);
        if (queued.current && !retry.current) {
          const next = queued.current;
          queued.current = "";
          void sendRef.current(next);
        }
      }
    }
  };
  sendRef.current = send;

  const startListening = async () => {
    if (listening) {
      stopListening();
      return;
    }
    if (!canTalk) return;
    setError("");
    setConnecting(true);
    audioAllowed.current = true;
    setSound(true);
    if (avatar.current) void avatar.current.speaker.context.resume();
    const capture = new Listener();
    listener.current = capture;
    capture.onText = (text) => {
      setPartial(text);
      if (!text) return;
      react("listening");
      // Barge-in: two words are enough to show the learner wants the floor.
      if (avatar.current?.speaker.playing && text.split(/\s+/).length >= 2)
        interrupt();
    };
    capture.onTurn = (text) => {
      turnEndedAt.current = performance.now();
      void sendRef.current(text);
    };
    capture.onError = (message) => {
      setError(message);
      stopListening();
    };
    try {
      await capture.start();
      if (listener.current === capture) setListening(true);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Le navigateur bloque le microphone. Autorisez-le dans la barre d’adresse, ou écrivez vos messages."
          : e instanceof Error
            ? e.message
            : "Microphone indisponible.",
      );
      stopListening();
    } finally {
      setConnecting(false);
    }
  };

  // Both modes hear the persona; only the input differs. The click unlocks audio playback.
  const begin = async (withMic: boolean) => {
    setPhase("live");
    audioAllowed.current = true;
    setSound(true);
    if (avatar.current) void avatar.current.speaker.context.resume();
    if (withMic) await startListening();
    else setWriting(true);
  };
  const toggleSound = () => {
    const next = !audioAllowed.current;
    audioAllowed.current = next;
    setSound(next);
    if (!next) interrupt();
    else void avatar.current?.speaker.context.resume();
  };

  const evaluate = async () => {
    stopListening();
    interrupt();
    setConfirmEnd(false);
    setEvaluating(true);
    setError("");
    try {
      const { report } = await api<{ report: SessionDetail["report"] }>(
        `/api/simulation/sessions/${detail.session.id}/evaluate`,
        {},
      );
      setDetail((d) => ({
        ...d,
        report,
        session: { ...d.session, status: "completed" },
      }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Analyse indisponible. Votre entretien est conservé.",
      );
      setDetail((d) => ({
        ...d,
        session: { ...d.session, status: "evaluation_failed" },
      }));
    } finally {
      setEvaluating(false);
    }
  };

  if (detail.report)
    return (
      <Report
        report={detail.report}
        turns={detail.turns}
        scenario={detail.scenario}
        moduleNumber={detail.session.moduleNumber}
        onAgain={onAgain}
        onBack={onBack}
      />
    );

  const lastReply =
    reply ||
    (!pending
      ? [...detail.turns].reverse().find((t) => t.role === "assistant")?.content
      : "");
  const learnerTurns = detail.turns.filter((t) => t.role === "user").length;
  const minutes = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const name = firstName(detail.scenario.personaName);
  const state = analysisPending
    ? "Analyse en cours"
    : speaking
      ? `${name} parle`
      : busy
        ? `${name} réfléchit`
        : connecting
          ? "Connexion du micro"
          : partial
            ? "Vous parlez"
            : listening
              ? "À vous · micro ouvert"
              : phase === "intro"
                ? avatarReady ? "Prêt" : "Préparation"
                : "Micro coupé";
  const step = Math.min(ANALYSIS.length - 1, Math.floor(analysisSeconds / 9));

  return (
    <main className={`yg-stage ${speaking ? "is-speaking" : ""} ${writing && phase === "live" && canTalk ? "is-writing" : ""}`} aria-label={`Entretien avec ${detail.scenario.personaName}`}>
      <Avatar
        onReady={(controller) => {
          avatar.current = controller;
          const prior = controller.speaker.onPlaying;
          controller.speaker.onPlaying = (p) => {
            prior(p);
            setSpeaking(p);
            if (p) controller.react("speaking");
          };
          controller.speaker.onError = (e) => setError(e);
          setAvatarReady(true);
        }}
        onError={setError}
      />

      <div className="yg-stage-bar">
        <div className="yg-persona">
          <strong>
            <span className={`yg-dot ${speaking ? "yg-dot--live" : ""}`} />
            {detail.scenario.personaName}
          </strong>
          <span>{detail.scenario.personaRole}</span>
        </div>
        <div className="yg-rec" aria-label="Durée de l’entretien">
          {phase === "live" ? <span className="yg-dot yg-dot--live" /> : <span className="yg-dot" style={{ background: "var(--stage-mute)" }} />}
          <time>{minutes}</time>
          <span>/ ~{detail.scenario.durationMinutes} min · Module {detail.session.moduleNumber || 1}</span>
        </div>
      </div>

      {error && (
        <div className="yg-stage-alert" role="alert">
          <span>{error}</span>
          {detail.session.status === "evaluation_failed" && !evaluating ? (
            <button onClick={evaluate}>Relancer l’analyse</button>
          ) : (
            <button onClick={() => setError("")} aria-label="Fermer le message">×</button>
          )}
        </div>
      )}

      {phase === "intro" ? (
        <div className="yg-cue">
          <p className="yg-kicker">Vous conduisez l’entretien</p>
          <p>
            {name} vous attend. Présentez-vous, puis invitez {name} à raconter la situation.
          </p>
          <div className="yg-cue-actions">
            <button className="yg-btn yg-btn--signal yg-btn--lg" disabled={!avatarReady} onClick={() => void begin(true)}>
              {avatarReady ? <><MicIcon size={18} /> Commencer à l’oral</> : "Préparation de la salle…"}
            </button>
            <button className="yg-btn yg-btn--ghost yg-btn--lg" disabled={!avatarReady} onClick={() => void begin(false)}>
              Je préfère écrire
            </button>
          </div>
        </div>
      ) : (
        <div className="yg-subtitle" aria-live="polite">
          {partial ? (
            <>
              <span className="yg-kicker">Vous</span>
              <p className="is-learner">{partial}</p>
            </>
          ) : pending && !reply ? (
            <>
              <span className="yg-kicker">Vous</span>
              <p className="is-learner">{pending}</p>
              <span className="yg-typing" aria-label={`${name} réfléchit`}><i /><i /><i /></span>
            </>
          ) : lastReply ? (
            <>
              <span className="yg-kicker">{detail.scenario.personaName}</span>
              <p>{lastReply}</p>
            </>
          ) : (
            <>
              <span className="yg-kicker">À vous d’ouvrir l’échange</span>
              <p>Présentez-vous, puis invitez votre interlocuteur à raconter la situation.</p>
            </>
          )}
        </div>
      )}

      {phase === "live" && writing && canTalk && (
        <form
          className="yg-compose"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            autoFocus
            aria-label="Votre message"
            placeholder={`Écrivez à ${name}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={6000}
          />
          <button disabled={!input.trim()}>Envoyer</button>
        </form>
      )}

      {phase === "live" && (
        <div className="yg-console">
          <div className="yg-console-side">
            <span className="yg-state" role="status">
              <span className={`yg-dot ${listening || speaking ? "yg-dot--live" : ""}`} style={listening || speaking ? undefined : { background: "var(--stage-mute)" }} />
              {state}
            </span>
            {speaking && (
              <button className="yg-tool" onClick={interrupt}>
                Interrompre
              </button>
            )}
            {partial && (
              <button className="yg-tool" onClick={() => listener.current?.flush()}>
                J’ai terminé
              </button>
            )}
          </div>
          <button
            className={`yg-mic ${listening ? "is-on" : ""}`}
            disabled={connecting || !canTalk}
            onClick={startListening}
            aria-pressed={listening}
            aria-label={listening ? "Couper le micro" : "Activer le micro"}
          >
            <span ref={meter} className="yg-mic-ring" aria-hidden="true" />
            <MicIcon />
            <span className="yg-mic-label">{listening ? "Micro ouvert" : connecting ? "Connexion…" : "Parler"}</span>
          </button>
          <div className="yg-console-side">
            <button className="yg-tool" aria-pressed={writing} onClick={() => setWriting(!writing)} disabled={!canTalk}>
              <KeyboardIcon /> <span className="yg-tool-label">Écrire</span>
            </button>
            <button className="yg-tool" aria-pressed={panel === "transcript"} onClick={() => setPanel(panel === "transcript" ? null : "transcript")}>
              <TextIcon /> <span className="yg-tool-label">Échanges · {learnerTurns}</span>
            </button>
            {(detail.scenario.learnerHints || []).length > 0 && (
              <button className="yg-tool" aria-pressed={panel === "tips"} onClick={() => setPanel(panel === "tips" ? null : "tips")}>
                <HintIcon /> <span className="yg-tool-label">Aide</span>
              </button>
            )}
            <button className="yg-tool" aria-pressed={!sound} onClick={toggleSound} aria-label={sound ? "Couper la voix" : "Activer la voix"}>
              {sound ? <SoundIcon /> : <MuteIcon />}
            </button>
            {detail.session.status === "active" ? (
              <button className="yg-tool yg-tool--end" disabled={busy || evaluating || learnerTurns === 0} onClick={() => setConfirmEnd(true)}>
                Terminer
              </button>
            ) : (
              !detail.report && (
                <button className="yg-tool yg-tool--end" disabled={evaluating} onClick={evaluate}>
                  Voir mon retour
                </button>
              )
            )}
          </div>
        </div>
      )}

      {panel && (
        <aside className="yg-drawer" aria-label={panel === "tips" ? "Aide-mémoire" : "Transcription"}>
          <div className="yg-drawer-head">
            <div className="yg-drawer-tabs">
              <button aria-pressed={panel === "transcript"} onClick={() => setPanel("transcript")}>Échanges</button>
              {(detail.scenario.learnerHints || []).length > 0 && (
                <button aria-pressed={panel === "tips"} onClick={() => setPanel("tips")}>Aide-mémoire</button>
              )}
            </div>
            <button className="yg-close" onClick={() => setPanel(null)}>Fermer</button>
          </div>
          <div className="yg-drawer-body">
            {panel === "tips" ? (
              <>
                <p className="yg-small">Des pistes, pas un script. Formulez avec vos mots.</p>
                {(detail.scenario.learnerHints || []).map(({ title, example }) => (
                  <div className="yg-hint" key={title}>
                    <strong>{title}</strong>
                    <span>{example}</span>
                  </div>
                ))}
              </>
            ) : detail.turns.length === 0 && !pending ? (
              <p className="yg-small">Vos échanges apparaîtront ici au fil de l’entretien.</p>
            ) : (
              <>
                {detail.turns.map((t) => (
                  <div key={t.id} className={`yg-turn ${t.role === "user" ? "is-user" : ""}`}>
                    <small>{t.role === "user" ? "Vous" : detail.scenario.personaName}</small>
                    <p>{t.content}</p>
                  </div>
                ))}
                {pending && (
                  <div className="yg-turn is-user"><small>Vous</small><p>{pending}</p></div>
                )}
                {reply && (
                  <div className="yg-turn"><small>{detail.scenario.personaName}</small><p>{reply}</p></div>
                )}
                <div ref={scroll} />
              </>
            )}
          </div>
        </aside>
      )}

      {analysisPending && (
        <div className="yg-analysis" role="status" aria-live="polite">
          <div className="yg-analysis-card">
            <p className="yg-kicker" style={{ color: "var(--stage-mute)" }}>
              <span className="yg-dot yg-dot--live" /> Votre entretien est conservé
            </p>
            <h2>Nous relisons vos échanges.</h2>
            <p className="yg-small" style={{ color: "var(--stage-mute)" }}>Ce que l’analyse examine :</p>
            <ol>
              {ANALYSIS.map((label, i) => (
                <li key={label} className={i < step ? "is-done" : i === step ? "is-active" : ""}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{label}</span>
                  <span aria-hidden="true">{i === step ? "···" : ""}</span>
                </li>
              ))}
            </ol>
            <div className="yg-analysis-bar"><i style={{ width: `${Math.min(95, (analysisSeconds / 45) * 100)}%` }} /></div>
            <p className="yg-small" style={{ color: "var(--stage-mute)" }}>
              Environ une demi-minute. Chaque observation s’appuiera sur vos propres mots.
            </p>
          </div>
        </div>
      )}

      {confirmEnd && (
        <div className="yg-modal-backdrop" onClick={() => setConfirmEnd(false)}>
          <section className="yg-modal" role="dialog" aria-modal="true" aria-labelledby="end-title" onClick={(e) => e.stopPropagation()}>
            <p className="yg-kicker">Fin de l’entretien</p>
            <h2 id="end-title" className="yg-title">Prêt à découvrir votre retour ?</h2>
            <p className="yg-lead" style={{ fontSize: 16 }}>
              L’entretien sera clôturé et conservé. Vous recevrez une analyse de votre démarche,
              illustrée par vos propres phrases.
            </p>
            <div className="yg-modal-actions">
              <button className="yg-btn yg-btn--signal" autoFocus onClick={evaluate}>
                Terminer et analyser <Arrow />
              </button>
              <button className="yg-btn yg-btn--ghost" onClick={() => setConfirmEnd(false)}>
                Continuer l’entretien
              </button>
            </div>
          </section>
        </div>
      )}

      <button
        className="yg-tool"
        style={{ position: "absolute", zIndex: 4, top: 64, left: "clamp(16px, 3vw, 32px)", paddingLeft: 0 }}
        onClick={() => {
          stopListening();
          interrupt();
          onBack();
        }}
      >
        ← Quitter · reprendre plus tard
      </button>
    </main>
  );
}

const ANALYSIS = [
  "Relecture complète de l’entretien",
  "Repérage de vos questions",
  "Carte du besoin découvert",
  "Rédaction de votre retour",
];

const firstName = (name: string) => name.split(" ")[0];

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d={d} />
  </svg>
);
const KeyboardIcon = () => <Icon d="M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10" />;
const TextIcon = () => <Icon d="M4 6h16M4 12h16M4 18h10" />;
const HintIcon = () => <Icon d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />;
const SoundIcon = () => <Icon d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />;
const MuteIcon = () => <Icon d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6" />;
