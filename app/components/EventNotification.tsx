"use client";

import { useEffect, useState } from "react";

interface NotificationEvent {
  id: string;
  type: string;
  description: string;
}

interface EventNotificationProps {
  events: NotificationEvent[];
}

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  crisis: { icon: "⚠", color: "#CC2A2A", label: "CRISE" },
  new_character: { icon: "◉", color: "#4A90D9", label: "NOUVEAU PERSONNAGE" },
  plot_twist: { icon: "⟳", color: "#D94A8C", label: "REBONDISSEMENT" },
  chaos: { icon: "⚡", color: "#D9A84A", label: "CHAOS" },
  learning: { icon: "✦", color: "#7AB648", label: "LEARNING MODE" },
};

const DISMISS_DELAY_MS = 4500;

export default function EventNotification({ events }: EventNotificationProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Auto-dismiss each new notification after DISMISS_DELAY_MS.
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    if (dismissed.has(latest.id)) return;

    const timer = setTimeout(() => {
      setDismissed((prev) => new Set([...prev, latest.id]));
    }, DISMISS_DELAY_MS);

    return () => clearTimeout(timer);
  // Only re-run when new events are added.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  const visible = events
    .slice(-3)
    .filter((e) => !dismissed.has(e.id));

  if (visible.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        // Horizontally centered in the left zone, vertically near top.
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        minWidth: 320,
        maxWidth: 480,
      }}
    >
      {visible.map((event) => {
        const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.crisis;
        return (
          <div
            key={event.id}
            style={{
              background: "rgba(8, 8, 14, 0.92)",
              border: `1px solid ${config.color}55`,
              padding: "10px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              boxShadow: `0 0 24px ${config.color}22, 0 2px 16px rgba(0,0,0,0.5)`,
              backdropFilter: "blur(8px)",
              animation: "notification-slide-in 0.28s ease-out",
            }}
          >
            <span style={{ fontSize: 14, color: config.color, flexShrink: 0, marginTop: 1 }}>
              {config.icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 8,
                  color: config.color,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 3,
                }}
              >
                {config.label}
              </p>
              <p
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.5,
                }}
              >
                {event.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
