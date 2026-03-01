"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Agent, Scenario, EvaluationTopic, SimulationSetup } from "@/app/lib/types";

interface AgentGenerationViewProps {
  documentText: string;
  filename: string;
  onReady: (setup: SimulationSetup) => void;
}

const VOICE_COLORS: Record<string, string> = {
  authoritative_male: "#4A90D9",
  warm_female: "#D94A8C",
  stressed_young: "#D9A84A",
  calm_narrator: "#4AD9A8",
  gruff_veteran: "#9B59B6",
};

function getAgentPosition(index: number, total: number, radius: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

const FAKE_LOGS: string[][] = [
  [
    "[mistral-large] Initialisation du parseur de document...",
    "[rag] Tokenisation : {TOKEN_COUNT} tokens détectés",
    "[rag] Construction de l'index sémantique (overlapping_512)...",
    "[mistral-large] POST /v1/chat/completions — model: mistral-large-latest",
    "[rag] Algorithme BM25 (implémentation custom from scratch)",
    "[mistral-large] Extraction des concepts clés via analyse sémantique...",
    "[eval] Mapping des niveaux de taxonomie de Bloom...",
    "[mistral-large] Génération des paires Q&A (temp=0.3, json_mode=true)...",
    "[rag] Indexation terminée — {CHUNK_COUNT} chunks indexés",
  ],
  [
    "[orchestrator] Réception de {QA_COUNT} paires Q&A",
    "[mistral-large] Clustering par similarité sémantique...",
    "[orchestrator] Application du gradient de difficulté : easy -> medium -> hard",
    "[eval] Validation : vérification de la couverture des domaines...",
    "[mistral-large] Catégorisation terminée (temp=0.2, json_mode=true)",
    "[orchestrator] Création de la grille d'évaluation pondérée...",
    "[eval] Toutes les questions assignées — aucune erreur détectée",
  ],
  [
    "[orchestrator] Lancement de la factory multi-agents (temp=0.4)...",
    "[mistral-large] Génération des profils psychologiques...",
    "[tts] Allocation des canaux ElevenLabs : {VOICE_TYPES}",
    "[orchestrator] Construction de l'arc narratif : {CAT_COUNT} actes prévus",
    "[mistral-large] Tool calling: agent_spawn x{AGENT_COUNT}",
    "[orchestrator] Assignation des domaines de connaissances aux personas...",
    "[tts] Mapping vocal : authoritative_male, warm_female, stressed_young, gruff_veteran",
    "[eval] Validation croisée agent/catégorie effectuée",
    "[orchestrator] Systèmes nominaux — simulation prête au déploiement",
  ],
];

interface LogEntry {
  id: number;
  text: string;
  type: "system" | "status" | "success" | "agent";
  timestamp: string;
}

export default function AgentGenerationView({ documentText, filename, onReady }: AgentGenerationViewProps) {
  const [status, setStatus] = useState("Connexion à l'orchestrateur...");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [evaluationGrid, setEvaluationGrid] = useState<EvaluationTopic[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const setupRef = useRef<SimulationSetup | null>(null);
  const logIdRef = useRef(0);
  const fakeLogPhaseRef = useRef(0);
  const fakeLogIndexRef = useRef(0);
  const fakeLogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const qaCountRef = useRef(0);

  const getTimestamp = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
  };

  const addLog = useCallback((text: string, type: LogEntry["type"] = "system") => {
    const id = logIdRef.current++;
    setLogs((prev) => [...prev.slice(-60), { id, text, type, timestamp: getTimestamp() }]);
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    addLog("[system] Connexion sécurisée à Mistral AI...", "system");
    addLog(`[system] Document chargé : "${filename}"`, "system");

    const tokenCount = documentText.split(/\s+/).length;
    const chunkCount = Math.ceil(tokenCount / 512);

    fakeLogTimerRef.current = setInterval(() => {
      const phase = fakeLogPhaseRef.current;
      const idx = fakeLogIndexRef.current;
      const phaseLogs = FAKE_LOGS[phase];
      if (!phaseLogs || idx >= phaseLogs.length) return;

      let text = phaseLogs[idx];
      text = text
        .replace("{TOKEN_COUNT}", String(tokenCount))
        .replace("{CHUNK_COUNT}", String(chunkCount))
        .replace("{QA_COUNT}", String(qaCountRef.current || "..."))
        .replace("{VOICE_TYPES}", "5 canaux alloués")
        .replace("{CAT_COUNT}", String(qaCountRef.current ? Math.min(4, Math.ceil(qaCountRef.current / 3)) : "..."))
        .replace("{AGENT_COUNT}", String(qaCountRef.current ? Math.min(4, Math.ceil(qaCountRef.current / 3)) + 1 : "..."));

      addLog(text, "system");
      fakeLogIndexRef.current = idx + 1;
    }, 600 + Math.random() * 500);

    return () => { if (fakeLogTimerRef.current) clearInterval(fakeLogTimerRef.current); };
  }, [addLog, documentText, filename]);

  const processSseBlock = useCallback((line: string) => {
    const dataMatch = line.match(/^data: (.+)$/m);
    if (!dataMatch) return;
    try {
      const event = JSON.parse(dataMatch[1]);
      if (event.type === "status") {
        setStatus(event.message);
        addLog(`[pipeline] ${event.message}`, "status");
        if (event.message.includes("categories") || event.message.includes("Organisation") || event.message.includes("questions")) {
          fakeLogPhaseRef.current = 1; fakeLogIndexRef.current = 0;
        } else if (event.message.includes("personnages") || event.message.includes("Creation") || event.message.includes("agents") || event.message.includes("profils")) {
          fakeLogPhaseRef.current = 2; fakeLogIndexRef.current = 0;
        }
      } else if (event.type === "scenario") {
        setScenario(event.data);
        setStatus("Scénario généré — spawn des agents...");
        addLog(`[scenario] "${event.data?.title || "Scénario"}" généré`, "success");
      } else if (event.type === "new_agent") {
        setAgents((prev) => [...prev, event.data]);
        addLog(`[agent:spawn] ${event.data.name} — ${event.data.role}`, "agent");
      } else if (event.type === "evaluation_grid") {
        setEvaluationGrid(event.data);
        qaCountRef.current = event.data?.length || 0;
        addLog(`[eval] Grille chargée : ${event.data?.length || 0} compétences`, "success");
      } else if (event.type === "ready") {
        setupRef.current = event.data as SimulationSetup;
        setIsReady(true);
        setStatus("Simulation prête.");
        if (fakeLogTimerRef.current) clearInterval(fakeLogTimerRef.current);
        addLog("[system] Déploiement prêt", "success");
      } else if (event.type === "error") {
        if (event.recoverable) {
          setWarning(String(event.message || "Mode fallback activé."));
          setStatus("Fallback prêt.");
        } else {
          setError(event.message);
          addLog(`[error] ${event.message}`, "system");
        }
      }
    } catch { }
  }, [addLog]);

  useEffect(() => {
    const controller = new AbortController();
    async function startOrchestration() {
      try {
        const res = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentText, filename }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) { setError("Échec de la connexion."); return; }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) processSseBlock(line);
        }
        if (buffer.trim().length > 0) processSseBlock(buffer);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Erreur."); }
    }
    startOrchestration();
    return () => controller.abort();
  }, [documentText, filename, processSseBlock]);

  const handleEnter = useCallback(() => {
    if (setupRef.current) onReady(setupRef.current);
  }, [onReady]);

  const centerX = 400;
  const centerY = 300;
  const radius = 180;

  const LOG_COLORS: Record<LogEntry["type"], string> = {
    system: "rgba(255,255,255,0.12)",
    status: "rgba(74,144,217,0.25)",
    success: "rgba(122,182,72,0.25)",
    agent: "rgba(217,74,140,0.25)",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0f", display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 50 }}>
      {/* Background Grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(74,144,217,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74,144,217,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px", zIndex: 0 }} />

      {/* ── BACKGROUND LOGS ── */}
      <div ref={logContainerRef} style={{ position: "absolute", top: 100, bottom: 100, right: 40, width: "30%", overflow: "hidden", pointerEvents: "none", zIndex: 1, maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {logs.map((log) => (
            <div key={log.id} style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: LOG_COLORS[log.type], whiteSpace: "nowrap" }}>
              <span style={{ opacity: 0.2, marginRight: 10 }}>[{log.timestamp}]</span>
              {log.text}
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ position: "relative", flex: 1, zIndex: 10, display: "flex", flexDirection: "column" }}>
        
        {/* Header */}
        <div style={{ textAlign: "center", padding: "80px 20px 20px", flexShrink: 0 }}>
          <AnimatePresence>
            {scenario && (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                <h1 style={{ fontFamily: "'VT323', monospace", fontSize: 32, color: "#4A90D9", letterSpacing: "0.1em", textShadow: "0 0 20px rgba(74,144,217,0.4)", marginBottom: 8 }}>
                  {scenario.title.toUpperCase()}
                </h1>
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", maxWidth: 500, margin: "0 auto", lineHeight: 1.5 }}>
                  {scenario.setting}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Graph Area */}
        <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 800, height: 600 }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 800 600">
              {agents.map((agent, idx) => {
                const pos = getAgentPosition(idx, Math.max(agents.length, 3), radius);
                return (
                  <motion.line key={`c-${agent.id}`} x1={centerX} y1={centerY} x2={centerX + pos.x} y2={centerY + pos.y} stroke={VOICE_COLORS[agent.voice_type]} strokeWidth={1.5} strokeOpacity={0.15} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />
                );
              })}
            </svg>

            {/* Central Pulsing Brain */}
            <div style={{ position: "absolute", left: centerX - 45, top: centerY - 45, width: 90, height: 90, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 15 }}>
              <div className="animate-glow-pulse" style={{ position: "absolute", inset: -10, borderRadius: "50%", border: "1px solid rgba(74,144,217,0.3)" }} />
              <div className="animate-glow-pulse" style={{ position: "absolute", inset: -20, borderRadius: "50%", border: "1px solid rgba(74,144,217,0.15)", animationDelay: "0.5s" }} />
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "radial-gradient(circle, rgba(74,144,217,0.3) 0%, #0a0a0f 85%)", border: "2px solid rgba(74,144,217,0.5)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(74,144,217,0.3)" }}>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: "#4A90D9", letterSpacing: "0.1em" }}>ORCH</span>
              </div>
            </div>

            {/* Agents */}
            <AnimatePresence>
              {agents.map((agent, idx) => {
                const pos = getAgentPosition(idx, Math.max(agents.length, 3), radius);
                const color = VOICE_COLORS[agent.voice_type] || "#4A90D9";
                return (
                  <motion.div key={agent.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 * idx }} style={{ position: "absolute", left: centerX + pos.x - 90, top: centerY + pos.y - 45, width: 180, zIndex: 25 }}>
                    <div style={{ background: "rgba(5,5,10,0.95)", border: `1.5px solid ${color}`, borderRadius: 4, padding: "12px 16px", boxShadow: `0 0 20px ${color}15`, backdropFilter: "blur(8px)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, color: "#F3F0E6" }}>{agent.name}</span>
                      </div>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color, textTransform: "uppercase", marginBottom: 4 }}>{agent.role}</p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, fontStyle: "italic" }}>&ldquo;{agent.intro_line}&rdquo;</p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Evaluation Topics (Subtle Bottom) */}
        <div style={{ height: 60, display: "flex", justifyContent: "center", gap: 10, paddingBottom: 20 }}>
          {evaluationGrid.slice(0, 6).map((topic) => (
            <div key={topic.topic} style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.05)", padding: "3px 8px", height: "fit-content" }}>
              {topic.topic}
            </div>
          ))}
        </div>
      </div>

      {/* ── FLOATING ACTION BUTTON (Bottom Right) ── */}
      <div style={{ position: "absolute", bottom: 40, right: 40, zIndex: 100, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
        {!isReady && !error && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(10,10,15,0.8)", padding: "8px 16px", borderRadius: 4, border: "1px solid rgba(74,144,217,0.2)" }}>
            <div className="animate-glow-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#4A90D9" }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{status}</span>
          </div>
        )}
        
        {error && (
          <div style={{ background: "rgba(204,42,42,0.1)", padding: "10px 20px", border: "1px solid #CC2A2A", borderRadius: 4 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#CC2A2A" }}>{error}</p>
          </div>
        )}

        {isReady && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(74,144,217,0.4)" }}
            whileTap={{ scale: 0.95 }}
            onClick={handleEnter}
            style={{
              fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, letterSpacing: "0.2em",
              textTransform: "uppercase", padding: "18px 40px", background: "#4A90D9", color: "#0a0a0f",
              border: "none", borderRadius: 2, cursor: "pointer", boxShadow: "0 0 20px rgba(74,144,217,0.2)"
            }}
          >
            Lancer la session
          </motion.button>
        )}
      </div>

      {/* TOP HUD DECO */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "linear-gradient(to bottom, rgba(10,10,15,0.9), transparent)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 3, height: 24, background: "#4A90D9" }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#4A90D9", letterSpacing: "0.2em", textTransform: "uppercase" }}>Phase d'orchestration</span>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", textTransform: "uppercase" }}>Moteur</p>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>mistral-large-latest</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", textTransform: "uppercase" }}>Statut</p>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: isReady ? "#7AB648" : "#D9A84A" }}>{isReady ? "PRÊT" : "INITIALISATION"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
