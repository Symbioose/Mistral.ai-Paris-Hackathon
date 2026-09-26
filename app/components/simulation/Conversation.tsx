"use client";
import { useEffect, useRef, useState } from "react";
import Avatar, { type AvatarController, type AvatarMood } from "./Avatar";
import Report from "./Report";
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
  const [transcript, setTranscript] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [tips, setTips] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sound, setSound] = useState(false);
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
  }, [reply, detail.turns, transcript]);
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
  const minutes = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const state = analysisPending
    ? "Analyse de votre entretien"
    : speaking
      ? `${firstName(detail.scenario.personaName)} vous répond`
      : busy
        ? `${firstName(detail.scenario.personaName)} réfléchit`
        : connecting
          ? "Connexion du microphone"
          : partial
            ? "Je vous écoute…"
            : listening
              ? "À vous, je vous écoute"
              : avatarReady
                ? "Prêt à vous écouter"
                : "Préparation de l’entretien";

  return (
    <main className="yg-conversation yg-enter">
      <div className="yg-conversation-top">
        <button
          className="yg-link"
          onClick={() => {
            stopListening();
            interrupt();
            onBack();
          }}
        >
          ← Quitter, je reprendrai plus tard
        </button>
        <span>
          MODULE {detail.session.moduleNumber || 1} <i />{" "}
          {phase === "live" ? (
            <>
              ENTRETIEN · {minutes}
              <small> / ~{detail.scenario.durationMinutes} min</small>
            </>
          ) : (
            "AVANT DE COMMENCER"
          )}
        </span>
        <button
          className="yg-link"
          disabled={busy || evaluating || learnerTurns === 0}
          onClick={() => setConfirmEnd(true)}
        >
          Terminer l’entretien ↗
        </button>
      </div>
      <div
        className={`yg-room ${phase === "intro" ? "yg-room-intro" : ""} ${speaking ? "yg-room-speaking" : ""} ${partial ? "yg-room-listening" : ""}`}
      >
        <div className="yg-room-light" />
        <div className="yg-room-grid" />
        <div className="yg-persona-label">
          <span className="yg-live-dot" />
          {detail.scenario.personaName}
          <small>{detail.scenario.personaRole}</small>
        </div>
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
        {phase === "intro" ? (
          <div className="yg-start">
            <span className="yg-kicker">VOUS CONDUISEZ L’ENTRETIEN</span>
            <p>
              {firstName(detail.scenario.personaName)} vous attend.
              Présentez-vous,
              <br />
              puis laissez votre client raconter la situation.
            </p>
            <button
              className="yg-button"
              disabled={!avatarReady}
              onClick={() => void begin(true)}
            >
              {avatarReady ? (
                <>
                  Commencer à l’oral <span>↗</span>
                </>
              ) : (
                "Préparation…"
              )}
            </button>
            <button className="yg-link" onClick={() => void begin(false)}>
              Je préfère écrire
            </button>
          </div>
        ) : (
          <div className="yg-caption" aria-live="polite">
            {analysisPending ? (
              <>
                <span className="yg-kicker">VOTRE ENTRETIEN EST CONSERVÉ</span>
                <p>
                  Nous relisons vos échanges
                  <br />
                  pour préparer un retour précis.
                </p>
                <div className="yg-dots">
                  <i />
                  <i />
                  <i />
                </div>
              </>
            ) : partial ? (
              <>
                <span className="yg-kicker">VOUS</span>
                <p className="yg-caption-learner">{partial}</p>
              </>
            ) : pending && !reply ? (
              <>
                <span className="yg-kicker">VOUS</span>
                <p className="yg-caption-learner">{pending}</p>
                <div className="yg-dots">
                  <i />
                  <i />
                  <i />
                </div>
              </>
            ) : lastReply ? (
              <>
                <span className="yg-kicker">
                  {detail.scenario.personaName.toUpperCase()}
                </span>
                <p>« {lastReply} »</p>
              </>
            ) : (
              <>
                <span className="yg-kicker">À VOUS D’OUVRIR L’ÉCHANGE</span>
                <p>
                  Présentez-vous, puis invitez votre client
                  <br />à vous raconter la situation.
                </p>
              </>
            )}
          </div>
        )}
        <div className="yg-room-state">
          <span className={speaking || listening ? "yg-live-dot" : ""} />
          {state}
        </div>
      </div>
      {error && (
        <div className="yg-error" role="alert">
          <span>{error}</span>
          {detail.session.status === "evaluation_failed" && !evaluating && (
            <button className="yg-link" onClick={evaluate}>
              Relancer l’analyse ↗
            </button>
          )}
        </div>
      )}
      {phase === "live" && (
        <>
          <div className="yg-controls">
            <button
              className={`yg-mic ${listening ? "yg-mic-active" : ""}`}
              disabled={connecting || !canTalk}
              onClick={startListening}
              aria-pressed={listening}
            >
              <span ref={meter} className="yg-mic-meter" aria-hidden="true" />
              <Mic />
              {listening
                ? "Couper le micro"
                : connecting
                  ? "Connexion…"
                  : "Activer le micro"}
            </button>
            {speaking && (
              <button className="yg-button yg-button-soft" onClick={interrupt}>
                Prendre la parole
              </button>
            )}
            {partial && (
              <button
                className="yg-button yg-button-soft"
                onClick={() => listener.current?.flush()}
              >
                J’ai terminé ↗
              </button>
            )}
          </div>
          <form
            className="yg-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              aria-label="Votre message"
              placeholder={
                listening
                  ? "Parlez, ou écrivez ici…"
                  : "Écrivez votre message ici…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={6000}
              disabled={!canTalk}
            />
            <button
              aria-label="Envoyer le message"
              disabled={!input.trim() || !canTalk}
            >
              ↗
            </button>
          </form>
          <div className="yg-aside-links">
            <button
              className="yg-link"
              onClick={() => setTranscript(!transcript)}
            >
              {transcript ? "Masquer" : "Afficher"} les échanges (
              {detail.turns.length})
            </button>
            <button className="yg-link" onClick={() => setTips(!tips)}>
              {tips ? "Masquer" : "Afficher"} l’aide-mémoire
            </button>
            <button
              className="yg-link"
              onClick={toggleSound}
              aria-pressed={sound}
            >
              {sound ? "Couper la voix" : "Activer la voix"}
            </button>
          </div>
          {detail.session.status !== "active" && !detail.report && (
            <section className="yg-paper">
              <p>
                Votre entretien est terminé et conservé. Vous pouvez retrouver
                ou relancer son analyse.
              </p>
              <button
                className="yg-link"
                disabled={evaluating}
                onClick={evaluate}
              >
                Retrouver mon retour ↗
              </button>
            </section>
          )}
          {tips && (
            <section className="yg-tips yg-paper" aria-label="Aide-mémoire">
              <span className="yg-kicker">
                AIDE-MÉMOIRE · PISTES À EXPLORER
              </span>
              <ul>
                {(detail.scenario.learnerHints || []).map(
                  ({ title, example }) => (
                    <li key={title}>
                      <strong>{title}</strong>
                      <span>{example}</span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
          {transcript && (
            <section
              className="yg-transcript"
              aria-label="Transcription de l’entretien"
            >
              {detail.turns.map((t) => (
                <article
                  key={t.id}
                  className={t.role === "user" ? "yg-turn-user" : ""}
                >
                  <small>
                    {t.role === "user"
                      ? "VOUS"
                      : detail.scenario.personaName.toUpperCase()}
                  </small>
                  <p>{t.content}</p>
                </article>
              ))}
              {pending && (
                <article className="yg-turn-user">
                  <small>VOUS</small>
                  <p>{pending}</p>
                </article>
              )}
              {reply && (
                <article>
                  <small>{detail.scenario.personaName.toUpperCase()}</small>
                  <p>{reply}</p>
                </article>
              )}
              <div ref={scroll} />
            </section>
          )}
        </>
      )}
      {confirmEnd && (
        <div className="yg-modal-backdrop">
          <section
            className="yg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-title"
          >
            <span className="yg-kicker">PRENDRE DU RECUL</span>
            <h2 id="end-title">Prêt à découvrir votre retour ?</h2>
            <p>
              Votre entretien sera terminé et conservé. Nous analyserons votre
              démarche, avec des exemples tirés de vos échanges. Cela prend une
              trentaine de secondes.
            </p>
            <div className="yg-modal-actions">
              <button className="yg-button" autoFocus onClick={evaluate}>
                Terminer et analyser ↗
              </button>
              <button className="yg-link" onClick={() => setConfirmEnd(false)}>
                Continuer l’entretien
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const firstName = (name: string) => name.split(" ")[0];

function Mic() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" />
    </svg>
  );
}
