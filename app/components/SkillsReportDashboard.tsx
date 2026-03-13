"use client";

import { ManagerAssessment, MultiAgentGameState, SimulationReport } from "@/app/lib/types";

// ============================================
// SVG Radar Chart — Pure SVG, zero dependencies
// ============================================

function RadarChart({ scores }: { scores: Array<{ topic: string; score: number; weight: number }> }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = cx - 55;
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
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((pct) => (
        <path key={pct} d={poly(pct * maxR)} fill="none" stroke="var(--corp-border)" strokeOpacity={0.4} strokeWidth={pct === 1 ? 1 : 0.5} />
      ))}
      {/* Axes */}
      {scores.map((_, i) => {
        const p = pointAt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--corp-border)" strokeOpacity={0.3} strokeWidth={0.5} />;
      })}
      {/* Score polygon */}
      <path d={scorePoly} fill="rgba(37,99,235,0.12)" stroke="var(--corp-blue)" strokeWidth={1.5} />
      {/* Score dots */}
      {scores.map((s, i) => {
        const p = pointAt(i, (s.score / 100) * maxR);
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={5} fill={scoreColor(s.score)} stroke="#fff" strokeWidth={2} filter="url(#dot-shadow)" />
          </g>
        );
      })}
      {/* Labels */}
      {scores.map((s, i) => {
        const p = pointAt(i, maxR + 28);
        return (
          <text key={i} x={p.x} y={p.y} fill="var(--corp-text-secondary)" fontSize={10} fontFamily="'DM Sans', sans-serif" textAnchor="middle" dominantBaseline="middle">
            {s.topic.length > 18 ? s.topic.slice(0, 17) + "\u2026" : s.topic}
          </text>
        );
      })}
      <defs>
        <filter id="dot-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
        </filter>
      </defs>
    </svg>
  );
}

// ============================================
// Score helpers
// ============================================

function scoreColor(score: number): string {
  if (score < 30) return "#DC2626";
  if (score < 50) return "#EA580C";
  if (score < 70) return "#D97706";
  if (score < 85) return "#059669";
  return "#16A34A";
}

function scoreLabel(score: number): string {
  if (score < 30) return "Critique";
  if (score < 50) return "À revoir";
  if (score < 70) return "En progres";
  if (score < 85) return "Acquis";
  return "Excellent";
}

// ============================================
// Auto-generated insights from scores
// ============================================

function generateInsights(scores: Array<{ topic: string; score: number; weight: number }>) {
  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const weakest = sorted.filter((s) => s.score < 60);
  const strongest = sorted.filter((s) => s.score >= 70).reverse();
  const critical = sorted.filter((s) => s.score < 50 && s.weight >= 4);

  return { weakest, strongest, critical };
}

// ============================================
// Reusable card style
// ============================================

const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "#fff",
  borderRadius: "var(--corp-radius-lg)",
  boxShadow: "var(--corp-shadow-md)",
  padding: 24,
  ...extra,
});

const cardSm = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "#fff",
  borderRadius: "var(--corp-radius-lg)",
  boxShadow: "var(--corp-shadow-sm)",
  padding: 20,
  ...extra,
});

// ============================================
// Component
// ============================================

interface SkillsReportDashboardProps {
  assessments: ManagerAssessment[];
  report: SimulationReport | null;
  documentFilename: string | null;
  onRestart: () => void;
  multiAgentState?: MultiAgentGameState | null;
}

