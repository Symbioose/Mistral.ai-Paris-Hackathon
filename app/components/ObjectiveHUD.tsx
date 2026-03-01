"use client";

import { Scenario } from "@/app/lib/types";

function scoreColor(score: number): string {
  if (score < 30) return "#CC2A2A";
  if (score < 50) return "#D9754A";
  if (score < 70) return "#D9A84A";
  if (score < 85) return "#7AB648";
  return "#2D9A48";
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
  scoreDelta,
}: ObjectiveHUDProps) {
  const color = scoreColor(totalScore);

  return (
    <div
      style={{
        position: "relative",
        zIndex: 21,
        margin: "8px 24px 0",
        border: "1px solid rgba(74,144,217,0.18)",
        background: "rgba(0,0,0,0.45)",
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
              fontFamily: "'Space Mono', monospace",
              fontSize: 7,
              color: "#5A5A5A",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            ACTE
          </span>
          <span
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: 20,
              color: "#4A90D9",
              lineHeight: 1,
            }}
          >
            {currentAct}/{totalActs}
          </span>
        </div>

        {/* Score bar */}
        <div style={{ flex: 1, position: "relative", height: 5, background: "rgba(255,255,255,0.07)" }}>
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
              fontFamily: "'VT323', monospace",
              fontSize: 22,
              color,
              lineHeight: 1,
              transition: "color 0.7s ease",
            }}
          >
            {totalScore}
          </span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 7,
              color: "#5A5A5A",
              letterSpacing: "0.08em",
            }}
          >
            {scoreLabel(totalScore)}
          </span>
          {scoreDelta !== null && (
            <span
              key={`delta_${currentAct}_${scoreDelta}`}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 9,
                fontWeight: 700,
                color: scoreDelta >= 0 ? "#7AB648" : "#CC2A2A",
                animation: "score-delta-pop 2.4s ease-out forwards",
              }}
            >
              {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta}
            </span>
          )}
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
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: "#4A90D9",
              flexShrink: 0,
              marginTop: 1,
              letterSpacing: "0.05em",
            }}
          >
            →
          </span>
          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 9,
              color: "rgba(243,240,230,0.72)",
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
