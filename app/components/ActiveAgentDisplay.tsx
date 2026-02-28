"use client";

import { AgentState } from "@/app/lib/types";

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
        border: `1px solid ${color}44`,
        background: `${color}0A`,
      }}
    >
      {/* Agent indicator */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 8px ${color}88`,
          flexShrink: 0,
        }}
      />

      {/* Name + role */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 12,
              fontWeight: 700,
              color: "#F3F0E6",
              letterSpacing: "0.04em",
            }}
          >
            {agent.name}
          </span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: color,
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
          border: `1px solid ${color}33`,
          background: `${color}11`,
        }}
      >
        <span style={{ fontSize: 8, color }}>{EMOTION_ICONS[emotion] || "●"}</span>
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 8,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {EMOTION_LABELS[emotion] || emotion}
        </span>
      </div>
    </div>
  );
}
