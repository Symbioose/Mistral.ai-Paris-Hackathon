"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import type { Training } from "./TrainingCard";

interface Enrollment {
  id: string;
  student_id: string;
  status: "enrolled" | "in_progress" | "completed";
  score: number | null;
  total_questions: number | null;
  correct_answers: number | null;
  last_played_at: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface TrainingAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  training: Training | null;
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffH < 24) return `il y a ${diffH}h`;
  if (diffD === 1) return "hier";
  if (diffD < 7) return `il y a ${diffD}j`;
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  enrolled: { label: "Non commence", bg: "rgba(148,163,184,0.1)", color: "#64748B" },
  in_progress: { label: "En cours", bg: "rgba(217,119,6,0.08)", color: "#B45309" },
  completed: { label: "Termine", bg: "rgba(5,150,105,0.08)", color: "#047857" },
};

export default function TrainingAnalyticsModal({ isOpen, onClose, training }: TrainingAnalyticsModalProps) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !training) return;
    let cancelled = false;

    const fetchEnrollments = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trainings/${training.id}/enrollments`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erreur lors du chargement");
        }
        const data = await res.json();
        if (!cancelled) {
          setEnrollments(data.enrollments || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Une erreur est survenue");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEnrollments();
    return () => { cancelled = true; };
  }, [isOpen, training]);

  const completedEnrollments = enrollments.filter((e) => e.status === "completed");
  const completionRate = enrollments.length > 0
    ? Math.round((completedEnrollments.length / enrollments.length) * 100)
    : 0;
  const averageScore = completedEnrollments.length > 0
    ? Math.round(
        completedEnrollments.reduce((sum, e) => sum + (e.score ?? 0), 0) / completedEnrollments.length,
      )
    : 0;

  return (
    <AnimatePresence>
      {isOpen && training && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,28,63,0.4)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            fontFamily: "var(--corp-font-body)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 20,
              width: 720,
              maxWidth: "90vw",
              maxHeight: "85vh",
              overflow: "hidden",
              boxShadow: "0 24px 48px -12px rgba(15,28,63,0.2)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "28px 32px 20px",
              borderBottom: "1px solid var(--corp-border-light)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexShrink: 0,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase" as const,
                    letterSpacing: "0.08em",
                    color: "var(--corp-blue)",
                  }}>
                    Analytics
                  </div>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 500,
                    background: "rgba(5,150,105,0.08)",
                    color: "#047857",
                    border: "1px solid rgba(5,150,105,0.2)",
                  }}>
                    <span style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: "#059669",
                      display: "inline-block",
                    }} />
                    Publiee
                  </span>
                </div>
                <h2 style={{
                  fontFamily: "var(--corp-font-heading)",
                  fontSize: 24,
                  fontWeight: 400,
                  color: "var(--corp-navy)",
                  margin: "0 0 6px",
                }}>
                  {training.title}
                </h2>
                <div style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 13,
                  color: "var(--corp-text-muted)",
                  letterSpacing: "0.05em",
                }}>
                  Code : {training.join_code}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Fermer"
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  color: "var(--corp-text-muted)",
                  cursor: "pointer",
                  padding: 4,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  transition: "background 0.15s",
                  flexShrink: 0,
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = "var(--corp-bg-subtle)"; }}
                onMouseOut={(e) => { e.currentTarget.style.background = "none"; }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "24px 32px 32px", overflow: "auto", flex: 1 }}>
              {loading ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "60px 0",
                  gap: 16,
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    border: "3px solid var(--corp-border)",
                    borderTop: "3px solid var(--corp-blue)",
                    borderRadius: "50%",
                    animation: "corp-spinner 0.8s linear infinite",
                  }} />
                  <span style={{ fontSize: 14, color: "var(--corp-text-muted)" }}>
                    Chargement des donnees...
                  </span>
                </div>
              ) : error ? (
                <div style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "rgba(220,38,38,0.04)",
                  border: "1px solid rgba(220,38,38,0.15)",
                  textAlign: "center" as const,
                }}>
                  <p style={{ fontSize: 14, color: "var(--corp-danger)", margin: 0 }}>
                    {error}
                  </p>
                </div>
              ) : enrollments.length === 0 ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "60px 0",
                  gap: 12,
                }}>
                  <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: "var(--corp-bg-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--corp-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" />
                      <path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                  </div>
                  <p style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "var(--corp-navy)",
                    margin: 0,
                  }}>
                    Aucun apprenant inscrit pour le moment
                  </p>
                  <p style={{
                    fontSize: 13,
                    color: "var(--corp-text-muted)",
                    margin: 0,
                  }}>
                    Partagez le code d&apos;acces pour que vos apprenants rejoignent la formation.
                  </p>
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                    marginBottom: 24,
                  }}>
                    {[
                      { label: "Inscrits", value: String(enrollments.length) },
                      { label: "Taux de completion", value: `${completionRate}%` },
                      { label: "Score moyen", value: completedEnrollments.length > 0 ? `${averageScore}/100` : "\u2014" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        style={{
                          background: "var(--corp-bg-subtle)",
                          borderRadius: 12,
                          padding: "16px 20px",
                          textAlign: "center" as const,
                        }}
                      >
                        <div style={{
                          fontSize: 24,
                          fontWeight: 600,
                          color: "var(--corp-navy)",
                          lineHeight: 1,
                          marginBottom: 6,
                          fontFamily: "var(--corp-font-body)",
                        }}>
                          {stat.value}
                        </div>
                        <div style={{
                          fontSize: 12,
                          color: "var(--corp-text-muted)",
                          fontWeight: 500,
                        }}>
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Table */}
                  <div style={{
                    borderRadius: 12,
                    border: "1px solid var(--corp-border)",
                    overflow: "hidden",
                  }}>
                    <table style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}>
                      <thead>
                        <tr style={{
                          background: "var(--corp-bg-subtle)",
                          borderBottom: "1px solid var(--corp-border)",
                        }}>
                          {["Nom", "Statut", "Score", "Progression", "Derniere activite"].map((col) => (
                            <th
                              key={col}
                              style={{
                                padding: "10px 16px",
                                textAlign: "left" as const,
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase" as const,
                                letterSpacing: "0.06em",
                                color: "var(--corp-text-muted)",
                              }}
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {enrollments.map((enrollment, idx) => {
                          const statusCfg = STATUS_LABELS[enrollment.status] || STATUS_LABELS.enrolled;
                          return (
                            <tr
                              key={enrollment.id}
                              style={{
                                borderBottom: idx < enrollments.length - 1 ? "1px solid var(--corp-border-light)" : "none",
                              }}
                            >
                              <td style={{ padding: "12px 16px", color: "var(--corp-navy)", fontWeight: 500 }}>
                                {enrollment.profiles?.full_name || "Apprenant"}
                              </td>
                              <td style={{ padding: "12px 16px" }}>
                                <span style={{
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  fontSize: 12,
                                  fontWeight: 500,
                                  background: statusCfg.bg,
                                  color: statusCfg.color,
                                }}>
                                  {statusCfg.label}
                                </span>
                              </td>
                              <td style={{ padding: "12px 16px", color: "var(--corp-text-secondary)" }}>
                                {enrollment.score !== null ? `${enrollment.score}/100` : "\u2014"}
                              </td>
                              <td style={{ padding: "12px 16px", color: "var(--corp-text-secondary)" }}>
                                {enrollment.correct_answers !== null && enrollment.total_questions
                                  ? `${enrollment.correct_answers}/${enrollment.total_questions} questions`
                                  : "\u2014"}
                              </td>
                              <td style={{ padding: "12px 16px", color: "var(--corp-text-muted)" }}>
                                {formatRelativeDate(enrollment.last_played_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
