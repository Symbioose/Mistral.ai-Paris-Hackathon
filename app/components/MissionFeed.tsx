"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MissionFeedItem, FeedItemType } from "@/app/lib/types";

interface MissionFeedProps {
  items: MissionFeedItem[];
  isActive: boolean;
}

const FEED_CONFIG: Record<
  FeedItemType,
  { color: string; label: string }
> = {
  agent_switch:    { color: "#4A90D9", label: "SWITCH" },
  knowledge_check: { color: "#7AB648", label: "CHECK" },
  score_change:    { color: "#7AB648", label: "SCORE" },
  act_transition:  { color: "#D94A8C", label: "ACTE" },
  event_triggered: { color: "#D9A84A", label: "EVENT" },
  eval_decision:   { color: "#9B59B6", label: "EVAL" },
  emotion_change:  { color: "#4AD9A8", label: "EMOTION" },
  learning_mode:   { color: "#7AB648", label: "LEARN" },
  agent_note:      { color: "#E67E22", label: "NOTE" },
};

function formatRelativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m`;
}

function buildText(item: MissionFeedItem): string {
  switch (item.type) {
    case "agent_switch":
      return `${item.fromAgent || "?"} \u25B8 ${item.toAgent || "?"}${item.reason ? ` — ${item.reason.slice(0, 80)}` : ""}`;
    case "knowledge_check":
      return `${item.topic || "Sujet"}: ${item.wasCorrect ? "Correct" : "Incorrect"}${item.detail ? ` — ${item.detail.slice(0, 60)}` : ""}`;
    case "score_change":
      return "";
    case "act_transition":
      return `Passage acte ${item.actNumber || "?"}: ${item.actTitle || ""}`;
    case "event_triggered":
      return item.detail || "Evenement declenche";
    case "eval_decision":
      return `${item.topic || "Eval"}: ${item.reason || ""}`.slice(0, 100);
    case "emotion_change":
      return `${item.agentName || "Agent"} \u2192 ${item.emotion || "?"}`;
    case "learning_mode":
      return item.detail || "Mode apprentissage actif";
    case "agent_note":
      return `${item.fromAgent || "?"} \u2709 ${item.toAgent || "?"}: ${item.detail || ""}`;
    default:
      return "";
  }
}

function FeedItemRow({ item }: { item: MissionFeedItem }) {
  const cfg = FEED_CONFIG[item.type] || FEED_CONFIG.event_triggered;
  const isScore = item.type === "score_change";
  const isKcFail = item.type === "knowledge_check" && !item.wasCorrect;
  const color = isKcFail ? "#CC2A2A" : isScore && (item.scoreDelta || 0) < 0 ? "#CC2A2A" : cfg.color;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "4px 0",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          marginTop: 3,
          flexShrink: 0,
          background: color,
          borderRadius: 1,
        }}
      />

      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 7,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color,
          textTransform: "uppercase",
          minWidth: 40,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {cfg.label}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {isScore ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <motion.span
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: 16,
                lineHeight: 1,
                color: (item.scoreDelta || 0) >= 0 ? "#7AB648" : "#CC2A2A",
              }}
            >
              {(item.scoreDelta || 0) > 0 ? "+" : ""}{item.scoreDelta}
            </motion.span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "rgba(255,255,255,0.35)" }}>
              {"\u2192"} {item.newScore}/100
            </span>
          </div>
        ) : (
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: "rgba(255,255,255,0.55)",
              lineHeight: "1.4",
              wordBreak: "break-word",
            }}
          >
            {buildText(item)}
          </span>
        )}
      </div>

      <span
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 6,
          color: "#3A3A3A",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {formatRelativeTime(item.timestamp)}
      </span>
    </div>
  );
}

export default function MissionFeed({ items, isActive }: MissionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => items.slice(-30), [items]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visible.length]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Header — thin bar at top */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 16px 4px",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: isActive ? "#4A90D9" : "#3A3A3A",
            animation: isActive ? "blink 1.4s infinite" : "none",
          }}
        />
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#3A3A3A",
          }}
        >
          ORCHESTRATION LOG
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "'Space Mono', monospace",
            fontSize: 6,
            color: "#2A2A2A",
          }}
        >
          {items.length}
        </span>
      </div>

      {/* Scrollable feed area — fills available space, scrolls from bottom */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 16px 60px",
          scrollbarWidth: "none",
          pointerEvents: "auto",
          maskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        }}
      >
        {visible.length === 0 ? (
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 7,
              color: "#2A2A2A",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              animation: "blink 1.4s infinite",
              paddingTop: 16,
              textAlign: "center",
            }}
          >
            EN ATTENTE...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map((item, idx) => {
              const recency = visible.length - idx;
              const opacity = recency <= 4 ? 1 : Math.max(0.25, 1 - (recency - 4) * 0.06);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -12, height: 0 }}
                  animate={{ opacity, x: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                >
                  <FeedItemRow item={item} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
