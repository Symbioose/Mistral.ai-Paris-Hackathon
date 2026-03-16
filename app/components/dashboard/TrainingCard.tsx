"use client";

import { motion } from "framer-motion";
import { useState } from "react";

export interface Training {
  id: string;
  title: string;
  description: string | null;
  join_code: string;
  status: "draft" | "processing" | "published";
  document_filename: string;
  max_students: number;
  created_at: string;
  enrollments: Array<{ count: number }>;
}

const STATUS_CONFIG = {
  draft: {
    label: "Brouillon",
    bg: "rgba(148,163,184,0.1)",
    color: "#64748B",
    border: "rgba(148,163,184,0.2)",
    dot: "#94A3B8",
  },
  processing: {
    label: "En traitement",
    bg: "rgba(217,119,6,0.08)",
    color: "#B45309",
    border: "rgba(217,119,6,0.2)",
    dot: "#D97706",
  },
  published: {
    label: "Publiée",
    bg: "rgba(5,150,105,0.08)",
    color: "#047857",
    border: "rgba(5,150,105,0.2)",
    dot: "#059669",
  },
};

interface TrainingCardProps {
  training: Training;
  index: number;
  onTest: (training: Training) => void;
  onPublish: (training: Training) => void;
  onDelete: (training: Training) => void;
  onAnalytics: (training: Training) => void;
  loadingAction?: string;
}

export default function TrainingCard({ training, index, onTest, onPublish, onDelete, onAnalytics, loadingAction }: TrainingCardProps) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const status = STATUS_CONFIG[training.status];
  const enrollmentCount = training.enrollments?.[0]?.count ?? 0;

  const copyCode = async () => {
    await navigator.clipboard.writeText(training.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

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
            {training.title}
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
              animation: training.status === "processing" ? "corp-pulse-soft 1.5s ease-in-out infinite" : "none",
            }} />
            {status.label}
          </span>
        </div>

        {/* Meta row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 13,
          color: "var(--corp-text-muted)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {training.document_filename}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {formatDate(training.created_at)}
          </span>
        </div>
      </div>

      {/* Join code section (only for published) */}
      {training.status === "published" && (
        <div style={{
          margin: "0 24px",
          padding: 16,
          background: "var(--corp-bg-subtle)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--corp-text-muted)", marginBottom: 6 }}>
              Code d'accès
            </div>
            <div style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "var(--corp-navy)",
            }}>
              {training.join_code}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              fontSize: 12,
              color: "var(--corp-text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              {enrollmentCount} inscrit{enrollmentCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={copyCode}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--corp-border)",
                background: "white",
                fontSize: 13,
                fontWeight: 500,
                color: copied ? "var(--corp-success)" : "var(--corp-text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: "var(--corp-font-body)",
              }}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
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
        {training.status === "draft" && (
          <ActionButton
            label="Publier"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
              </svg>
            }
            onClick={() => onPublish(training)}
            variant="primary"
            loading={loadingAction === "publishing"}
            disabled={!!loadingAction}
          />
        )}
        {training.status === "processing" && (
          <ActionButton
            label="En traitement..."
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
              </svg>
            }
            onClick={() => {}}
            variant="primary"
            loading={true}
            disabled={true}
          />
        )}
        <ActionButton
          label="Tester"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          }
          onClick={() => onTest(training)}
          disabled={!!loadingAction}
        />
        {training.status === "published" && (
          <ActionButton
            label="Analytics"
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            }
            onClick={() => onAnalytics(training)}
            disabled={!!loadingAction}
          />
        )}
        <div style={{ flex: 1 }} />
        <ActionButton
          label="Supprimer"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          }
          onClick={() => onDelete(training)}
          variant="danger"
          loading={loadingAction === "deleting"}
          disabled={!!loadingAction}
        />
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
