"use client";

import { useEffect, useRef, useState } from "react";

function scoreColor(score: number): string {
  if (score < 30) return "#EF4444";
  if (score < 50) return "#F97316";
  if (score < 70) return "#F59E0B";
  if (score < 85) return "#10B981";
  return "#34D399";
}

function scoreLabel(score: number): string {
  if (score < 30) return "CRITIQUE";
  if (score < 50) return "INSUFFISANT";
  if (score < 70) return "MOYEN";
  if (score < 85) return "BIEN";
  return "EXCELLENT";
}

const CONCLUSION_LABELS: Record<string, string> = {
  success: "MISSION ACCOMPLIE",
  partial: "MISSION PARTIELLE",
  failure: "MISSION ECHOUEE",
};

const CONCLUSION_COLORS: Record<string, string> = {
  success: "#2D9A48",
  partial: "#D9A84A",
  failure: "#CC2A2A",
};

interface SimulationEndOverlayProps {
  totalScore: number;
  conclusionType: string;
  finalMessage: string;
  isGeneratingReport?: boolean;
  onComplete: () => void;
}

export default function SimulationEndOverlay({
  totalScore,
  conclusionType,
  finalMessage,
  isGeneratingReport = false,
  onComplete,
}: SimulationEndOverlayProps) {
  const [typedMessage, setTypedMessage] = useState("");
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const color = scoreColor(totalScore);
  const label = scoreLabel(totalScore);
  const conclusionLabel = CONCLUSION_LABELS[conclusionType] ?? "SIMULATION TERMINEE";
  const conclusionColor = CONCLUSION_COLORS[conclusionType] ?? "#4A90D9";

  // Typewriter for final message
  useEffect(() => {
    if (!finalMessage) return;
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTypedMessage(finalMessage.slice(0, i));
      if (i >= finalMessage.length) clearInterval(interval);
    }, 22);
    return () => clearInterval(interval);
  }, [finalMessage]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(17,19,24,0.98)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "fade-in 0.6s ease-out forwards",
      }}
    >

      <div
        style={{
          width: "100%",
          maxWidth: 560,
          padding: "0 32px",
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Conclusion tag */}
        <div
          style={{
            fontFamily: "var(--corp-font-body)",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#FFFFFF",
            background: conclusionColor,
            padding: "4px 16px",
            borderRadius: 100,
            display: "inline-block",
            fontWeight: 600,
            marginBottom: 18,
          }}
        >
          {conclusionLabel}
        </div>

        {/* Big title */}
        <div
          style={{
            fontFamily: "var(--corp-font-heading)",
            fontSize: 48,
            color: "#FFFFFF",
            fontWeight: 400,
            lineHeight: 1.1,
            marginBottom: 36,
          }}
        >
          SIMULATION<br />TERMINÉE
        </div>

        {/* Score display */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 72,
              color,
              textShadow: `0 0 20px ${color}40`,
              lineHeight: 1,
            }}
          >
            {totalScore}
          </span>
          <span
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 20,
              color: "rgba(255,255,255,0.35)",
            }}
          >
            /100
          </span>
        </div>

        {/* Score badge */}
        <div
          style={{
            display: "inline-block",
            fontFamily: "var(--corp-font-body)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#FFFFFF",
            background: color,
            borderRadius: 100,
            padding: "4px 16px",
            marginBottom: 36,
          }}
        >
          {label}
        </div>

        {/* Final agent message */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 36,
            textAlign: "left",
            background: "rgba(31,35,48,0.6)",
            minHeight: 68,
          }}
        >
          <p
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 15,
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.75,
              margin: 0,
            }}
          >
            {typedMessage || "\u00A0"}
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: "0.9em",
                background: "#3B82F6",
                marginLeft: 2,
                verticalAlign: "text-bottom",
                animation: "typewriter-cursor 0.8s ease-in-out infinite",
              }}
            />
          </p>
        </div>

        {/* Manager report action */}
        <div>
          <p
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {isGeneratingReport
              ? "Generation du rapport manager..."
              : "Pret pour le rapport manager"}
          </p>
          <div
            style={{
              height: 6,
              background: "rgba(255,255,255,0.08)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: isGeneratingReport ? "72%" : "100%",
                background: "#3B82F6",
                transition: "width 0.2s ease-out",
              }}
            />
          </div>
          <button
            onClick={() => onCompleteRef.current()}
            disabled={isGeneratingReport}
            style={{
              marginTop: 16,
              fontFamily: "var(--corp-font-body)",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#FFFFFF",
              background: isGeneratingReport ? "rgba(59,130,246,0.3)" : "#3B82F6",
              boxShadow: isGeneratingReport ? "none" : "0 4px 16px rgba(59,130,246,0.3)",
              border: "none",
              borderRadius: 12,
              padding: "12px 24px",
              cursor: isGeneratingReport ? "not-allowed" : "pointer",
            }}
          >
            {isGeneratingReport ? "Generation..." : "Voir le rapport manager"}
          </button>
        </div>
      </div>
    </div>
  );
}
