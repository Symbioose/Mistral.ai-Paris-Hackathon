"use client";

import { AgentState, Scenario } from "@/app/lib/types";

const VOICE_COLORS: Record<string, string> = {
  authoritative_male: "#4A90D9",
  warm_female: "#D94A8C",
  stressed_young: "#D9A84A",
  calm_narrator: "#4AD9A8",
  gruff_veteran: "#9B59B6",
};

const EMOTION_LABELS: Record<string, string> = {
  calm: "Calme",
  stressed: "Stressé",
  angry: "En colère",
  panicked: "Paniqué",
  suspicious: "Méfiant",
};

const EVENT_CONFIG: Record<string, { icon: string; color: string }> = {
  crisis: { icon: "⚠", color: "#CC2A2A" },
  new_character: { icon: "◉", color: "#4A90D9" },
  plot_twist: { icon: "⟳", color: "#D94A8C" },
  chaos: { icon: "⚡", color: "#D9A84A" },
  learning: { icon: "✦", color: "#7AB648" },
};

interface AgentPanelProps {
  agents: AgentState[];
  activeAgentId: string;
  scenarioTitle: string;
  currentAct: number;
  totalActs: number;
  acts: Scenario["acts"];
  events: Array<{ id: string; type: string; description: string }>;
  learningMode?: boolean;
  learningMessage?: string;
}

export default function AgentPanel({
  agents,
  activeAgentId,
  scenarioTitle,
  currentAct,
  totalActs,
  acts,
  events,
  learningMode = false,
  learningMessage = "",
}: AgentPanelProps) {
  const currentActInfo = acts.find((a) => a.act_number === currentAct);
  const recentEvents = events.slice(-6).reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* ── ACT PROGRESS ── */}
      <div
        style={{
          padding: "16px 14px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(74,144,217,0.04)",
        }}
      >
        {/* Act progress bar */}
        <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
          {Array.from({ length: totalActs }, (_, i) => {
            const isDone = i + 1 < currentAct;
            const isCurrent = i + 1 === currentAct;
            return (
              <div key={i} style={{ flex: 1, position: "relative" }}>
                <div
                  style={{
                    height: 4,
                    background: isDone
                      ? "#4A90D9"
                      : isCurrent
                        ? "rgba(74,144,217,0.5)"
                        : "rgba(255,255,255,0.07)",
                    transition: "background 0.4s",
                  }}
                />
                {isCurrent && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 4,
                      background:
                        "linear-gradient(90deg, #4A90D9 0%, transparent 100%)",
                      animation: "pulse-shimmer 2s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Act label */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: "#5A5A5A",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            {scenarioTitle}
          </span>
          <span
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: 16,
              color: "#4A90D9",
              letterSpacing: "0.05em",
            }}
          >
            ACTE {currentAct}/{totalActs}
          </span>
        </div>

        {/* Act title — concise, no key_challenge (shown in ObjectiveHUD) */}
        {currentActInfo && (
          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(243,240,230,0.55)",
              marginTop: 8,
              letterSpacing: "0.04em",
            }}
          >
            {currentActInfo.title}
          </p>
        )}

        {/* Learning mode banner */}
        {learningMode && (
          <div
            style={{
              marginTop: 10,
              padding: "6px 10px",
              border: "1px solid rgba(122,182,72,0.4)",
              background: "rgba(122,182,72,0.08)",
            }}
          >
            <p
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 8,
                color: "#9CD56A",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              ✦ Learning Mode
            </p>
            <p
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 8,
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.45,
              }}
            >
              {learningMessage || "Un agent vous guide avec un rappel ciblé."}
            </p>
          </div>
        )}
      </div>

      {/* ── AGENTS ── */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <p
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 8,
            color: "#5A5A5A",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Personnages
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {agents.map((agentState) => {
            const { agent, emotion, interactionCount } = agentState;
            const isActive = agent.id === activeAgentId;
            const color = VOICE_COLORS[agent.voice_type] || "#4A90D9";

            return (
              <div
                key={agent.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  background: isActive ? `${color}0E` : "transparent",
                  border: isActive ? `1px solid ${color}30` : "1px solid transparent",
                  transition: "all 0.35s ease",
                }}
              >
                {/* Speaking indicator */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: isActive ? color : "rgba(255,255,255,0.12)",
                      boxShadow: isActive ? `0 0 8px ${color}` : "none",
                      transition: "all 0.35s ease",
                    }}
                  />
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -3,
                        borderRadius: "50%",
                        border: `1px solid ${color}`,
                        opacity: 0.5,
                        animation: "pulse-ring 1.5s ease-out infinite",
                      }}
                    />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 10,
                      fontWeight: isActive ? 700 : 400,
                      color: isActive ? "#F3F0E6" : "rgba(255,255,255,0.4)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      transition: "color 0.35s ease",
                    }}
                  >
                    {agent.name}
                    {isActive && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 7,
                          color,
                          letterSpacing: "0.1em",
                        }}
                      >
                        ▶ EN LIGNE
                      </span>
                    )}
                  </p>
                  <p
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 7,
                      color: isActive ? color : "#5A5A5A",
                      letterSpacing: "0.06em",
                      transition: "color 0.35s ease",
                    }}
                  >
                    {agent.role}
                  </p>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 7,
                      color: "rgba(255,255,255,0.25)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {EMOTION_LABELS[emotion] || emotion}
                  </p>
                  {interactionCount > 0 && (
                    <p
                      style={{
                        fontFamily: "'Space Mono', monospace",
                        fontSize: 7,
                        color: "rgba(255,255,255,0.18)",
                      }}
                    >
                      {interactionCount} tour{interactionCount > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── EVENTS FEED ── */}
      {recentEvents.length > 0 && (
        <div style={{ padding: "12px 14px" }}>
          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: "#5A5A5A",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Journal
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {recentEvents.map((event, idx) => {
              const config =
                EVENT_CONFIG[event.type] || EVENT_CONFIG.crisis;
              const isLatest = idx === 0;
              return (
                <div
                  key={event.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    opacity: isLatest ? 1 : 0.45 - idx * 0.06,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: config.color,
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {config.icon}
                  </span>
                  <p
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 8,
                      color: isLatest
                        ? "rgba(255,255,255,0.6)"
                        : "rgba(255,255,255,0.3)",
                      lineHeight: 1.45,
                    }}
                  >
                    {event.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
