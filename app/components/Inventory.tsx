"use client";

import { useState } from "react";
import { InventoryItem } from "@/app/lib/types";

interface InventoryProps {
  items: InventoryItem[];
}

export default function Inventory({ items }: InventoryProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const maxSlots = 6;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.50)", fontWeight: 500 }}>
          Inventaire
        </span>
        <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, color: "rgba(255,255,255,0.50)" }}>
          {items.length}/{maxSlots}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {Array.from({ length: maxSlots }).map((_, i) => {
          const item = items[i];
          return (
            <div
              key={item?.id ?? `empty-${i}`}
              className={item ? "animate-item-appear" : ""}
              onMouseEnter={() => item && setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                position:      "relative",
                aspectRatio:   "1",
                border:        item ? "1px solid rgba(255,255,255,0.15)" : "1px dashed rgba(255,255,255,0.15)",
                background:    item ? "rgba(31,35,48,0.6)" : "rgba(255,255,255,0.03)",
                borderRadius:  8,
                display:       "flex",
                alignItems:    "center",
                justifyContent:"center",
                cursor:        "default",
                transition:    "background 0.15s",
              }}
            >
              {item ? (
                <>
                  <span style={{ fontSize: 24, userSelect: "none" }}>{item.emoji}</span>

                  {/* Tooltip */}
                  {hoveredItem === item.id && (
                    <div
                      role="tooltip"
                      style={{
                        position:   "absolute",
                        bottom:     i < 3 ? "auto" : "calc(100% + 8px)",
                        top:        i < 3 ? "calc(100% + 8px)" : "auto",
                        left:       "50%",
                        transform:  "translateX(-50%)",
                        zIndex:     50,
                        width:      160,
                        background: "#272B3A",
                        border:     "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 8,
                        padding:    "8px 10px",
                        pointerEvents: "none",
                      }}
                    >
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 700, color: "#F59E0B", marginBottom: 4 }}>
                        {item.name}
                      </p>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, color: "rgba(255,255,255,0.70)", lineHeight: 1.4 }}>
                        {item.description}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ width: 20, height: 20, border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 4 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
