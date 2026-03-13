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

export default function SidePanel({ gameState, modeLabel = "Simulation Formation", modeSubtitle = "Adaptive Engine" }: SidePanelProps) {
  return (
    <aside
      style={{
        height:       "100%",
        display:      "flex",
        flexDirection:"column",
        background:   "#181B23",
        borderLeft:   "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:      "16px 20px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background:   "#1F2330",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, background: "#F59E0B", borderRadius: "50%" }} />
          <h2
            style={{
              fontFamily:    "var(--corp-font-body)",
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color:         "rgba(255,255,255,0.90)",
            }}
          >
            Tableau de bord
          </h2>
        </div>

        {gameState.isGameStarted && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, color: "#F59E0B", letterSpacing: "0.1em" }}>
              STATION : {gameState.currentStation.toUpperCase()}
            </span>
            <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, color: "rgba(255,255,255,0.50)" }}>
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

        <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

        <Inventory items={gameState.inventory} />

        <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

        <DiceLog rolls={gameState.diceLog} />
      </div>

      {/* Footer */}
      <div
        style={{
          padding:   "10px 20px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "#1F2330",
        }}
      >
        <p
          style={{
            fontFamily:    "var(--corp-font-body)",
            fontSize:      8,
            color:         "rgba(255,255,255,0.40)",
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
