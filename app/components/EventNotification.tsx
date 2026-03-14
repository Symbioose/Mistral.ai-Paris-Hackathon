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
  crisis: { icon: "⚠", color: "#DC2626", label: "CRISE" },
  new_character: { icon: "◉", color: "#2563EB", label: "NOUVEAU PERSONNAGE" },
  plot_twist: { icon: "⟳", color: "#EC4899", label: "REBONDISSEMENT" },
  chaos: { icon: "⚡", color: "#D97706", label: "CHAOS" },
  learning: { icon: "✦", color: "#059669", label: "LEARNING MODE" },
};

const DISMISS_DELAY_MS = 4500;

export default function EventNotification({ events }: EventNotificationProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Auto-dismiss each new notification after DISMISS_DELAY_MS.
  // Also cap the dismissed Set to prevent unbounded growth in long sessions.
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    if (dismissed.has(latest.id)) return;

    const timer = setTimeout(() => {
      setDismissed((prev) => {
        const next = new Set([...prev, latest.id]);
        // Cap at 100 entries to prevent memory growth
        if (next.size > 100) {
          const arr = [...next];
          return new Set(arr.slice(arr.length - 50));
        }
        return next;
      });
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
      role="log"
      aria-live="polite"
      aria-label="Notifications"
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
        maxWidth: "min(480px, calc(100vw - 48px))",
      }}
    >
      {visible.map((event) => {
        const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.crisis;
        return (
          <div
            key={event.id}
            style={{
              background: "rgba(31,35,48,0.95)",
              borderLeft: `3px solid ${config.color}`,
              borderRadius: 12,
              padding: "10px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
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
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 11,
                  color: config.color,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 3,
                }}
              >
                {config.label}
              </p>
              <p
                style={{
                  fontFamily: "var(--corp-font-body)",
                  fontSize: 13,
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
