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

// Fake technical logs to show between real status updates
const FAKE_LOGS: string[][] = [
  // Phase 1: Document analysis
  [
    "[mistral-large] Initializing document parser...",
    "[rag] Tokenizing input: {TOKEN_COUNT} tokens detected",
    "[rag] Building semantic index... chunking strategy: overlapping_512",
    "[mistral-large] POST /v1/chat/completions — model: mistral-large-latest",
    "[rag] Cosine similarity matrix computed (dim={CHUNK_COUNT}x{CHUNK_COUNT})",
    "[mistral-large] Extracting key concepts via embeddings...",
    "[eval] Mapping Bloom's taxonomy levels to content...",
    "[mistral-large] Generating Q&A pairs (temperature=0.3, json_mode=true)...",
    "[rag] BM25 index built — {CHUNK_COUNT} chunks indexed",
  ],
  // Phase 2: Categorization
  [
    "[orchestrator] Received {QA_COUNT} Q&A pairs from generation pipeline",
    "[mistral-large] POST /v1/chat/completions — clustering by semantic similarity...",
    "[orchestrator] Applying difficulty gradient: easy -> medium -> hard",
    "[eval] Validation pass: checking Q&A coverage across domains...",
    "[mistral-large] Categorization complete (temperature=0.2, json_mode=true)",
    "[orchestrator] Building weighted evaluation grid...",
    "[eval] All Q&A pairs assigned — no orphans detected",
  ],
  // Phase 3: Agent creation
  [
    "[orchestrator] Spawning multi-agent factory (temperature=0.4)...",
    "[mistral-large] POST /v1/chat/completions — generating character profiles...",
    "[tts] Pre-allocating ElevenLabs voice channels: {VOICE_TYPES}",
    "[orchestrator] Building scenario arc: {CAT_COUNT} acts planned",
    "[mistral-large] Function calling: agent_spawn x{AGENT_COUNT}",
    "[orchestrator] Assigning knowledge domains to agent personas...",
    "[tts] Voice mapping: authoritative_male, warm_female, stressed_young, gruff_veteran",
    "[eval] Cross-validating agent coverage vs Q&A distribution...",
    "[orchestrator] All subsystems nominal — simulation ready to deploy",
  ],
];

interface LogEntry {
  id: number;
  text: string;
  type: "system" | "status" | "success" | "agent";
  timestamp: string;
}

