"use client";

import { useEffect, useRef, useState } from "react";

function scoreColor(score: number): string {
  if (score < 30) return "#CC2A2A";
  if (score < 50) return "#D9754A";
  if (score < 70) return "#D9A84A";
  if (score < 85) return "#7AB648";
  return "#2D9A48";
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
  onComplete: () => void;
}

export default function SimulationEndOverlay({
  totalScore,
  conclusionType,
  finalMessage,
  onComplete,
}: SimulationEndOverlayProps) {
  const [typedMessage, setTypedMessage] = useState("");
  const [progress, setProgress] = useState(0);
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

  // Progress bar: 0 → 100 over 5s, then call onComplete
  useEffect(() => {
    const start = Date.now();
    const duration = 5200;
    let rafId: number;

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      if (pct < 100) {
        rafId = requestAnimationFrame(tick);
      } else {
        setTimeout(() => onCompleteRef.current(), 350);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.96)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "fade-in 0.6s ease-out forwards",
      }}
    >
      {/* CRT scanlines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.025,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 4px)",
          pointerEvents: "none",
        }}
      />

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
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.38em",
            textTransform: "uppercase",
            color: conclusionColor,
            marginBottom: 18,
          }}
        >
          {conclusionLabel}
        </div>

        {/* Big title */}
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: 62,
            color: "#F3F0E6",
            letterSpacing: "0.06em",
            lineHeight: 0.95,
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
              fontFamily: "'VT323', monospace",
              fontSize: 80,
              color,
              lineHeight: 1,
            }}
          >
            {totalScore}
          </span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 16,
              color: "rgba(255,255,255,0.25)",
            }}
          >
            /100
          </span>
        </div>

        {/* Score badge */}
        <div
          style={{
            display: "inline-block",
            fontFamily: "'Space Mono', monospace",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "#1A1A1A",
            background: color,
            padding: "5px 16px",
            marginBottom: 36,
          }}
        >
          {label}
        </div>

        {/* Final agent message */}
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "16px 20px",
            marginBottom: 36,
            textAlign: "left",
            background: "rgba(255,255,255,0.03)",
            minHeight: 68,
          }}
        >
          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              color: "rgba(243,240,230,0.68)",
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
                background: "#4A90D9",
                marginLeft: 2,
                verticalAlign: "text-bottom",
                animation: "typewriter-cursor 0.8s ease-in-out infinite",
              }}
            />
          </p>
        </div>

        {/* Fake progress bar */}
        <div>
          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: "#5A5A5A",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Génération du rapport d&apos;évaluation...
          </p>
          <div
            style={{
              height: 6,
              background: "rgba(255,255,255,0.06)",
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
                width: `${progress}%`,
                background: "#4A90D9",
                transition: "width 0.08s linear",
              }}
            />
          </div>
          <div
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: 14,
              color: "#4A90D9",
              textAlign: "right",
              marginTop: 5,
              letterSpacing: "0.05em",
            }}
          >
            {progress}%
          </div>
        </div>
      </div>
    </div>
  );
}
