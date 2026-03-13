"use client";

import { DiceRoll } from "@/app/lib/types";

interface DiceLogProps {
  rolls: DiceRoll[];
}

export default function DiceLog({ rolls }: DiceLogProps) {
  const recent = [...rolls].reverse().slice(0, 4);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.50)", fontWeight: 500 }}>
          Journal des Des
        </span>
        <span style={{ fontSize: 12 }}>d20</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
        {recent.length === 0 ? (
          <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, color: "rgba(255,255,255,0.30)", textAlign: "center", padding: "16px 0" }}>
            — aucun lancer —
          </p>
        ) : (
          recent.map((roll, idx) => {
            const isSuccess = roll.success;
            const isCrit = roll.roll === 20;
            const isFumble = roll.roll === 1;

            return (
              <div
                key={roll.id}
                className={idx === 0 ? "animate-dice-appear" : ""}
                style={{
                  display:     "flex",
                  alignItems:  "center",
                  gap:         10,
                  padding:     "8px 10px",
                  background:  isSuccess ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                  border:      `1px solid ${isSuccess ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                  borderRadius: 8,
                }}
              >
                {/* Die */}
                <div
                  className={isCrit ? "animate-crit" : isFumble ? "animate-shake" : ""}
                  style={{
                    width:        40,
                    height:       40,
                    background:   isSuccess ? "#10B981" : "#EF4444",
                    display:      "flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    flexShrink:   0,
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 17, fontWeight: 700, color: "#FAFAF7" }}>
                    {roll.roll}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, color: "rgba(255,255,255,0.90)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
                    {roll.action}
                  </p>
                  {roll.skillName && (
                    <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, color: "rgba(255,255,255,0.70)", marginTop: 3 }}>
                      Procedure: {roll.skillName} {roll.skillId ? `(${roll.skillId})` : ""}
                    </p>
                  )}
                  {roll.skillEvidence && (
                    <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 8, color: "rgba(255,255,255,0.50)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Preuve doc: {roll.skillEvidence}
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, color: "rgba(255,255,255,0.50)" }}>
                      seuil {roll.needed}+
                    </span>
                    <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, fontWeight: 700, color: isSuccess ? "#10B981" : "#EF4444", letterSpacing: "0.1em" }}>
                      {isCrit ? "CRITIQUE!" : isFumble ? "FUMBLE!" : isSuccess ? "SUCCES" : "ECHEC"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
