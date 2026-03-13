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
  authoritative_male: "#3B82F6",
  warm_female: "#EC4899",
  stressed_young: "#F59E0B",
  calm_narrator: "#10B981",
  gruff_veteran: "#8B5CF6",
};

function getAgentPosition(index: number, total: number, rx: number, ry: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.cos(angle) * rx,
    y: Math.sin(angle) * ry,
  };
}

export default function AgentGenerationView({ documentText, filename, onReady }: AgentGenerationViewProps) {
  const [status, setStatus] = useState("Connexion à l'orchestrateur...");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [evaluationGrid, setEvaluationGrid] = useState<EvaluationTopic[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const setupRef = useRef<SimulationSetup | null>(null);

  const processSseBlock = useCallback((line: string) => {
    const dataMatch = line.match(/^data: (.+)$/m);
    if (!dataMatch) return;
    try {
      const event = JSON.parse(dataMatch[1]);
      if (event.type === "status") {
        setStatus(event.message);
      } else if (event.type === "scenario") {
        setScenario(event.data);
        setStatus("Scénario généré — spawn des agents...");
      } else if (event.type === "new_agent") {
        setAgents((prev) => [...prev, event.data]);
      } else if (event.type === "evaluation_grid") {
        setEvaluationGrid(event.data);
      } else if (event.type === "ready") {
        setupRef.current = event.data as SimulationSetup;
        setIsReady(true);
        setStatus("Simulation prête.");
      } else if (event.type === "error") {
        if (event.recoverable) {
          setWarning(String(event.message || "Mode fallback activé."));
          setStatus("Fallback prêt.");
        } else {
          setError(event.message);
        }
      }
    } catch { }
  }, []);

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

  // Graph layout constants
  const W = 900;
  const H = 500;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 280;
  const ry = 175;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#111318", display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 50 }}>

      {/* Subtle dot grid background */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }} />

      {/* Ambient glow center */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: 600, height: 400,
        background: "radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── TOP BAR ── */}
      <div style={{
        position: "relative", zIndex: 10, flexShrink: 0,
        height: 56, padding: "0 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(31,35,48,0.8)",
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 3, height: 20, background: "#2563EB", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
            Phase d&apos;orchestration
          </span>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Statut</p>
            <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: isReady ? "#059669" : "#D97706", margin: 0, fontWeight: 500 }}>
              {isReady ? "PRÊT" : "INITIALISATION"}
            </p>
          </div>
        </div>
      </div>

      {/* ── GRAPH AREA ── */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>

        {/* Scenario title — top center */}
        <AnimatePresence>
          {scenario && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                position: "absolute", top: 20, left: "50%",
                transform: "translateX(-50%)",
                textAlign: "center", zIndex: 20,
              }}
            >
              <h1 style={{
                fontFamily: "var(--corp-font-heading)", fontSize: 26,
                color: "#FFFFFF", fontWeight: 400,
                letterSpacing: "0.01em", marginBottom: 4,
                maxWidth: "min(660px, calc(100vw - 120px))",
                textAlign: "center", lineHeight: 1.2,
              }}>
                {scenario.title}
              </h1>
              <p style={{
                fontFamily: "var(--corp-font-body)", fontSize: 12,
                color: "rgba(255,255,255,0.35)", maxWidth: 480,
              }}>
                {scenario.setting}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SVG Graph */}
        <div style={{ position: "relative", width: W, height: H, maxWidth: "100%", maxHeight: "100%" }}>
          {/* SVG layer — always behind cards */}
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
          >
            {/* Orbit ellipse guide */}
            <ellipse
              cx={cx} cy={cy} rx={rx} ry={ry}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
              strokeDasharray="4 8"
            />

            {/* Connection lines + node dots in SVG */}
            <AnimatePresence>
              {agents.map((agent, idx) => {
                const pos = getAgentPosition(idx, Math.max(agents.length, 1), rx, ry);
                const color = VOICE_COLORS[agent.voice_type] || "#3B82F6";
                const nx = cx + pos.x;
                const ny = cy + pos.y;
                return (
                  <g key={`node-${agent.id}`}>
                    <motion.line
                      x1={cx} y1={cy}
                      x2={nx} y2={ny}
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.25}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                    <motion.circle
                      cx={nx} cy={ny} r={7}
                      fill={color}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.05 * idx, duration: 0.3 }}
                    />
                    <motion.circle
                      cx={nx} cy={ny} r={11}
                      fill="none"
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.3}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.05 * idx + 0.1, duration: 0.3 }}
                    />
                  </g>
                );
              })}
            </AnimatePresence>

            {/* Central orchestrator node */}
            <g>
              {/* Outer pulse ring 1 */}
              <circle cx={cx} cy={cy} r={38} fill="none" stroke="rgba(59,130,246,0.12)" strokeWidth={1}>
                <animate attributeName="r" values="38;52;38" dur="3s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.12;0;0.12" dur="3s" repeatCount="indefinite" />
              </circle>
              {/* Outer pulse ring 2 */}
              <circle cx={cx} cy={cy} r={28} fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={1}>
                <animate attributeName="r" values="28;42;28" dur="3s" begin="1s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.18;0;0.18" dur="3s" begin="1s" repeatCount="indefinite" />
              </circle>
              {/* Core circle */}
              <circle cx={cx} cy={cy} r={24} fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.5)" strokeWidth={1.5} />
              {/* Inner fill */}
              <circle cx={cx} cy={cy} r={18} fill="rgba(59,130,246,0.25)" />
              {/* Label */}
              <text x={cx} y={cy + 5} textAnchor="middle"
                style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, fill: "rgba(255,255,255,0.7)", letterSpacing: "0.15em", fontWeight: 600 }}>
                ORCH
              </text>
            </g>
          </svg>
          </div>

          {/* Cards layer — always above SVG */}
          <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none" }}>
          <AnimatePresence>
            {agents.map((agent, idx) => {
              const pos = getAgentPosition(idx, Math.max(agents.length, 1), rx, ry);
              const color = VOICE_COLORS[agent.voice_type] || "#2563EB";

              const cardW = 188;
              const nodeX = cx + pos.x;
              const nodeY = cy + pos.y;

              const angle = Math.atan2(pos.y, pos.x);
              const cardOffsetDist = 72;
              let cardCx = nodeX + Math.cos(angle) * cardOffsetDist;
              let cardCy = nodeY + Math.sin(angle) * cardOffsetDist;

              let cardLeft = cardCx - cardW / 2;
              let cardTop = cardCy - 44;

              cardLeft = Math.max(4, Math.min(W - cardW - 4, cardLeft));
              cardTop = Math.max(4, Math.min(H - 92, cardTop));

              return (
                <motion.div
                  key={`card-${agent.id}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + 0.08 * idx, duration: 0.35 }}
                  style={{
                    position: "absolute",
                    left: cardLeft, top: cardTop,
                    width: cardW,
                    background: "rgba(31,35,48,0.92)",
                    border: `1px solid rgba(255,255,255,0.10)`,
                    borderLeft: `2px solid ${color}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    pointerEvents: "auto",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, fontWeight: 600, color: "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {agent.name}
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, color: color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    {agent.role}
                  </p>
                  <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, fontStyle: "italic", margin: 0,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    &ldquo;{agent.intro_line}&rdquo;
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
          </div>
        </div>

        {/* Eval topic pills — bottom */}
        <AnimatePresence>
          {evaluationGrid.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                position: "absolute", bottom: 16, left: "50%",
                transform: "translateX(-50%)",
                display: "flex", gap: 6, flexWrap: "wrap",
                justifyContent: "center", maxWidth: 700, zIndex: 20,
              }}
            >
              {evaluationGrid.slice(0, 7).map((topic) => (
                <div key={topic.topic} style={{
                  fontFamily: "var(--corp-font-body)", fontSize: 10,
                  color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  padding: "3px 10px", borderRadius: 100,
                }}>
                  {topic.topic}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{
        position: "relative", zIndex: 10, flexShrink: 0,
        padding: "14px 28px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(31,35,48,0.8)",
        backdropFilter: "blur(8px)",
      }}>
        {/* Status / warning / error */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {warning && (
            <div style={{ background: "rgba(217,119,6,0.08)", padding: "6px 14px", border: "1px solid rgba(217,119,6,0.3)", borderRadius: 8 }}>
              <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "#D97706", margin: 0 }}>{warning}</p>
            </div>
          )}
          {error && (
            <div style={{ background: "rgba(220,38,38,0.08)", padding: "6px 14px", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8 }}>
              <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "#DC2626", margin: 0 }}>{error}</p>
            </div>
          )}
          {!isReady && !error && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 14, height: 14, border: "2px solid #2563EB", borderTopColor: "transparent", borderRadius: "50%", animation: "corp-spinner 0.75s linear infinite" }} />
              <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{status}</span>
            </div>
          )}
          {isReady && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#059669" }} />
              <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "#059669", fontWeight: 500 }}>
                {agents.length} agent{agents.length > 1 ? "s" : ""} prêt{agents.length > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Launch button */}
        {isReady && (
          <motion.button
            initial={{ opacity: 0, scale: 0.95, x: 16 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleEnter}
            style={{
              fontFamily: "var(--corp-font-body)", fontSize: 14, fontWeight: 600,
              padding: "12px 32px", background: "#2563EB", color: "#FFFFFF",
              border: "none", borderRadius: 10, cursor: "pointer",
              boxShadow: "0 4px 20px rgba(59,130,246,0.35)",
              letterSpacing: "0.02em",
            }}
          >
            Lancer la session →
          </motion.button>
        )}
      </div>
    </div>
  );
}
