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
      role="status"
      aria-live="polite"
      aria-label={`Acte ${completedAct.act_number} accompli${nextAct ? `, prochain acte: ${nextAct.title}` : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        background: "rgba(17,19,24,0.97)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        animation: "act-transition-in 3.5s ease-in-out forwards",
        pointerEvents: "none",
      }}
    >

      {/* Completed act — success state */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div
          style={{
            fontFamily: "var(--corp-font-body)",
            fontSize: 14,
            color: "#10B981",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          ✓ &nbsp; ACTE {completedAct.act_number} ACCOMPLI
        </div>
        <div
          style={{
            fontFamily: "var(--corp-font-heading)",
            fontSize: 48,
            color: "#FFFFFF",
            lineHeight: 1.1,
          }}
        >
          {completedAct.title.toUpperCase()}
        </div>
        <div
          style={{
            width: 80,
            height: 2,
            background: "#10B981",
            margin: "14px auto 0",
          }}
        />
      </div>

      {/* Chevrons */}
      {nextAct && (
        <>
          {/* Next act card */}
          <div
            style={{
              textAlign: "center",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "24px 36px",
              background: "rgba(31,35,48,0.6)",
              borderRadius: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              maxWidth: 560,
            }}
          >
            <div
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 11,
                color: "#F59E0B",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              ACTE {nextAct.act_number}
            </div>
            <div
              style={{
                fontFamily: "var(--corp-font-heading)",
                fontSize: 28,
                color: "#FFFFFF",
                marginBottom: 12,
                fontWeight: 400,
              }}
            >
              {nextAct.title}
            </div>
            <p
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 14,
                color: "rgba(255,255,255,0.65)",
                lineHeight: 1.6,
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