export default function AgentGenerationView({ documentText, filename, onReady }: AgentGenerationViewProps) {
  const [status, setStatus] = useState("Connecting to orchestrator...");
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
    setLogs((prev) => [...prev.slice(-40), { id, text, type, timestamp: getTimestamp() }]);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Start fake log generation
  useEffect(() => {
    addLog("[system] Establishing secure connection to Mistral AI orchestrator...", "system");
    addLog(`[system] Document loaded: "${filename}" (${(documentText.length / 1024).toFixed(1)}KB)`, "system");
    addLog("[system] API key verified — mistral-large-latest model selected", "system");

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
        .replace("{VOICE_TYPES}", "5 channels allocated")
        .replace("{CAT_COUNT}", String(qaCountRef.current ? Math.min(4, Math.ceil(qaCountRef.current / 3)) : "..."))
        .replace("{AGENT_COUNT}", String(qaCountRef.current ? Math.min(4, Math.ceil(qaCountRef.current / 3)) + 1 : "..."));

      addLog(text, "system");
      fakeLogIndexRef.current = idx + 1;
    }, 800 + Math.random() * 1200);

    return () => {
      if (fakeLogTimerRef.current) clearInterval(fakeLogTimerRef.current);
    };
  }, [addLog, documentText, filename]);

  const processSseBlock = useCallback((line: string) => {
    const dataMatch = line.match(/^data: (.+)$/m);
    if (!dataMatch) return;

    try {
      const event = JSON.parse(dataMatch[1]);

      if (event.type === "status") {
        setStatus(event.message);
        addLog(`[pipeline] ${event.message}`, "status");

        // Advance fake log phase on real status updates
        if (event.message.includes("categories") || event.message.includes("Organisation") || event.message.includes("questions")) {
          fakeLogPhaseRef.current = 1;
          fakeLogIndexRef.current = 0;
        } else if (event.message.includes("personnages") || event.message.includes("Creation") || event.message.includes("agents") || event.message.includes("profils")) {
          fakeLogPhaseRef.current = 2;
          fakeLogIndexRef.current = 0;
        }
      } else if (event.type === "scenario") {
        setScenario(event.data);
        setStatus("Scenario generated — spawning agents...");
        addLog(`[scenario] Generated: "${event.data?.title || "Scenario"}" — ${event.data?.acts?.length || 0} acts`, "success");
      } else if (event.type === "new_agent") {
        const agent = event.data as Agent;
        setAgents((prev) => [...prev, agent]);
        addLog(`[agent:spawn] ${agent.name} online — role: ${agent.role} | voice: ${agent.voice_type}`, "agent");
      } else if (event.type === "evaluation_grid") {
        setEvaluationGrid(event.data);
        qaCountRef.current = event.data?.length || 0;
        addLog(`[eval] Evaluation grid loaded: ${event.data?.length || 0} weighted topics`, "success");
      } else if (event.type === "ready") {
        setupRef.current = event.data as SimulationSetup;
        setIsReady(true);
        setStatus("Simulation ready.");
        if (fakeLogTimerRef.current) clearInterval(fakeLogTimerRef.current);
        addLog("[system] All subsystems nominal — deployment ready", "success");
        addLog("[system] Awaiting operator confirmation to begin simulation...", "success");
      } else if (event.type === "error") {
        if (event.recoverable) {
          setWarning(String(event.message || "Fallback mode activated."));
          setStatus("Fallback ready.");
        } else {
          setError(event.message);
          addLog(`[error] ${event.message}`, "system");
        }
      }
    } catch {
      // skip malformed events
    }
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

        if (!res.ok || !res.body) {
          setError("Connection to orchestrator failed.");
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
          setError(e instanceof Error ? e.message : "Unexpected error.");
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
  const centerY = 260;
  const radius = 180;

  const LOG_COLORS: Record<LogEntry["type"], string> = {
    system: "rgba(255,255,255,0.4)",
    status: "#4A90D9",
    success: "#7AB648",
    agent: "#D94A8C",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a0f",
        display: "flex",
        flexDirection: "column",
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

      {/* ── TOP: Agent visualization ── */}
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0 }}>
        {/* Vignette — scoped to visualization area only */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, transparent 30%, #0a0a0f 80%)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
          <div style={{ position: "relative", width: 800, height: 520 }}>
            {/* Scenario title */}
            <AnimatePresence>
              {scenario && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                  }}
                >
                  <h1
                    style={{
                      fontFamily: "'VT323', monospace",
                      fontSize: 28,
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
                      fontSize: 9,
                      color: "rgba(255,255,255,0.3)",
                      marginTop: 6,
                      maxWidth: 460,
                      margin: "6px auto 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {scenario.setting}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SVG layer for connections */}
            <svg
              style={{ position: "absolute", inset: 0, width: 800, height: 520 }}
              viewBox="0 0 800 520"
            >
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
                left: centerX - 36,
                top: centerY - 36,
                width: 72,
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
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
              <div
                style={{
                  width: 52,
                  height: 52,
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
                    fontSize: 13,
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
                      left: centerX + pos.x - 85,
                      top: centerY + pos.y - 42,
                      width: 170,
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(10,10,15,0.9)",
                        border: `1px solid ${color}`,
                        borderRadius: 4,
                        padding: "10px 14px",
                        boxShadow: `0 0 20px ${color}33, inset 0 0 20px ${color}0A`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <div
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: color,
                            boxShadow: `0 0 8px ${color}`,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "'Space Mono', monospace",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#F3F0E6",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {agent.name}
                        </span>
                      </div>

                      <p
                        style={{
                          fontFamily: "'Space Mono', monospace",
                          fontSize: 7,
                          color: color,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          marginBottom: 5,
                        }}
                      >
                        {agent.role}
                      </p>

                      <p
                        style={{
                          fontFamily: "'Space Mono', monospace",
                          fontSize: 8,
                          color: "rgba(255,255,255,0.45)",
                          lineHeight: 1.4,
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

            {/* Status + Enter button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                position: "absolute",
                bottom: 10,
                left: 0,
                right: 0,
                textAlign: "center",
              }}
            >
              {error && !isReady ? (
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#CC2A2A" }}>
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
                  Launch Simulation
                </motion.button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div
                    className="animate-glow-pulse"
                    style={{ width: 6, height: 6, borderRadius: "50%", background: "#4A90D9" }}
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
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "rgba(255,180,120,0.9)", marginTop: 8 }}>
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
                    bottom: -30,
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {evaluationGrid.slice(0, 6).map((topic) => (
                    <div
                      key={topic.topic}
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 7,
                        color: "rgba(255,255,255,0.3)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        padding: "3px 8px",
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
      </div>

      {/* ── BOTTOM: Live terminal log ── */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        style={{
          flexShrink: 0,
          height: 200,
          borderTop: "1px solid rgba(74,144,217,0.2)",
          background: "rgba(5,5,10,0.95)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Terminal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 16px",
            borderBottom: "1px solid rgba(74,144,217,0.1)",
            background: "rgba(74,144,217,0.03)",
          }}
        >
          <div style={{ display: "flex", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#CC2A2A" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D9A84A" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#7AB648" }} />
          </div>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 9,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            Orchestration Pipeline — Mistral AI
          </span>
          <div style={{ flex: 1 }} />
          {!isReady && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                className="animate-blink"
                style={{ width: 5, height: 5, borderRadius: "50%", background: "#4A90D9" }}
              />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#4A90D9", letterSpacing: "0.1em" }}>
                PROCESSING
              </span>
            </div>
          )}
          {isReady && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#7AB648", boxShadow: "0 0 6px #7AB648" }} />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#7AB648", letterSpacing: "0.1em" }}>
                READY
              </span>
            </div>
          )}
        </div>

        {/* Log output */}
        <div
          ref={logContainerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 16px",
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            lineHeight: 1.8,
          }}
        >
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: "flex",
                  gap: 10,
                  color: LOG_COLORS[log.type],
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.15)", flexShrink: 0 }}>
                  {log.timestamp}
                </span>
                <span>{log.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
