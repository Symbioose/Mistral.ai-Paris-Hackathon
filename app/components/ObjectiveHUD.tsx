"use client";

import { Scenario } from "@/app/lib/types";

function scoreColor(score: number): string {
  if (score < 30) return "#EF4444";
  if (score < 50) return "#F97316";
  if (score < 70) return "#F59E0B";
  if (score < 85) return "#10B981";
  return "#34D399";
}

function scoreLabel(score: number): string {
  if (score < 30) return "CRITIQUE";
  if (score < 50) return "FAIBLE";
  if (score < 70) return "MOYEN";
  if (score < 85) return "BIEN";
  return "MAITRISE";
}

interface ObjectiveHUDProps {
  act: Scenario["acts"][0] | undefined;
  currentAct: number;
  totalActs: number;
  totalScore: number;
}

export default function ObjectiveHUD({
  act,
  currentAct,
  totalActs,
  totalScore,
}: ObjectiveHUDProps) {
  const color = scoreColor(totalScore);

  return (
    <div
      style={{
        position: "relative",
        zIndex: 21,
        margin: "8px 24px 0",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        background: "rgba(31,35,48,0.6)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* Top row: act badge + score bar + score number */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px 6px",
        }}
      >
        {/* Act badge */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 11,
              color: "rgba(255,255,255,0.50)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            ACTE
          </span>
          <span
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 22,
              color: "#F59E0B",
              lineHeight: 1,
            }}
          >
            {currentAct}/{totalActs}
          </span>
        </div>

        {/* Score bar */}
        <div style={{ flex: 1, position: "relative", height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${totalScore}%`,
              background: color,
              transition: "width 0.7s ease, background 0.7s ease",
            }}
          />
        </div>

        {/* Score number + delta */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "baseline",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 24,
              color,
              lineHeight: 1,
              transition: "color 0.7s ease",
            }}
          >
            {totalScore}
          </span>
          <span
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 10,
              color: "rgba(255,255,255,0.50)",
              letterSpacing: "0.08em",
            }}
          >
            {scoreLabel(totalScore)}
          </span>
        </div>
      </div>

      {/* Key challenge row */}
      {act && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "0 14px 10px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            paddingTop: 7,
          }}
        >
          <span
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 12,
              color: "#F59E0B",
              flexShrink: 0,
              marginTop: 1,
              letterSpacing: "0.05em",
            }}
          >
            →
          </span>
          <p
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 13,
              color: "rgba(255,255,255,0.65)",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {act.key_challenge}
          </p>
        </div>
      )}
    </div>
  );
}
