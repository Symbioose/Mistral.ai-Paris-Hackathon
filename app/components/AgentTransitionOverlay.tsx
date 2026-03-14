"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Agent } from "@/app/lib/types";

const VOICE_COLORS: Record<string, string> = {
  authoritative_male: "#3B82F6",
  warm_female: "#EC4899",
  stressed_young: "#F59E0B",
  calm_narrator: "#10B981",
  gruff_veteran: "#8B5CF6",
};

interface AgentTransitionOverlayProps {
  /** The agent currently being displayed. */
  agent: Agent | null;
  /** Called when the transition animation finishes. */
  onComplete: () => void;
}

/**
 * Brief full-screen overlay that fires when the active agent changes.
 * Shows the new agent's name + role with a fast fade-in / fade-out (~1s total).
 * Purely visual — does not block game logic.
 */
export default function AgentTransitionOverlay({
  agent,
  onComplete,
}: AgentTransitionOverlayProps) {
  const [visible, setVisible] = useState(true);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Auto-dismiss after 1s
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  if (!agent) return null;

  const accentColor = VOICE_COLORS[agent.voice_type] || "#FF5B22";

  return (
    <AnimatePresence onExitComplete={() => onCompleteRef.current()}>
      {visible && (
        <motion.div
          key="agent-transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 140,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(26, 26, 26, 0.92)",
            pointerEvents: "none",
          }}
        >
          {/* Accent stripe */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{
              width: 64,
              height: 4,
              background: accentColor,
              marginBottom: 20,
              borderRadius: 2,
              transformOrigin: "center",
            }}
          />

          {/* Agent name */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1, ease: "easeOut" }}
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 32,
              fontWeight: 700,
              color: "#F3F0E6",
              letterSpacing: "0.04em",
              textAlign: "center",
            }}
          >
            {agent.name.toUpperCase()}
          </motion.div>

          {/* Role */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.2, ease: "easeOut" }}
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 13,
              color: accentColor,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {agent.role}
          </motion.div>

          {/* Bottom accent stripe */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.3, delay: 0.15, ease: "easeOut" }}
            style={{
              width: 40,
              height: 3,
              background: accentColor,
              marginTop: 20,
              borderRadius: 2,
              opacity: 0.5,
              transformOrigin: "center",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
