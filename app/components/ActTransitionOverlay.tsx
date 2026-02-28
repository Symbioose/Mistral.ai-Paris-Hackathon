"use client";

import { useEffect, useRef } from "react";
import { Scenario } from "@/app/lib/types";

interface ActTransitionOverlayProps {
  completedAct: Scenario["acts"][0];
  nextAct: Scenario["acts"][0] | null;
  onComplete: () => void;
}

export default function ActTransitionOverlay({
  completedAct,
  nextAct,
  onComplete,
}: ActTransitionOverlayProps) {
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const timer = setTimeout(() => onCompleteRef.current(), 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "act-transition-in 3.5s ease-in-out forwards",
        pointerEvents: "none",
      }}
    >
      {/* Subtle grid lines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.035,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 48px, rgba(255,255,255,0.9) 48px, rgba(255,255,255,0.9) 49px), repeating-linear-gradient(90deg, transparent, transparent 48px, rgba(255,255,255,0.9) 48px, rgba(255,255,255,0.9) 49px)",
        }}
      />

      {/* Completed act — success state */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            color: "#2D9A48",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          ✓ &nbsp; ACTE {completedAct.act_number} ACCOMPLI
        </div>
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: 58,
            color: "#F3F0E6",
            letterSpacing: "0.06em",
            lineHeight: 1,
          }}
        >
          {completedAct.title.toUpperCase()}
        </div>
        <div
          style={{
            width: 64,
            height: 2,
            background: "#2D9A48",
            margin: "14px auto 0",
          }}
        />
      </div>

      {/* Chevrons */}
      {nextAct && (
        <>
          <div
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: 24,
              color: "rgba(255,255,255,0.12)",
              marginBottom: 32,
              letterSpacing: "0.25em",
            }}
          >
            ▼ &nbsp; ▼ &nbsp; ▼
          </div>

          {/* Next act — brief */}
          <div
            style={{
              textAlign: "center",
              border: "1px solid rgba(74,144,217,0.28)",
              padding: "18px 36px",
              background: "rgba(74,144,217,0.05)",
              maxWidth: 560,
            }}
          >
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 8,
                color: "#4A90D9",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              ▶ &nbsp; ACTE {nextAct.act_number} : {nextAct.title.toUpperCase()}
            </div>
            <p
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                color: "rgba(243,240,230,0.6)",
                lineHeight: 1.75,
                margin: 0,
              }}
            >
              {nextAct.key_challenge}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
