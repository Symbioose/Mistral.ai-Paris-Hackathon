"use client";

import { motion, AnimatePresence } from "framer-motion";

export interface EmotionState {
  current: "neutral" | "pleased" | "annoyed" | "angry" | "suspicious" | "relieved" | "stressed";
  intensity: number; // 0.0 -> 1.0
  trajectory: "escalating" | "stable" | "cooling";
}

interface EmotionIndicatorProps {
  emotion: EmotionState;
  agentName: string;
}

const EMOTION_LABELS_FR: Record<EmotionState["current"], string> = {
  neutral: "Neutre",
  pleased: "Satisfait",
  annoyed: "Agace",
  angry: "En colere",
  suspicious: "Mefiant",
  relieved: "Soulage",
  stressed: "Stresse",
};

const EMOTION_COLORS: Record<EmotionState["current"], string> = {
  pleased: "#10B981",
  relieved: "#10B981",
  neutral: "#F59E0B",
  annoyed: "#F97316",
  suspicious: "#F97316",
  angry: "#EF4444",
  stressed: "#EF4444",
};

const EMOTION_BG_COLORS: Record<EmotionState["current"], string> = {
  pleased: "rgba(16,185,129,0.12)",
  relieved: "rgba(16,185,129,0.12)",
  neutral: "rgba(245,158,11,0.12)",
  annoyed: "rgba(249,115,22,0.12)",
  suspicious: "rgba(249,115,22,0.12)",
  angry: "rgba(239,68,68,0.12)",
  stressed: "rgba(239,68,68,0.12)",
};

const TRAJECTORY_ARROWS: Record<EmotionState["trajectory"], string> = {
  escalating: "\u2191",
  stable: "\u2192",
  cooling: "\u2193",
};

const TRAJECTORY_COLORS: Record<EmotionState["trajectory"], string> = {
  escalating: "#EF4444",
  stable: "rgba(255,255,255,0.45)",
  cooling: "#10B981",
};

export default function EmotionIndicator({ emotion, agentName }: EmotionIndicatorProps) {
  const color = EMOTION_COLORS[emotion.current];
  const bgColor = EMOTION_BG_COLORS[emotion.current];
  const label = EMOTION_LABELS_FR[emotion.current];
  const arrow = TRAJECTORY_ARROWS[emotion.trajectory];
  const arrowColor = TRAJECTORY_COLORS[emotion.trajectory];
  const fillPercent = Math.round(emotion.intensity * 100);

  // Pulse animation speed scales with intensity (higher = faster pulse)
  const pulseDuration = emotion.intensity > 0.7 ? 0.6 : emotion.intensity > 0.4 ? 1.0 : 1.8;
  const shouldPulse = emotion.intensity > 0.3 && emotion.current !== "neutral";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={emotion.current}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 8 }}
        transition={{ duration: 0.25 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 12px",
          background: bgColor,
          border: `2px solid ${color}`,
          borderRadius: 6,
          boxShadow: `3px 3px 0px ${color}40`,
          minWidth: 180,
        }}
      >
        {/* Emotion label */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <motion.span
              animate={shouldPulse ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
              transition={shouldPulse ? { duration: pulseDuration, repeat: Infinity, ease: "easeInOut" } : {}}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                fontWeight: 700,
                color: color,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {label}
            </span>
            {/* Trajectory arrow */}
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 14,
                fontWeight: 700,
                color: arrowColor,
                lineHeight: 1,
                marginLeft: 2,
              }}
            >
              {arrow}
            </span>
          </div>

          {/* Intensity bar */}
          <div
            style={{
              width: "100%",
              height: 6,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${fillPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              style={{
                height: "100%",
                background: color,
                borderRadius: 3,
              }}
            />
          </div>
        </div>

        {/* Intensity number */}
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: 22,
            color: color,
            lineHeight: 1,
            minWidth: 32,
            textAlign: "right",
          }}
        >
          {fillPercent}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
