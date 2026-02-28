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
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5A5A5A", fontWeight: 700 }}>
          Journal des Des
        </span>
        <span style={{ fontSize: 12 }}>d20</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
        {recent.length === 0 ? (
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#C4C0B5", textAlign: "center", padding: "16px 0" }}>
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
                  background:  isSuccess ? "#EBF5EC" : "#F5EBEB",
                  border:      `2px solid ${isSuccess ? "#2D7A3A" : "#CC2A2A"}`,
                  boxShadow:   `2px 2px 0 ${isSuccess ? "#2D7A3A" : "#CC2A2A"}`,
                }}
              >
                {/* Die */}
                <div
                  className={isCrit ? "animate-crit" : isFumble ? "animate-shake" : ""}
                  style={{
                    width:        40,
                    height:       40,
                    background:   isSuccess ? "#2D7A3A" : "#CC2A2A",
                    display:      "flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    flexShrink:   0,
                    border:       "2px solid #1A1A1A",
                    boxShadow:    "2px 2px 0 #1A1A1A",
                  }}
                >
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 17, fontWeight: 700, color: "#FAFAF7" }}>
                    {roll.roll}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
                    {roll.action}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#5A5A5A" }}>
                      seuil {roll.needed}+
                    </span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, color: isSuccess ? "#2D7A3A" : "#CC2A2A", letterSpacing: "0.1em" }}>
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
