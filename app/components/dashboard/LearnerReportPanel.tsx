"use client";

import { useEffect, useRef, useState } from "react";
import type { MultiAgentGameState } from "@/app/lib/types";

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function scoreColor(score: number): string {
  if (score < 30) return "#DC2626";
  if (score < 50) return "#EA580C";
  if (score < 70) return "#D97706";
  if (score < 85) return "#059669";
  return "#16A34A";
}

function scoreLabel(score: number): string {
  if (score < 30) return "Critique";
  if (score < 50) return "\u00C0 revoir";
  if (score < 70) return "En progr\u00E8s";
  if (score < 85) return "Acquis";
  return "Excellent";
}

// ─── Radar Chart (pure SVG) ──────────────────────────────────────────────────

function RadarChart({ scores }: { scores: Array<{ topic: string; score: number }> }) {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = cx - 50;
  const n = scores.length;
  if (n < 3) return null;

  const step = (2 * Math.PI) / n;
  const pointAt = (i: number, r: number) => {
    const a = -Math.PI / 2 + i * step;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const poly = (radius: number) =>
    scores.map((_, i) => pointAt(i, radius)).map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + "Z";
  const scorePoly = scores
    .map((s, i) => pointAt(i, (s.score / 100) * maxR))
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ") + "Z";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Radar des competences" style={{ width: "100%", maxWidth: size, height: "auto" }}>
      {[0.25, 0.5, 0.75, 1].map((pct) => (
        <path key={pct} d={poly(pct * maxR)} fill="none" stroke="var(--corp-border)" strokeOpacity={0.4} strokeWidth={pct === 1 ? 1 : 0.5} />
      ))}
      {scores.map((_, i) => {
        const p = pointAt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--corp-border)" strokeOpacity={0.3} strokeWidth={0.5} />;
      })}
      <path d={scorePoly} fill="rgba(37,99,235,0.12)" stroke="var(--corp-blue)" strokeWidth={1.5} />
      {scores.map((s, i) => {
        const p = pointAt(i, (s.score / 100) * maxR);
        return <circle key={i} cx={p.x} cy={p.y} r={4} fill={scoreColor(s.score)} stroke="#fff" strokeWidth={1.5} />;
      })}
      {scores.map((s, i) => {
        const p = pointAt(i, maxR + 24);
        return (
          <text key={i} x={p.x} y={p.y} fill="var(--corp-text-secondary)" fontSize={9} fontFamily="'DM Sans', sans-serif" textAnchor="middle" dominantBaseline="middle">
            {s.topic.length > 16 ? s.topic.slice(0, 15) + "\u2026" : s.topic}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface LearnerReportPanelProps {
  enrollmentId: string;
  learnerName: string;
  onBack: () => void;
}

export default function LearnerReportPanel({ enrollmentId, learnerName, onBack }: LearnerReportPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<MultiAgentGameState | null>(null);
  const [enrollmentData, setEnrollmentData] = useState<{
    score: number | null;
    total_questions: number | null;
    correct_answers: number | null;
    status: string;
  } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/enrollments/${enrollmentId}/detail`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erreur lors du chargement");
        }
        const { enrollment } = await res.json();
        if (cancelled) return;
        setGameState(enrollment.game_state as MultiAgentGameState | null);
        setEnrollmentData({
          score: enrollment.score,
          total_questions: enrollment.total_questions,
          correct_answers: enrollment.correct_answers,
          status: enrollment.status,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Une erreur est survenue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enrollmentId]);

  const handleExportPdf = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Rapport - ${escapeHtml(learnerName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'DM Sans', 'Segoe UI', sans-serif; color: #0F1C3F; padding: 40px; background: #fff; }
    .report-header { margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #E2E8F0; }
    .report-header h1 { font-size: 24px; font-weight: 600; }
    .report-header p { font-size: 13px; color: #64748B; margin-top: 4px; }
    .kpi-row { display: flex; gap: 16px; margin-bottom: 24px; }
    .kpi-card { flex: 1; padding: 16px; border: 1px solid #E2E8F0; border-radius: 8px; text-align: center; }
    .kpi-value { font-size: 32px; font-weight: 700; line-height: 1; }
    .kpi-label { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 6px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #64748B; margin-bottom: 12px; }
    .score-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F1F5F9; }
    .score-topic { font-size: 13px; }
    .score-value { font-size: 16px; font-weight: 700; }
    .score-bar-wrap { width: 80px; height: 6px; background: #F1F5F9; border-radius: 3px; overflow: hidden; margin-left: 12px; }
    .score-bar { height: 100%; border-radius: 3px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .insight-item { padding: 8px 0; border-bottom: 1px solid #F1F5F9; }
    .insight-topic { font-size: 13px; font-weight: 500; }
    .insight-detail { font-size: 12px; color: #64748B; margin-top: 2px; }
    svg { max-width: 280px; margin: 0 auto; display: block; }
    .radar-section { text-align: center; margin-bottom: 24px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; display: flex; justify-content: space-between; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  ${printContent}
</body>
</html>`);
    win.document.close();
    // Small delay to let styles render before print dialog
    setTimeout(() => { win.print(); }, 300);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16 }}>
        <div style={{ width: 36, height: 36, border: "3px solid var(--corp-border)", borderTop: "3px solid var(--corp-blue)", borderRadius: "50%", animation: "corp-spinner 0.8s linear infinite" }} />
        <span style={{ fontSize: 14, color: "var(--corp-text-muted)" }}>Chargement du rapport...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "var(--corp-danger)", marginBottom: 16 }}>{error}</p>
        <button onClick={onBack} style={{ fontSize: 13, fontWeight: 600, color: "var(--corp-blue)", background: "none", border: "none", cursor: "pointer" }}>
          Retour
        </button>
      </div>
    );
  }

  const scores = gameState?.scores || [];
  const totalScore = gameState?.totalScore ?? enrollmentData?.score ?? 0;
  const totalQuestions = enrollmentData?.total_questions ?? 0;
  const correctAnswers = enrollmentData?.correct_answers ?? 0;
  const completedQAs = gameState?.interactionState?.completedQAs?.length ?? correctAnswers;
  const failedQAs = gameState?.interactionState?.failedQAs?.length ?? 0;

  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const weaknesses = sorted.filter((s) => s.score < 60);
  const strengths = sorted.filter((s) => s.score >= 70).reverse();

  const hasScores = scores.length > 0;

  return (
    <>
      {/* Action bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 600, color: "var(--corp-text-secondary)",
            background: "none", border: "none", cursor: "pointer",
            padding: "6px 0",
          }}
          onMouseOver={(e) => { e.currentTarget.style.color = "var(--corp-blue)"; }}
          onMouseOut={(e) => { e.currentTarget.style.color = "var(--corp-text-secondary)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Retour \u00e0 la liste
        </button>
        {hasScores && (
          <button
            onClick={handleExportPdf}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 600, color: "#fff",
              background: "var(--corp-blue)", border: "none",
              borderRadius: "var(--corp-radius-sm)", padding: "8px 16px",
              cursor: "pointer", boxShadow: "var(--corp-shadow-sm)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Exporter PDF
          </button>
        )}
      </div>

      {/* Print-ready content */}
      <div ref={printRef}>
        {/* Header */}
        <div className="report-header" style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--corp-border)" }}>
          <h1 style={{ fontFamily: "var(--corp-font-heading)", fontSize: 22, fontWeight: 400, color: "var(--corp-navy)", margin: 0 }}>
            {learnerName}
          </h1>
          <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-muted)", marginTop: 4 }}>
            {gameState?.scenario?.title || "Formation"} · {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* KPIs */}
        <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: hasScores ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          <div className="kpi-card" style={{ background: "var(--corp-bg-subtle)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
            <div className="kpi-value" style={{ fontSize: 28, fontWeight: 700, color: scoreColor(totalScore), lineHeight: 1 }}>
              {totalScore}
            </div>
            <div className="kpi-label" style={{ fontSize: 11, color: "var(--corp-text-muted)", marginTop: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Score global
            </div>
          </div>
          <div className="kpi-card" style={{ background: "var(--corp-bg-subtle)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
            <div className="kpi-value" style={{ fontSize: 28, fontWeight: 700, color: "var(--corp-navy)", lineHeight: 1 }}>
              {correctAnswers}/{totalQuestions}
            </div>
            <div className="kpi-label" style={{ fontSize: 11, color: "var(--corp-text-muted)", marginTop: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Bonnes r\u00e9ponses
            </div>
          </div>
          {hasScores && (
            <div className="kpi-card" style={{ background: "var(--corp-bg-subtle)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
              <div className="kpi-value" style={{ fontSize: 28, fontWeight: 700, color: weaknesses.length > 0 ? "#DC2626" : "var(--corp-text-muted)", lineHeight: 1 }}>
                {weaknesses.length}
              </div>
              <div className="kpi-label" style={{ fontSize: 11, color: "var(--corp-text-muted)", marginTop: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Lacunes
              </div>
            </div>
          )}
          <div className="kpi-card" style={{ background: "var(--corp-bg-subtle)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
            <div className="kpi-value" style={{ fontSize: 28, fontWeight: 700, color: strengths.length > 0 ? "#16A34A" : "var(--corp-text-muted)", lineHeight: 1 }}>
              {hasScores ? strengths.length : completedQAs}
            </div>
            <div className="kpi-label" style={{ fontSize: 11, color: "var(--corp-text-muted)", marginTop: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {hasScores ? "Points forts" : "QA r\u00e9ussis"}
            </div>
          </div>
        </div>

        {hasScores ? (
          <>
            {/* Radar + Score Table */}
            <div style={{ display: "grid", gridTemplateColumns: scores.length >= 3 ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 20 }}>
              {scores.length >= 3 && (
                <div className="radar-section" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <RadarChart scores={scores} />
                </div>
              )}

              {/* Score breakdown */}
              <div className="section">
                <div className="section-title" style={{ fontSize: 11, fontWeight: 600, color: "var(--corp-text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  D\u00e9tail par comp\u00e9tence
                </div>
                {[...scores].sort((a, b) => b.score - a.score).map((s) => (
                  <div className="score-row" key={s.topic} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--corp-border-light, #F1F5F9)" }}>
                    <span className="score-topic" style={{ flex: 1, fontSize: 13, color: "var(--corp-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.topic}
                    </span>
                    <span className="badge" style={{
                      padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: `${scoreColor(s.score)}15`, color: scoreColor(s.score),
                      marginRight: 8, flexShrink: 0,
                    }}>
                      {scoreLabel(s.score)}
                    </span>
                    <span className="score-value" style={{ fontSize: 16, fontWeight: 700, color: scoreColor(s.score), width: 36, textAlign: "right", flexShrink: 0 }}>
                      {s.score}
                    </span>
                    <div className="score-bar-wrap" style={{ width: 60, height: 5, background: "var(--corp-bg-subtle, #F1F5F9)", borderRadius: 3, overflow: "hidden", marginLeft: 10, flexShrink: 0 }}>
                      <div className="score-bar" style={{ height: "100%", width: `${s.score}%`, borderRadius: 3, background: scoreColor(s.score) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths & Weaknesses */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {/* Weaknesses */}
              <div className="section" style={{ background: "rgba(220,38,38,0.03)", borderRadius: 10, padding: 14, borderLeft: "3px solid #DC2626" }}>
                <div className="section-title" style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Axes d&apos;am\u00e9lioration
                </div>
                {weaknesses.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--corp-text-muted)" }}>Aucune lacune majeure</p>
                ) : (
                  weaknesses.map((s) => (
                    <div className="insight-item" key={s.topic} style={{ padding: "6px 0", borderBottom: "1px solid rgba(220,38,38,0.08)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span className="insight-topic" style={{ fontSize: 13, fontWeight: 500, color: "var(--corp-text)" }}>{s.topic}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(s.score) }}>{s.score}/100</span>
                      </div>
                      <p className="insight-detail" style={{ fontSize: 12, color: "var(--corp-text-muted)", marginTop: 2 }}>
                        {s.score < 30 ? "Formation prioritaire recommand\u00e9e" : "Renforcement conseill\u00e9"}
                        {s.weight >= 4 ? " \u00b7 Comp\u00e9tence critique" : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Strengths */}
              <div className="section" style={{ background: "rgba(22,163,74,0.03)", borderRadius: 10, padding: 14, borderLeft: "3px solid #16A34A" }}>
                <div className="section-title" style={{ fontSize: 11, fontWeight: 600, color: "#16A34A", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Points forts confirm\u00e9s
                </div>
                {strengths.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--corp-text-muted)" }}>Aucun point fort marqu\u00e9</p>
                ) : (
                  strengths.map((s) => (
                    <div className="insight-item" key={s.topic} style={{ padding: "6px 0", borderBottom: "1px solid rgba(22,163,74,0.08)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span className="insight-topic" style={{ fontSize: 13, fontWeight: 500, color: "var(--corp-text)" }}>{s.topic}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(s.score) }}>{s.score}/100</span>
                      </div>
                      <p className="insight-detail" style={{ fontSize: 12, color: "var(--corp-text-muted)", marginTop: 2 }}>
                        Ma\u00eetrise confirm\u00e9e en situation
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Q&A Summary */}
            {(completedQAs > 0 || failedQAs > 0) && (
              <div className="section" style={{ background: "var(--corp-bg-subtle)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div className="section-title" style={{ fontSize: 11, fontWeight: 600, color: "var(--corp-text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Parcours d&apos;\u00e9valuation
                </div>
                <div style={{ display: "flex", gap: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A" }} />
                    <span style={{ fontSize: 13, color: "var(--corp-text)" }}>{completedQAs} question{completedQAs > 1 ? "s" : ""} r\u00e9ussie{completedQAs > 1 ? "s" : ""}</span>
                  </div>
                  {failedQAs > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626" }} />
                      <span style={{ fontSize: 13, color: "var(--corp-text)" }}>{failedQAs} question{failedQAs > 1 ? "s" : ""} \u00e9chou\u00e9e{failedQAs > 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          /* No game_state scores — show basic info */
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--corp-bg-subtle)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--corp-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
              </svg>
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--corp-navy)", marginBottom: 4 }}>
              Rapport d\u00e9taill\u00e9 non disponible
            </p>
            <p style={{ fontSize: 13, color: "var(--corp-text-muted)" }}>
              L&apos;apprenant n&apos;a pas encore termin\u00e9 la formation ou les donn\u00e9es d\u00e9taill\u00e9es ne sont pas disponibles.
            </p>
          </div>
        )}

        {/* Footer (for PDF) */}
        <div className="footer" style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--corp-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--corp-text-muted)" }}>G\u00e9n\u00e9r\u00e9 par YouGotIt</span>
          <span style={{ fontSize: 11, color: "var(--corp-text-muted)" }}>{new Date().toLocaleDateString("fr-FR")}</span>
        </div>
      </div>
    </>
  );
}
