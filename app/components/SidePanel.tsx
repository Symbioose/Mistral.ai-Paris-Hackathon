"use client";

import { GameState } from "@/app/lib/types";
import HealthBar from "./HealthBar";
import Inventory from "./Inventory";
import DiceLog from "./DiceLog";

interface SidePanelProps {
  gameState: GameState;
  modeLabel?: string;
  modeSubtitle?: string;
}

export default function SidePanel({ gameState, modeLabel = "Simulation Formation", modeSubtitle = "Mistral Adaptive Engine" }: SidePanelProps) {
  return (
    <aside
      style={{
        height:       "100%",
        display:      "flex",
        flexDirection:"column",
        background:   "#F3F0E6",
        borderLeft:   "4px solid #1A1A1A",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:      "16px 20px 12px",
          borderBottom: "2px solid #1A1A1A",
          background:   "#1A1A1A",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, background: "#FF5B22" }} />
          <h2
            style={{
              fontFamily:    "'Space Mono', monospace",
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color:         "#F3F0E6",
            }}
          >
            Tableau de bord
          </h2>
        </div>

        {gameState.isGameStarted && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#FF5B22", letterSpacing: "0.1em" }}>
              STATION : {gameState.currentStation.toUpperCase()}
            </span>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#5A5A5A" }}>
              Tour {gameState.turnCount}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex:      1,
          overflowY: "auto",
          padding:   "20px",
          display:   "flex",
          flexDirection: "column",
          gap:       24,
        }}
      >
        <HealthBar hp={gameState.hp} maxHp={gameState.maxHp} />

        <div style={{ height: 2, background: "#1A1A1A" }} />

        <Inventory items={gameState.inventory} />

        <div style={{ height: 2, background: "#1A1A1A" }} />

        <DiceLog rolls={gameState.diceLog} />
      </div>

      {/* Footer */}
      <div
        style={{
          padding:   "10px 20px",
          borderTop: "2px solid #1A1A1A",
          background: "#E8E4D9",
        }}
      >
        <p
          style={{
            fontFamily:    "'Space Mono', monospace",
            fontSize:      8,
            color:         "#5A5A5A",
            textAlign:     "center",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          {modeLabel} · {modeSubtitle}
        </p>
      </div>
    </aside>
  );
}
