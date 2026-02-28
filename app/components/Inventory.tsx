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
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5A5A5A", fontWeight: 700 }}>
          Inventaire
        </span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#5A5A5A" }}>
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
                border:        item ? "2px solid #1A1A1A" : "2px dashed #C4C0B5",
                background:    item ? "#FAFAF7" : "#EBE8DE",
                display:       "flex",
                alignItems:    "center",
                justifyContent:"center",
                cursor:        item ? "default" : "default",
                boxShadow:     item ? "3px 3px 0 #1A1A1A" : "none",
                transition:    "box-shadow 0.15s",
              }}
            >
              {item ? (
                <>
                  <span style={{ fontSize: 24, userSelect: "none" }}>{item.emoji}</span>

                  {/* Tooltip */}
                  {hoveredItem === item.id && (
                    <div
                      style={{
                        position:   "absolute",
                        bottom:     "calc(100% + 8px)",
                        left:       "50%",
                        transform:  "translateX(-50%)",
                        zIndex:     50,
                        width:      160,
                        background: "#1A1A1A",
                        border:     "2px solid #FF5B22",
                        padding:    "8px 10px",
                        pointerEvents: "none",
                      }}
                    >
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: "#FF5B22", marginBottom: 4 }}>
                        {item.name}
                      </p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#C4C0B5", lineHeight: 1.4 }}>
                        {item.description}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ width: 20, height: 20, border: "1px dashed #C4C0B5" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
