"use client";

import { motion } from "framer-motion";
import { useState } from "react";

export interface Enrollment {
  id: string;
  status: "not_started" | "in_progress" | "completed";
  score: number | null;
  total_questions: number | null;
  correct_answers: number | null;
  last_played_at: string | null;
  created_at: string;
  trainings: {
    id: string;
    title: string;
    description: string | null;
    join_code: string;
  };
}

const STATUS_CONFIG = {
  not_started: {
    label: "Non commencé",
    bg: "rgba(148,163,184,0.1)",
    color: "#64748B",
    border: "rgba(148,163,184,0.2)",
    dot: "#94A3B8",
  },
  in_progress: {
    label: "En cours",
    bg: "rgba(217,119,6,0.08)",
    color: "#B45309",
    border: "rgba(217,119,6,0.2)",
    dot: "#D97706",
  },
  completed: {
    label: "Terminé",
    bg: "rgba(5,150,105,0.08)",
    color: "#047857",
    border: "rgba(5,150,105,0.2)",
    dot: "#059669",
  },
};

interface EnrollmentCardProps {
  enrollment: Enrollment;
  index: number;
  onPlay: (enrollment: Enrollment) => void;
  onCopilot?: (enrollment: Enrollment) => void;
}

export default function EnrollmentCard({ enrollment, index, onPlay, onCopilot }: EnrollmentCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const status = STATUS_CONFIG[enrollment.status];

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const correctAnswers = enrollment.correct_answers ?? 0;
  const totalQuestions = enrollment.total_questions ?? 0;
  const progressRatio = totalQuestions > 0 ? correctAnswers / totalQuestions : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.1, 0.25, 1] }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: "var(--corp-bg-card)",
        borderRadius: 16,
        border: `1px solid ${isHovered ? "var(--corp-blue)" : "var(--corp-border)"}`,
        overflow: "hidden",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        boxShadow: isHovered
          ? "0 8px 24px -4px rgba(37,99,235,0.1), 0 4px 8px -2px rgba(15,28,63,0.06)"
          : "var(--corp-shadow-sm)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ padding: "24px 24px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{
            fontFamily: "var(--corp-font-heading)",
            fontSize: 22,
            fontWeight: 400,
            color: "var(--corp-navy)",
            margin: 0,
            lineHeight: 1.3,
            flex: 1,
            paddingRight: 12,
          }}>
            {enrollment.trainings.title}
          </h3>

          {/* Status badge */}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 500,
            background: status.bg,
            color: status.color,
            border: `1px solid ${status.border}`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: status.dot,
              display: "inline-block",
              animation: enrollment.status === "in_progress" ? "corp-pulse-soft 1.5s ease-in-out infinite" : "none",
            }} />
            {status.label}
          </span>
        </div>
      </div>

      {/* Progress section */}
      {enrollment.status !== "not_started" && (
        <div style={{
          margin: "0 24px",
          padding: 16,
          background: "var(--corp-bg-subtle)",
          borderRadius: 12,
        }}>
          {/* Score display */}
          <div style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 28,
                fontWeight: 700,
                color: "var(--corp-navy)",
                lineHeight: 1,
              }}>
                {correctAnswers}
              </span>
              <span style={{
                fontSize: 16,
                color: "var(--corp-text-muted)",
                fontWeight: 500,
              }}>
                / {totalQuestions}
              </span>
              <span style={{
                fontSize: 12,
                color: "var(--corp-text-muted)",
                marginLeft: 4,
              }}>
                bonnes réponses
              </span>
            </div>
            {enrollment.score !== null && (
              <span style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--corp-blue)",
              }}>
                {enrollment.score} pts
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div style={{
            width: "100%",
            height: 6,
            background: "rgba(148,163,184,0.15)",
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: 12,
          }}>
            <div style={{
              width: `${progressRatio * 100}%`,
              height: "100%",
              background: "var(--corp-blue)",
              borderRadius: 3,
              transition: "width 0.4s ease",
            }} />
          </div>

          {/* Last played */}
          {enrollment.last_played_at && (
            <div style={{
              fontSize: 12,
              color: "var(--corp-text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Dernière partie : {formatRelativeDate(enrollment.last_played_at)}
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Actions footer */}
      <div style={{
        padding: "16px 24px",
        borderTop: "1px solid var(--corp-border-light)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 16,
      }}>
        <ActionButton
          label={enrollment.status === "completed" ? "Rejouer" : enrollment.status === "in_progress" ? "Reprendre" : "Jouer"}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          }
          onClick={() => onPlay(enrollment)}
          variant="primary"
        />
        {onCopilot && (
          <ActionButton
            label="Copilote"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            }
            onClick={() => onCopilot(enrollment)}
            variant="default"
          />
        )}
      </div>
    </motion.div>
  );
}

function ActionButton({ label, icon, onClick, variant = "default", loading = false, disabled = false }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  const colors = {
    default: { bg: "transparent", color: "var(--corp-text-secondary)", hoverBg: "var(--corp-bg-subtle)" },
    primary: { bg: "var(--corp-blue)", color: "white", hoverBg: "var(--corp-blue-dim)" },
    danger: { bg: "transparent", color: "var(--corp-text-muted)", hoverBg: "rgba(220,38,38,0.06)" },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: variant === "primary" ? "8px 16px" : "8px 12px",
        borderRadius: 8,
        border: variant === "primary" ? "none" : "1px solid var(--corp-border)",
        background: colors.bg,
        fontSize: 13,
        fontWeight: 500,
        color: colors.color,
        cursor: isDisabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
        fontFamily: "var(--corp-font-body)",
        opacity: isDisabled ? 0.6 : 1,
      }}
      onMouseOver={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.background = colors.hoverBg;
          if (variant === "danger") e.currentTarget.style.color = "var(--corp-danger)";
        }
      }}
      onMouseOut={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.background = colors.bg;
          if (variant === "danger") e.currentTarget.style.color = colors.color;
        }
      }}
    >
      {loading ? (
        <div style={{
          width: 14, height: 14,
          border: "2px solid rgba(255,255,255,0.3)",
          borderTop: `2px solid ${variant === "primary" ? "white" : "var(--corp-text-secondary)"}`,
          borderRadius: "50%",
          animation: "corp-spinner 0.6s linear infinite",
        }} />
      ) : icon}
      {label}
    </button>
  );
}
