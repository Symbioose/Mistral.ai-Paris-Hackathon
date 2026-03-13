"use client";

import { useEffect, useRef, useState } from "react";

interface HealthBarProps {
  hp: number;
  maxHp: number;
}

export default function HealthBar({ hp, maxHp }: HealthBarProps) {
  const [displayHp, setDisplayHp] = useState(hp);
  const prevHp = useRef(hp);

  useEffect(() => {
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
  const barColor = pct > 60 ? "#10B981" : pct > 30 ? "#F59E0B" : "#EF4444";
  const textColor = pct > 60 ? "#10B981" : pct > 30 ? "#F59E0B" : "#EF4444";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.50)", fontWeight: 500 }}>
          Points de Vie
        </span>
        <span
          style={{ fontFamily: "var(--corp-font-heading)", fontSize: 16, fontWeight: 700, color: textColor }}
          className={pct <= 30 ? "animate-blink" : ""}
        >
          {displayHp}/{maxHp}
        </span>
      </div>

      {/* Track */}
      <div style={{ height: 20, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 6, position: "relative", overflow: "hidden" }}>
        {/* Bar */}
        <div
          style={{
            height:     "100%",
            width:      `${pct}%`,
            background: barColor,
            transition: "width 0.5s ease-out, background 0.3s",
            borderRadius: 6,
          }}
        />
      </div>

      {pct <= 30 && (
        <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 9, color: "#EF4444", letterSpacing: "0.15em", marginTop: 4, fontWeight: 700 }}>
          ÉTAT CRITIQUE
        </p>
      )}
    </div>
  );
}
