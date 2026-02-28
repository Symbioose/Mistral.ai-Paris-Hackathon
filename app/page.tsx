"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameState, GameAction, GameResponse, INITIAL_GAME_STATE } from "@/app/lib/types";
import SidePanel from "@/app/components/SidePanel";
import DialogueBox from "@/app/components/DialogueBox";
import PushToTalk from "@/app/components/PushToTalk";
import TextInput from "@/app/components/TextInput";
import FileUpload from "@/app/components/FileUpload";

export default function Home() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [speakerName, setSpeakerName] = useState("Maître du Jeu");
  const [speakerType, setSpeakerType] = useState<"narrator" | "npc">("narrator");
  const [hasMic, setHasMic] = useState(true);
  // RAG context: null = no doc uploaded, string = doc text
  const [documentContext, setDocumentContext] = useState<string | null>(null);
  const [documentFilename, setDocumentFilename] = useState<string | null>(null);
  // null = upload screen, false = game start screen, true = game running
  const [screenPhase, setScreenPhase] = useState<"upload" | "ready" | "game">("upload");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    const has = typeof window !== "undefined"
      && (!!window.SpeechRecognition || !!(window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
    setHasMic(has);
  }, []);

  const playAudio = useCallback((b64: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
    audioRef.current = audio;
    audio.play().catch((e) => console.warn("Audio blocked:", e));
  }, []);

  const applyActions = useCallback((actions: GameAction[]) => {
    setGameState((prev) => {
      let next = { ...prev };
      for (const action of actions) {
        switch (action.type) {
          case "update_hp":
            next = { ...next, hp: Math.max(0, Math.min(next.maxHp, next.hp + action.amount)) };
            if (next.hp <= 0) next.isGameOver = true;
            break;
          case "add_item":
            next = { ...next, inventory: [...next.inventory, action.item] };
            break;
          case "remove_item":
            next = { ...next, inventory: next.inventory.filter((i) => i.id !== action.itemId) };
            break;
          case "dice_roll":
            next = { ...next, diceLog: [...next.diceLog, action.roll] };
            break;
          case "change_station":
            next = { ...next, currentStation: action.station };
            break;
          case "game_over":
            next = { ...next, isGameOver: true };
            break;
        }
      }
      return next;
    });
  }, []);

  const sendAction = useCallback(async (playerText: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerText,
          turnCount: gameState.turnCount,
          gameState: { hp: gameState.hp, maxHp: gameState.maxHp, currentStation: gameState.currentStation, inventory: gameState.inventory },
          sessionId: sessionIdRef.current,
          documentContext,
        }),
      });
      const data: GameResponse = await res.json();

      applyActions(data.actions);
      setSpeakerName(data.speakerName || "Maître du Jeu");
      setSpeakerType(data.speakerType || "narrator");
      setGameState((prev) => ({ ...prev, dialogue: data.narrative, turnCount: prev.turnCount + 1, isGameStarted: true }));
      setScreenPhase("game");

      if (data.audioBase64) playAudio(data.audioBase64);
    } catch (e) {
      console.error("API error:", e);
      setGameState((prev) => ({ ...prev, dialogue: "Signal perdu dans les tunnels. Réessayez." }));
    } finally {
      setIsLoading(false);
    }
  }, [gameState.turnCount, gameState.hp, gameState.maxHp, gameState.currentStation, gameState.inventory, applyActions, playAudio]);

  const startGame = useCallback(() => {
    setScreenPhase("game");
    sendAction("");
  }, [sendAction]);

  const handleDocumentReady = useCallback((text: string, filename: string) => {
    setDocumentContext(text);
    setDocumentFilename(filename);
    setScreenPhase("ready");
  }, []);

  // ====== UPLOAD SCREEN ======
  if (screenPhase === "upload") {
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", background: "#F3F0E6", overflow: "hidden" }}>
        {/* Left — branding */}
        <div
          style={{
            width: "42%",
            background: "#1A1A1A",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 40px",
            borderRight: "4px solid #FF5B22",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
              <div style={{ width: 6, height: 40, background: "#FF5B22" }} />
              <div>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#5A5A5A", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: 4 }}>
                  Powered by Mistral AI
                </p>
                <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, color: "#F3F0E6", letterSpacing: "0.04em" }}>
                  RAG to RPG
                </h1>
              </div>
            </div>

            <div style={{ fontFamily: "'VT323', monospace", fontSize: 42, color: "#FF5B22", lineHeight: 1.1, marginBottom: 24 }}>
              SERIOUS<br />GAME<br />ENGINE
            </div>

            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5", lineHeight: 1.8, maxWidth: 300 }}>
              Uploadez n&apos;importe quel document. Notre IA le transforme en jeu de survie vocal immersif pour tester vos connaissances.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: "📄", label: "Upload de votre document" },
              { icon: "🧠", label: "Mistral analyse le contenu" },
              { icon: "🎮", label: "Jeu de rôle vocal généré" },
              { icon: "🎙️", label: "ElevenLabs voix immersive" },
            ].map((step) => (
              <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14 }}>{step.icon}</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", letterSpacing: "0.05em" }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — upload zone */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 40px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 520, marginBottom: 32 }}>
            <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#1A1A1A", letterSpacing: "0.1em", marginBottom: 6 }}>
              Chargez votre document
            </h2>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", marginBottom: 28 }}>
              Manuel, cours, procedure, contrat — tout document devient un serious game.
            </p>

            <FileUpload onDocumentReady={handleDocumentReady} />
          </div>

          {/* Skip to default RATP game */}
          <button
            onClick={() => { setDocumentContext(null); setDocumentFilename(null); setScreenPhase("ready"); }}
            style={{
              fontFamily:    "'Space Mono', monospace",
              fontSize:      9,
              color:         "#5A5A5A",
              background:    "transparent",
              border:        "none",
              cursor:        "pointer",
              textDecoration:"underline",
              letterSpacing: "0.1em",
            }}
          >
            Passer — jouer au mode RATP Survival par défaut
          </button>
        </div>
      </div>
    );
  }

  // ====== READY SCREEN (doc loaded, not yet started) ======
  if (screenPhase === "ready") {
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", background: "#F3F0E6", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 52, color: "#FF5B22", marginBottom: 12 }}>
              PRET
            </div>
            {documentFilename ? (
              <>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 8 }}>
                  Document charge :
                </p>
                <div style={{ border: "2px solid #1A1A1A", padding: "10px 20px", boxShadow: "3px 3px 0 #1A1A1A", marginBottom: 32, background: "#FAFAF7" }}>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>
                    {documentFilename}
                  </p>
                </div>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 32, lineHeight: 1.7 }}>
                  Mistral va generer un jeu de survie base sur ce contenu. Vos connaissances seront testees en situation de crise.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 32, lineHeight: 1.7 }}>
                  Mode RATP Survival. Survivez dans le metro parisien un jour de greve generale.
                </p>
              </>
            )}
            <button
              onClick={startGame}
              style={{
                fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em",
                textTransform: "uppercase", padding: "16px 40px", background: "#FF5B22", color: "#F3F0E6",
                border: "3px solid #FF5B22", boxShadow: "5px 5px 0 #CC4919", cursor: "pointer", width: "100%",
              }}
            >
              Lancer la session
            </button>
            <button
              onClick={() => setScreenPhase("upload")}
              style={{
                fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#5A5A5A",
                background: "transparent", border: "none", cursor: "pointer",
                textDecoration: "underline", marginTop: 16, letterSpacing: "0.1em",
              }}
            >
              Retour — changer de document
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ====== GAME SCREEN ======
  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", overflow: "hidden", background: "#F3F0E6" }}>

      {/* ====== ZONE IMMERSIVE (65%) ====== */}
      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", background: "#1A1A1A" }}>

        {/* Metro background — dark grain + scanlines */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {/* Base gradient */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0F0F0F 0%, #1A1A1A 40%, #0A0D0A 100%)" }} />
          {/* Warm center glow */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 40% 60%, rgba(255,91,34,0.04) 0%, transparent 65%)" }} />
          {/* Pillar pattern */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.035, backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 120px, rgba(255,240,230,0.8) 120px, rgba(255,240,230,0.8) 122px)" }} />
          {/* Scanline */}
          <div className="animate-scanline" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: "rgba(255,91,34,0.06)" }} />
          {/* Vignette */}
          <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 120px 50px rgba(0,0,0,0.7)" }} />
        </div>

        {/* ── TOP BAR ── */}
        <div style={{ position: "relative", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "2px solid rgba(255,91,34,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 6, height: 32, background: "#FF5B22" }} />
            <div>
              <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 15, fontWeight: 700, color: "#F3F0E6", letterSpacing: "0.06em" }}>
                RATP SURVIVAL
              </h1>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#5A5A5A", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                L&apos;Odyssee Souterraine · Mistral AI
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {documentFilename && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #FF5B22", padding: "3px 10px" }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#FF5B22", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  DOC : {documentFilename.slice(0, 20)}{documentFilename.length > 20 ? "…" : ""}
                </span>
              </div>
            )}
            {gameState.isGameStarted && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, background: "#FF5B22" }} className="animate-blink" />
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#FF5B22", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                  {documentFilename ? "Session Active" : "Greve Generale"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER ── */}
        <div style={{ flex: 1, position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>

          {/* START SCREEN */}
          {!gameState.isGameStarted && !isLoading && (
            <div className="animate-fade-in" style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 64, color: "#FF5B22", lineHeight: 1, marginBottom: 8 }}>
                METRO
              </div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 32 }}>
                Greve Generale — Jour J
              </div>

              <div
                style={{
                  border:    "2px solid rgba(255,91,34,0.3)",
                  padding:   "20px 24px",
                  marginBottom: 32,
                  maxWidth:  360,
                  background: "rgba(255,91,34,0.04)",
                }}
              >
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5", lineHeight: 1.7 }}>
                  Chatelet-Les Halles, 08h43.<br />
                  Greve totale. Portiques en feu.<br />
                  Votre Pass Navigo est perime.<br />
                  <span style={{ color: "#FF5B22" }}>Bonne chance.</span>
                </p>
              </div>

              <button
                onClick={startGame}
                style={{
                  fontFamily:    "'Space Mono', monospace",
                  fontSize:      12,
                  fontWeight:    700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  padding:       "14px 32px",
                  background:    "#FF5B22",
                  color:         "#F3F0E6",
                  border:        "2px solid #FF5B22",
                  boxShadow:     "4px 4px 0 #CC4919",
                  cursor:        "pointer",
                  transition:    "all 0.1s",
                }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.boxShadow = "2px 2px 0 #CC4919"; (e.target as HTMLButtonElement).style.transform = "translate(2px,2px)"; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.boxShadow = "4px 4px 0 #CC4919"; (e.target as HTMLButtonElement).style.transform = "translate(0,0)"; }}
              >
                Entrer dans le Metro
              </button>
            </div>
          )}

          {/* LOADING */}
          {isLoading && !gameState.isGameStarted && (
            <div className="animate-fade-in" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, height: 40, marginBottom: 12 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="animate-soundwave"
                    style={{ width: 5, height: "100%", background: "#FF5B22", animationDelay: `${i * 80}ms` }}
                  />
                ))}
              </div>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A", letterSpacing: "0.15em" }}>
                CONNEXION AU RESEAU RATP...
              </p>
            </div>
          )}

          {/* GAME OVER */}
          {gameState.isGameOver && (
            <div
              className="animate-fade-in"
              style={{
                position:  "absolute", inset: 0,
                background: "rgba(0,0,0,0.88)",
                display:   "flex", alignItems: "center", justifyContent: "center",
                zIndex:    30,
              }}
            >
              <div style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 80, color: "#CC2A2A", marginBottom: 8 }} className="animate-game-over">
                  GAME OVER
                </div>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#5A5A5A", marginBottom: 28 }}>
                  Le metro parisien a eu raison de vous.
                </p>
                <button
                  onClick={() => {
                    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                    sessionIdRef.current = crypto.randomUUID();
                    setGameState(INITIAL_GAME_STATE);
                    setSpeakerName("Maître du Jeu");
                    setSpeakerType("narrator");
                    setScreenPhase("upload");
                    setDocumentContext(null);
                    setDocumentFilename(null);
                  }}
                  style={{
                    fontFamily:    "'Space Mono', monospace",
                    fontSize:      11,
                    fontWeight:    700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    padding:       "12px 24px",
                    background:    "transparent",
                    color:         "#CC2A2A",
                    border:        "2px solid #CC2A2A",
                    boxShadow:     "3px 3px 0 #CC2A2A",
                    cursor:        "pointer",
                  }}
                >
                  Recommencer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── DIALOGUE BOX ── */}
        {gameState.isGameStarted && (
          <div style={{ position: "relative", zIndex: 20 }}>
            <DialogueBox
              text={gameState.dialogue}
              isLoading={isLoading}
              speakerName={speakerName}
              speakerType={speakerType}
            />
          </div>
        )}

        {/* ── ACTION ZONE ── */}
        {gameState.isGameStarted && (
          <div
            style={{
              position:      "relative",
              zIndex:        20,
              display:       "flex",
              justifyContent:"center",
              padding:       "20px 24px",
              background:    "#1A1A1A",
              borderTop:     "2px solid rgba(255,91,34,0.15)",
            }}
          >
            {hasMic ? (
              <PushToTalk onSpeechResult={(t) => sendAction(t)} disabled={isLoading || gameState.isGameOver} />
            ) : (
              <TextInput onSubmit={(t) => sendAction(t)} disabled={isLoading || gameState.isGameOver} />
            )}
          </div>
        )}
      </div>

      {/* ====== SIDE PANEL (35%) ====== */}
      <div style={{ width: "35%", minWidth: 300, maxWidth: 400 }}>
        <SidePanel gameState={gameState} />
      </div>
    </div>
  );
}
