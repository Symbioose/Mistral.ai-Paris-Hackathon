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
        setStatus("Scénario généré. Création des agents...");
      } else if (event.type === "new_agent") {
        const agent = event.data as Agent;
        setAgents((prev) => [...prev, agent]);
      } else if (event.type === "evaluation_grid") {
        setEvaluationGrid(event.data);
      } else if (event.type === "ready") {
        setupRef.current = event.data as SimulationSetup;
        setIsReady(true);
        setStatus("Simulation prête.");
      } else if (event.type === "error") {
        if (event.recoverable) {
          setWarning(String(event.message || "Mode secours activé."));
          setStatus("Mode secours prêt.");
        } else {
          setError(event.message);
        }
      }
    } catch {
      // skip malformed events
    }
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

        if (!res.ok || !res.body) {
          setError("Erreur de connexion à l'orchestrateur.");
          return;
        }

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

        if (buffer.trim().length > 0) {
          processSseBlock(buffer);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Erreur inattendue.");
        }
      }
    }

    startOrchestration();

    return () => {
      controller.abort();
    };
  }, [documentText, filename, processSseBlock]);

  const handleEnter = useCallback(() => {
    if (setupRef.current) {
      onReady(setupRef.current);
    }
  }, [onReady]);

  const centerX = 400;
  const centerY = 300;
  const radius = 200;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0f",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(74,144,217,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(74,144,217,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 30%, #0a0a0f 80%)",
        }}
      />

      {/* Main content */}
      <div style={{ position: "relative", width: 800, height: 600 }}>
        {/* Scenario title */}
        <AnimatePresence>
          {scenario && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              style={{
                position: "absolute",
                top: -60,
                left: 0,
                right: 0,
                textAlign: "center",
              }}
            >
              <h1
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: 32,
                  color: "#4A90D9",
                  letterSpacing: "0.08em",
                  textShadow: "0 0 20px rgba(74,144,217,0.4)",
                }}
              >
                {scenario.title}
              </h1>
              <p
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.35)",
                  marginTop: 8,
                  maxWidth: 500,
                  margin: "8px auto 0",
                  lineHeight: 1.6,
                }}
              >
                {scenario.setting}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SVG layer for connections */}
        <svg
          style={{ position: "absolute", inset: 0, width: 800, height: 600 }}
          viewBox="0 0 800 600"
        >
          {/* Connection lines from center to agents */}
          {agents.map((agent, idx) => {
            const pos = getAgentPosition(idx, Math.max(agents.length, 3), radius);
            const color = VOICE_COLORS[agent.voice_type] || "#4A90D9";
            return (
              <motion.line
                key={`center-${agent.id}`}
                x1={centerX}
                y1={centerY}
                x2={centerX + pos.x}
                y2={centerY + pos.y}
                stroke={color}
                strokeWidth={1}
                strokeOpacity={0.25}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              />
            );
          })}

          {/* Inter-agent connections */}
          {agents.map((agent, i) =>
            agents.slice(i + 1).map((other, j) => {
              const posA = getAgentPosition(i, Math.max(agents.length, 3), radius);
              const posB = getAgentPosition(i + j + 1, Math.max(agents.length, 3), radius);
              return (
                <motion.line
                  key={`${agent.id}-${other.id}`}
                  x1={centerX + posA.x}
                  y1={centerY + posA.y}
                  x2={centerX + posB.x}
                  y2={centerY + posB.y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={0.5}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 1, delay: 0.8 }}
                />
              );
            }),
          )}
        </svg>

        {/* Central brain node */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          style={{
            position: "absolute",
            left: centerX - 40,
            top: centerY - 40,
            width: 80,
            height: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Glow ring */}
          <div
            className="animate-glow-pulse"
            style={{
              position: "absolute",
              inset: -10,
              borderRadius: "50%",
              border: "1px solid rgba(74,144,217,0.3)",
            }}
          />
          <div
            className="animate-glow-pulse"
            style={{
              position: "absolute",
              inset: -20,
              borderRadius: "50%",
              border: "1px solid rgba(74,144,217,0.15)",
              animationDelay: "0.5s",
            }}
          />
          {/* Core */}
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(74,144,217,0.3) 0%, rgba(74,144,217,0.05) 70%)",
              border: "2px solid rgba(74,144,217,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: 14,
                color: "#4A90D9",
                letterSpacing: "0.1em",
              }}
            >
              AI
            </span>
          </div>
        </motion.div>

        {/* Agent nodes */}
        <AnimatePresence>
          {agents.map((agent, idx) => {
            const pos = getAgentPosition(idx, Math.max(agents.length, 3), radius);
            const color = VOICE_COLORS[agent.voice_type] || "#4A90D9";
            return (
              <motion.div
                key={agent.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: "spring", delay: 0.1 }}
                style={{
                  position: "absolute",
                  left: centerX + pos.x - 90,
                  top: centerY + pos.y - 50,
                  width: 180,
                }}
              >
                <div
                  style={{
                    background: "rgba(10,10,15,0.9)",
                    border: `1px solid ${color}`,
                    borderRadius: 4,
                    padding: "14px 16px",
                    boxShadow: `0 0 20px ${color}33, inset 0 0 20px ${color}0A`,
                  }}
                >
                  {/* Agent name */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: color,
                        boxShadow: `0 0 8px ${color}`,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#F3F0E6",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {agent.name}
                    </span>
                  </div>

                  {/* Role */}
                  <p
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 8,
                      color: color,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    {agent.role}
                  </p>

                  {/* Intro line */}
                  <p
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 9,
                      color: "rgba(255,255,255,0.5)",
                      lineHeight: 1.5,
                      fontStyle: "italic",
                    }}
                  >
                    &ldquo;{agent.intro_line}&rdquo;
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Status text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: "absolute",
            bottom: -80,
            left: 0,
            right: 0,
            textAlign: "center",
          }}
        >
          {error && !isReady ? (
            <p
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                color: "#CC2A2A",
              }}
            >
              {error}
            </p>
          ) : isReady ? (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              onClick={handleEnter}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "14px 40px",
                background: "transparent",
                color: "#4A90D9",
                border: "2px solid #4A90D9",
                cursor: "pointer",
                boxShadow: "0 0 30px rgba(74,144,217,0.2), inset 0 0 30px rgba(74,144,217,0.05)",
              }}
            >
              Entrer dans la simulation
            </motion.button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div
                className="animate-glow-pulse"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4A90D9",
                }}
              />
              <p
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.1em",
                }}
              >
                {status}
              </p>
            </div>
          )}
          {warning && (
            <p
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9,
                color: "rgba(255,180,120,0.9)",
                marginTop: 8,
              }}
            >
              {warning}
            </p>
          )}
        </motion.div>

        {/* Evaluation grid preview */}
        <AnimatePresence>
          {evaluationGrid.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{
                position: "absolute",
                bottom: -140,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {evaluationGrid.slice(0, 6).map((topic) => (
                <div
                  key={topic.topic}
                  style={{
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 8,
                    color: "rgba(255,255,255,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    padding: "4px 10px",
                    letterSpacing: "0.08em",
                  }}
                >
                  {topic.topic}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
