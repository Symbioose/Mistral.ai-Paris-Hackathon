"use client";

import { AgentState } from "@/app/lib/types";

const VOICE_COLORS: Record<string, string> = {
  authoritative_male: "#3B82F6",
  warm_female: "#EC4899",
  stressed_young: "#F59E0B",
  calm_narrator: "#10B981",
  gruff_veteran: "#8B5CF6",
};

const EMOTION_LABELS: Record<string, string> = {
  calm: "Calme",
  stressed: "Stressé",
  angry: "En colère",
  panicked: "Paniqué",
  suspicious: "Méfiant",
};

const EMOTION_ICONS: Record<string, string> = {
  calm: "●",
  stressed: "◆",
  angry: "▲",
  panicked: "⚡",
  suspicious: "◉",
};

interface ActiveAgentDisplayProps {
  agentState: AgentState;
}

export default function ActiveAgentDisplay({ agentState }: ActiveAgentDisplayProps) {
  const { agent, emotion } = agentState;
  const color = VOICE_COLORS[agent.voice_type] || "#4A90D9";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        background: `${color}12`,
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }}
    >
      {/* Agent indicator */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />

      {/* Name + role */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 14,
              fontWeight: 600,
              color: "#FFFFFF",
              letterSpacing: "0.04em",
            }}
          >
            {agent.name}
          </span>
          <span
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 11,
              color: "rgba(255,255,255,0.50)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {agent.role}
          </span>
        </div>
      </div>

      {/* Emotion badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 100,
          background: "rgba(255,255,255,0.07)",
        }}
      >
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.50)" }}>{EMOTION_ICONS[emotion] || "●"}</span>
        <span
          style={{
            fontFamily: "var(--corp-font-body)",
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {EMOTION_LABELS[emotion] || emotion}
        </span>
      </div>
    </div>
  );
}