export default function SkillsReportDashboard({
  assessments,
  report,
  documentFilename,
  onRestart,
  multiAgentState,
}: SkillsReportDashboardProps) {
  const useMultiAgent = !!multiAgentState && multiAgentState.scores.length > 0;
  const scores = useMultiAgent ? multiAgentState.scores : [];
  const totalScore = useMultiAgent
    ? multiAgentState.totalScore
    : report
      ? report.globalWeightedScore
      : assessments.reduce((acc, a) => acc + a.playerScoreChange, 0);

  const { weakest, strongest, critical } = generateInsights(scores);

  const topGaps = report?.topCriticalGaps ?? [];
  const recommendations = report?.recommendations ?? [];
  const trackedSkills = report?.skills ?? [];
  const managerNotes = assessments
    .map((a) => a.managerNote)
    .filter((note) => note && note.trim().length > 0)
    .slice(-10)
    .reverse();

  const scenarioTitle = useMultiAgent ? multiAgentState.scenario.title : null;
  const actsCompleted = useMultiAgent ? multiAgentState.currentAct : 0;
  const totalActs = useMultiAgent ? multiAgentState.scenario.acts.length : 0;
  const executiveSummary = report?.executiveSummary || "";
  const actionPlan7Days = report?.actionablePlan7Days || [];
  const failurePatterns = report?.failurePatternAnalysis || [];
  const employeeVibe = report?.employeeVibe;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--corp-bg-subtle)",
        color: "var(--corp-text)",
        fontFamily: "var(--corp-font-body)",
        padding: "40px 24px",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 32 }}>
          <div>
            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--corp-blue)",
              marginBottom: 10,
            }}>
              Rapport d&apos;evaluation
            </p>
            <h1 style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 40,
              color: "var(--corp-navy)",
              lineHeight: 1.1,
              margin: 0,
              fontWeight: 400,
            }}>
              Rapport de competences
            </h1>
            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 14,
              color: "var(--corp-text-secondary)",
              marginTop: 10,
            }}>
              {scenarioTitle || documentFilename || "Simulation de formation"}
              {useMultiAgent && ` · Acte ${actsCompleted}/${totalActs}`}
              {` · ${scores.length || trackedSkills.length || assessments.length} competences`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => window.print()}
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
                background: "var(--corp-blue)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--corp-radius-md)",
                boxShadow: "var(--corp-shadow-md)",
                cursor: "pointer",
              }}
            >
              Exporter PDF
            </button>
            <button
              onClick={onRestart}
              style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
                background: "transparent",
                color: "var(--corp-navy)",
                border: "1px solid var(--corp-border)",
                borderRadius: "var(--corp-radius-md)",
                cursor: "pointer",
              }}
            >
              Nouvelle simulation
            </button>
          </div>
        </div>

        {/* ── KPI CARDS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div style={{
            ...card(),
            borderTop: `3px solid ${scoreColor(totalScore)}`,
          }}>
            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--corp-text-muted)",
              marginBottom: 8,
            }}>
              Score global
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 48,
                fontWeight: 700,
                color: scoreColor(totalScore),
                lineHeight: 1,
              }}>
                {totalScore}
              </span>
              <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text-muted)" }}>/100</span>
            </div>
            <div style={{
              display: "inline-flex",
              marginTop: 8,
              padding: "4px 12px",
              borderRadius: 100,
              background: `${scoreColor(totalScore)}15`,
              fontSize: 12,
              fontWeight: 600,
              color: scoreColor(totalScore),
            }}>
              {scoreLabel(totalScore)}
            </div>
          </div>

          <div style={{
            ...card(),
            borderTop: "3px solid #DC2626",
          }}>
            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--corp-text-muted)",
              marginBottom: 8,
            }}>
              Lacunes critiques
            </p>
            <span style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 48,
              fontWeight: 700,
              color: (useMultiAgent ? critical.length : topGaps.length) > 0 ? "#DC2626" : "var(--corp-text-muted)",
              lineHeight: 1,
            }}>
              {useMultiAgent ? critical.length : topGaps.length}
            </span>
          </div>

          <div style={{
            ...card(),
            borderTop: "3px solid #16A34A",
          }}>
            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--corp-text-muted)",
              marginBottom: 8,
            }}>
              Points forts
            </p>
            <span style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 48,
              fontWeight: 700,
              color: (useMultiAgent ? strongest.length : recommendations.length) > 0 ? "#16A34A" : "var(--corp-text-muted)",
              lineHeight: 1,
            }}>
              {useMultiAgent ? strongest.length : recommendations.length}
            </span>
          </div>

          {useMultiAgent && (
            <div style={{
              ...card(),
              borderTop: "3px solid var(--corp-blue)",
            }}>
              <p style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--corp-text-muted)",
                marginBottom: 8,
              }}>
                Echanges
              </p>
              <span style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 48,
                fontWeight: 700,
                color: "var(--corp-blue)",
                lineHeight: 1,
              }}>
                {multiAgentState.conversationHistory.filter((m) => m.role === "user").length}
              </span>
            </div>
          )}
        </div>

        {/* ── RADAR + SCORE TABLE ── */}
        {useMultiAgent && scores.length >= 3 && (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, marginBottom: 24 }}>

            {/* Radar Chart */}
            <div style={{
              ...card(),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <RadarChart scores={scores} />
            </div>

            {/* Score Breakdown Table */}
            <div style={card()}>
              <p style={{
                fontFamily: "var(--corp-font-body)",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--corp-text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}>
                Matrice des competences
              </p>

              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 50px 100px",
                gap: 8,
                marginBottom: 8,
                paddingBottom: 8,
                borderBottom: "1px solid var(--corp-border)",
              }}>
                <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 600, color: "var(--corp-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Competence</span>
                <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 600, color: "var(--corp-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center" }}>Score</span>
                <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 600, color: "var(--corp-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center" }}>Poids</span>
                <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 600, color: "var(--corp-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Niveau</span>
              </div>

              {/* Rows */}
              {[...scores].sort((a, b) => b.weight * b.score - a.weight * a.score).map((s) => (
                <div
                  key={s.topic}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 50px 100px",
                    gap: 8,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--corp-border-light, var(--corp-border))",
                    alignItems: "center",
                  }}
                >
                  <span style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 13,
                    color: "var(--corp-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {s.topic}
                  </span>
                  <div style={{ textAlign: "center" }}>
                    <span style={{
                      fontFamily: "var(--corp-font-body)",
                      fontSize: 18,
                      fontWeight: 700,
                      color: scoreColor(s.score),
                    }}>
                      {s.score}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} style={{
                        width: 4,
                        height: 12,
                        borderRadius: 2,
                        background: i < s.weight ? "var(--corp-blue)" : "var(--corp-border)",
                      }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: "var(--corp-bg-subtle)", borderRadius: 3, position: "relative", overflow: "hidden" }}>
                      <div style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${s.score}%`,
                        borderRadius: 3,
                        background: `linear-gradient(90deg, ${scoreColor(s.score)}cc, ${scoreColor(s.score)})`,
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── EXECUTIVE SUMMARY ── */}
        {executiveSummary && (
          <section style={{
            ...cardSm(),
            borderLeft: "4px solid var(--corp-blue)",
            marginBottom: 20,
          }}>
            <h2 style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 20,
              color: "var(--corp-navy)",
              margin: "0 0 10px",
              fontWeight: 400,
            }}>
              Synthese executive
            </h2>
            <p style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 14,
              color: "var(--corp-text)",
              lineHeight: 1.8,
              margin: 0,
            }}>
              {executiveSummary}
            </p>
          </section>
        )}

        {/* ── FAILURE PATTERNS + EMPLOYEE VIBE ── */}
        {(failurePatterns.length > 0 || employeeVibe) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

            {/* Failure Pattern Analysis */}
            <section style={{
              ...cardSm(),
              borderLeft: "4px solid #EA580C",
            }}>
              <h2 style={{
                fontFamily: "var(--corp-font-heading)",
                fontSize: 20,
                color: "var(--corp-navy)",
                margin: "0 0 12px",
                fontWeight: 400,
              }}>
                Patterns d&apos;erreur detectes
              </h2>
              {failurePatterns.length === 0 ? (
                <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-muted)" }}>Aucun pattern recurrent identifie.</p>
              ) : (
                failurePatterns.map((fp, idx) => (
                  <div key={`fp-${idx}`} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--corp-border-light, var(--corp-border))" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text)", fontWeight: 600 }}>
                        {fp.pattern}
                      </span>
                      <span style={{
                        fontFamily: "var(--corp-font-body)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#EA580C",
                        background: "rgba(234,88,12,0.1)",
                        padding: "2px 10px",
                        borderRadius: 100,
                      }}>
                        x{fp.frequency}
                      </span>
                    </div>
                    {fp.affectedSkills.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                        {fp.affectedSkills.map((skill) => (
                          <span key={skill} style={{
                            fontFamily: "var(--corp-font-body)",
                            fontSize: 11,
                            color: "#EA580C",
                            border: "1px solid rgba(234,88,12,0.25)",
                            borderRadius: 6,
                            padding: "2px 8px",
                          }}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    {fp.recommendation && (
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-secondary)", margin: 0, lineHeight: 1.6 }}>
                        {fp.recommendation}
                      </p>
                    )}
                  </div>
                ))
              )}
            </section>

            {/* Employee Vibe */}
            <section style={{
              ...cardSm(),
              borderLeft: "4px solid #0D9488",
            }}>
              <h2 style={{
                fontFamily: "var(--corp-font-heading)",
                fontSize: 20,
                color: "var(--corp-navy)",
                margin: "0 0 12px",
                fontWeight: 400,
              }}>
                Vibe de l&apos;employe
              </h2>
              {employeeVibe ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 500, color: "var(--corp-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                        Ton general
                      </p>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "#0D9488", fontWeight: 600, margin: 0 }}>
                        {employeeVibe.tone}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 11, fontWeight: 500, color: "var(--corp-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                        Resistance au stress
                      </p>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "#0D9488", fontWeight: 600, margin: 0 }}>
                        {employeeVibe.stressResilience}
                      </p>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--corp-border-light, var(--corp-border))", paddingTop: 10, marginBottom: 12 }}>
                    <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text)", lineHeight: 1.7, margin: 0 }}>
                      {employeeVibe.overallAssessment}
                    </p>
                  </div>
                  {employeeVibe.details.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {employeeVibe.details.map((detail, idx) => (
                        <div key={`vibe-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#0D9488", marginTop: 7, flexShrink: 0 }} />
                          <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                            {detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-muted)" }}>Analyse non disponible.</p>
              )}
            </section>
          </div>
        )}

        {/* ── AUTO-ANALYSIS ── */}
        {useMultiAgent && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

            {/* Weaknesses */}
            <section style={{
              ...cardSm(),
              borderLeft: "4px solid #DC2626",
            }}>
              <h2 style={{
                fontFamily: "var(--corp-font-heading)",
                fontSize: 20,
                color: "var(--corp-navy)",
                margin: "0 0 12px",
                fontWeight: 400,
              }}>
                Lacunes identifiees
              </h2>
              {weakest.length === 0 ? (
                <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-muted)" }}>Aucune lacune majeure detectee.</p>
              ) : (
                weakest.map((s) => (
                  <div key={s.topic} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--corp-border-light, var(--corp-border))" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text)" }}>{s.topic}</span>
                      <span style={{
                        fontFamily: "var(--corp-font-body)",
                        fontSize: 14,
                        fontWeight: 700,
                        color: scoreColor(s.score),
                      }}>{s.score}/100</span>
                    </div>
                    <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "var(--corp-text-secondary)", marginTop: 4 }}>
                      Poids {s.weight}/5 · {s.weight >= 4 ? "Competence critique — formation prioritaire recommandee" : "Axe d'amelioration identifie"}
                    </p>
                  </div>
                ))
              )}
            </section>

            {/* Strengths */}
            <section style={{
              ...cardSm(),
              borderLeft: "4px solid #16A34A",
            }}>
              <h2 style={{
                fontFamily: "var(--corp-font-heading)",
                fontSize: 20,
                color: "var(--corp-navy)",
                margin: "0 0 12px",
                fontWeight: 400,
              }}>
                Points forts confirmes
              </h2>
              {strongest.length === 0 ? (
                <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-muted)" }}>Aucun point fort marque sur cette session.</p>
              ) : (
                strongest.map((s) => (
                  <div key={s.topic} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--corp-border-light, var(--corp-border))" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text)" }}>{s.topic}</span>
                      <span style={{
                        fontFamily: "var(--corp-font-body)",
                        fontSize: 14,
                        fontWeight: 700,
                        color: scoreColor(s.score),
                      }}>{s.score}/100</span>
                    </div>
                    <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "var(--corp-text-secondary)", marginTop: 4 }}>
                      Poids {s.weight}/5 · Maitrise confirmee en situation reelle
                    </p>
                  </div>
                ))
              )}
            </section>
          </div>
        )}

        {/* ── LEGACY SECTIONS (fallback when no multi-agent data) ── */}
        {!useMultiAgent && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 16, marginBottom: 16 }}>
              <section style={{
                ...cardSm(),
                borderLeft: "4px solid #DC2626",
              }}>
                <h2 style={{
                  fontFamily: "var(--corp-font-heading)",
                  fontSize: 20,
                  color: "var(--corp-navy)",
                  margin: "0 0 12px",
                  fontWeight: 400,
                }}>
                  Top 3 lacunes critiques
                </h2>
                {topGaps.length === 0 ? (
                  <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-muted)" }}>Aucune lacune critique disponible.</p>
                ) : (
                  topGaps.map((gap) => (
                    <article key={gap.skillId} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--corp-border-light, var(--corp-border))" }}>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text)", margin: 0, fontWeight: 500 }}>
                        {gap.skillName} · criticite {gap.criticality}
                      </p>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "var(--corp-text-secondary)", marginTop: 4 }}>
                        Mastery {gap.masteryScore}/100 · Confidence {(gap.confidence * 100).toFixed(0)}%
                      </p>
                    </article>
                  ))
                )}
              </section>

              <section style={{
                ...cardSm(),
                borderLeft: "4px solid #16A34A",
              }}>
                <h2 style={{
                  fontFamily: "var(--corp-font-heading)",
                  fontSize: 20,
                  color: "var(--corp-navy)",
                  margin: "0 0 12px",
                  fontWeight: 400,
                }}>
                  Recommandations formation
                </h2>
                {recommendations.length === 0 ? (
                  <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 13, color: "var(--corp-text-muted)" }}>Pas de recommandation prioritaire.</p>
                ) : (
                  recommendations.map((reco) => (
                    <article key={reco.skillId} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--corp-border-light, var(--corp-border))" }}>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text)", margin: 0, fontWeight: 500 }}>
                        {reco.skillName} · priorite {reco.priority}
                      </p>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "var(--corp-text-secondary)", marginTop: 4 }}>{reco.recommendation}</p>
                    </article>
                  ))
                )}
              </section>
            </div>

            {trackedSkills.length > 0 && (
              <section style={{
                ...card(),
                marginBottom: 16,
              }}>
                <h2 style={{
                  fontFamily: "var(--corp-font-heading)",
                  fontSize: 20,
                  color: "var(--corp-navy)",
                  margin: "0 0 12px",
                  fontWeight: 400,
                }}>
                  Matrice des competences (audit)
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                  {trackedSkills.map((skill) => (
                    <article key={skill.id} style={{
                      border: "1px solid var(--corp-border)",
                      borderRadius: "var(--corp-radius-sm)",
                      padding: 14,
                      background: "var(--corp-bg-subtle)",
                    }}>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text)", margin: 0, fontWeight: 500 }}>
                        {skill.name} ({skill.criticality})
                      </p>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "var(--corp-text-secondary)", marginTop: 4 }}>{skill.description}</p>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 12, color: "var(--corp-text-secondary)", marginTop: 4 }}>
                        Mastery {skill.masteryScore}/100 · Confidence {(skill.confidence * 100).toFixed(0)}% · Attempts {skill.attempts}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {managerNotes.length > 0 && (
              <section style={{
                ...card(),
                marginBottom: 16,
              }}>
                <h2 style={{
                  fontFamily: "var(--corp-font-heading)",
                  fontSize: 20,
                  color: "var(--corp-navy)",
                  margin: "0 0 12px",
                  fontWeight: 400,
                }}>
                  Notes manager
                </h2>
                <div style={{ display: "grid", gap: 10 }}>
                  {managerNotes.map((note, index) => (
                    <div key={`${index}-${note.slice(0, 20)}`} style={{ borderLeft: "3px solid var(--corp-blue)", paddingLeft: 14 }}>
                      <p style={{ fontFamily: "var(--corp-font-body)", fontSize: 14, color: "var(--corp-text)", margin: 0, lineHeight: 1.6 }}>{note}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── ACTION PLAN ── */}
        {actionPlan7Days.length > 0 && (
          <section style={{
            ...card(),
            marginBottom: 20,
          }}>
            <h2 style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 20,
              color: "var(--corp-navy)",
              margin: "0 0 14px",
              fontWeight: 400,
            }}>
              Plan de remediation immediat
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {actionPlan7Days.slice(0, 3).map((item, idx) => (
                <div key={`${idx}-${item.slice(0, 12)}`} style={{
                  background: "var(--corp-bg-subtle)",
                  borderLeft: "3px solid var(--corp-blue)",
                  borderRadius: "var(--corp-radius-sm)",
                  boxShadow: "var(--corp-shadow-sm)",
                  padding: "14px 16px",
                }}>
                  <p style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--corp-blue)",
                    margin: "0 0 6px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}>
                    Action {idx + 1}
                  </p>
                  <p style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 14,
                    color: "var(--corp-text)",
                    margin: 0,
                    lineHeight: 1.6,
                  }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── FOOTER ── */}
        <div style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: "1px solid var(--corp-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <p style={{
            fontFamily: "var(--corp-font-body)",
            fontSize: 12,
            color: "var(--corp-text-muted)",
          }}>
            Genere par YouGotIt
          </p>
          <p style={{
            fontFamily: "var(--corp-font-body)",
            fontSize: 12,
            color: "var(--corp-text-muted)",
          }}>
            {new Date().toLocaleString("fr-FR")}
          </p>
        </div>
      </div>
    </div>
  );
}
