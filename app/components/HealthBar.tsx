"use client";

import { useEffect, useRef, useState } from "react";

interface HealthBarProps {
  hp: number;
  maxHp: number;
}

export default function HealthBar({ hp, maxHp }: HealthBarProps) {
  const [displayHp, setDisplayHp] = useState(hp);
  const [isShaking, setIsShaking] = useState(false);
  const prevHp = useRef(hp);

  useEffect(() => {
    if (hp < prevHp.current) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
    prevHp.current = hp;

    const start = displayHp;
    const diff = hp - start;
    const startTime = performance.now();
    const duration = 500;
    const animate = (t: number) => {
      const p = Math.min((t - startTime) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplayHp(Math.round(start + diff * e));
      if (p < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [hp]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const barColor = pct > 60 ? "#2D7A3A" : pct > 30 ? "#CC7A00" : "#CC2A2A";
  const textColor = pct > 60 ? "#2D7A3A" : pct > 30 ? "#CC7A00" : "#CC2A2A";

  return (
    <div className={isShaking ? "animate-shake" : ""}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5A5A5A", fontWeight: 700 }}>
          Points de Vie
        </span>
        <span
          style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, color: textColor }}
          className={pct <= 30 ? "animate-blink" : ""}
        >
          {displayHp}/{maxHp}
        </span>
      </div>

      {/* Track */}
      <div style={{ height: 20, background: "#E8E4D9", border: "2px solid #1A1A1A", position: "relative", overflow: "hidden" }}>
        {/* Bar */}
        <div
          style={{
            height:     "100%",
            width:      `${pct}%`,
            background: barColor,
            transition: "width 0.5s ease-out, background 0.3s",
          }}
        />
        {/* Grid overlay */}
        <div
          style={{
            position:        "absolute",
            inset:           0,
            backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 9px, rgba(0,0,0,0.08) 9px, rgba(0,0,0,0.08) 10px)",
            pointerEvents:   "none",
          }}
        />
      </div>

      {pct <= 30 && (
        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#CC2A2A", letterSpacing: "0.15em", marginTop: 4, fontWeight: 700 }}>
          ÉTAT CRITIQUE
        </p>
      )}
    </div>
  );
}
