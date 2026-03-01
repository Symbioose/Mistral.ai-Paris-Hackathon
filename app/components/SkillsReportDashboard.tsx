"use client";

import { ManagerAssessment, MultiAgentGameState, SimulationReport } from "@/app/lib/types";

// ============================================
// SVG Radar Chart — Pure SVG, zero dependencies
// ============================================

function RadarChart({ scores }: { scores: Array<{ topic: string; score: number; weight: number }> }) {
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

  const scoreColor = (score: number) => {
    if (score < 30) return "#CC2A2A";
    if (score < 50) return "#D9754A";
    if (score < 70) return "#D9A84A";
    if (score < 85) return "#7AB648";
    return "#2D9A48";
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((pct) => (
        <path key={pct} d={poly(pct * maxR)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={pct === 1 ? 1 : 0.5} />
      ))}
      {/* Axes */}
      {scores.map((_, i) => {
        const p = pointAt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />;
      })}
      {/* Score polygon */}
      <path d={scorePoly} fill="rgba(74,144,217,0.18)" stroke="#4A90D9" strokeWidth={1.5} />
      {/* Score dots */}
      {scores.map((s, i) => {
        const p = pointAt(i, (s.score / 100) * maxR);
        return <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={scoreColor(s.score)} stroke="#000" strokeWidth={0.5} />;
      })}
      {/* Labels */}
      {scores.map((s, i) => {
        const p = pointAt(i, maxR + 24);
        return (
          <text key={i} x={p.x} y={p.y} fill="#C4C0B5" fontSize={8} fontFamily="'Space Mono', monospace" textAnchor="middle" dominantBaseline="middle">
            {s.topic.length > 18 ? s.topic.slice(0, 17) + "\u2026" : s.topic}
          </text>
        );
      })}
    </svg>
  );
}

// ============================================
// Score helpers
// ============================================

function scoreColor(score: number): string {
  if (score < 30) return "#CC2A2A";
  if (score < 50) return "#D9754A";
  if (score < 70) return "#D9A84A";
  if (score < 85) return "#7AB648";
  return "#2D9A48";
}

function scoreLabel(score: number): string {
  if (score < 30) return "Critique";
  if (score < 50) return "Insuffisant";
  if (score < 70) return "Moyen";
  if (score < 85) return "Bien";
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
  // Multi-agent mode: use live game scores
  const useMultiAgent = !!multiAgentState && multiAgentState.scores.length > 0;
  const scores = useMultiAgent ? multiAgentState.scores : [];
  const totalScore = useMultiAgent
    ? multiAgentState.totalScore
    : report
      ? report.globalWeightedScore
      : assessments.reduce((acc, a) => acc + a.playerScoreChange, 0);

  const { weakest, strongest, critical } = generateInsights(scores);

  // Legacy mode data
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
  const decisionTrace = report?.decisionTrace || [];
  const failurePatterns = report?.failurePatternAnalysis || [];
  const employeeVibe = report?.employeeVibe;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 40%, #0a0a0f 100%)",
        color: "#F3F0E6",
        padding: "28px 20px",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4A90D9", marginBottom: 8 }}>
              Rapport d&apos;evaluation · Manager-Ready
            </p>
            <h1 style={{ fontFamily: "'VT323', monospace", fontSize: 54, color: "#F3F0E6", lineHeight: 0.92, margin: 0 }}>
              SKILL GAP REPORT
            </h1>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8E8B82", marginTop: 10 }}>
              {scenarioTitle || documentFilename || "Simulation de formation"}
              {useMultiAgent && ` · Acte ${actsCompleted}/${totalActs}`}
              {` · ${scores.length || trackedSkills.length || assessments.length} competences`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => window.print()}
              style={{
                fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px 16px",
                background: "#4A90D9", color: "#F3F0E6", border: "2px solid #4A90D9",
                boxShadow: "3px 3px 0 #2A5A8A", cursor: "pointer",
              }}
            >
              Exporter PDF
            </button>
            <button
              onClick={onRestart}
              style={{
                fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px 16px",
                background: "transparent", color: "#F3F0E6", border: "2px solid rgba(255,255,255,0.25)",
                cursor: "pointer",
              }}
            >
              Nouvelle simulation
            </button>
          </div>
        </div>

        {/* ── KPI CARDS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 18 }}>
          <div style={{ border: "2px solid " + scoreColor(totalScore), background: `${scoreColor(totalScore)}10`, padding: 14 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#8E8B82", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              Score global
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 52, color: scoreColor(totalScore), lineHeight: 1 }}>
                {totalScore}
              </span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8E8B82" }}>/100</span>
            </div>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, fontWeight: 700, color: scoreColor(totalScore), marginTop: 4, letterSpacing: "0.1em" }}>
              {scoreLabel(totalScore).toUpperCase()}
            </p>
          </div>

          <div style={{ border: "2px solid rgba(204,42,42,0.4)", background: "rgba(204,42,42,0.06)", padding: 14 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#8E8B82", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              Lacunes critiques
            </p>
            <span style={{ fontFamily: "'VT323', monospace", fontSize: 42, color: critical.length > 0 ? "#CC2A2A" : "#5A5A5A", lineHeight: 1 }}>
              {useMultiAgent ? critical.length : topGaps.length}
            </span>
          </div>

          <div style={{ border: "2px solid rgba(45,154,72,0.4)", background: "rgba(45,154,72,0.06)", padding: 14 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#8E8B82", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
              Points forts
            </p>
            <span style={{ fontFamily: "'VT323', monospace", fontSize: 42, color: strongest.length > 0 ? "#2D9A48" : "#5A5A5A", lineHeight: 1 }}>
              {useMultiAgent ? strongest.length : recommendations.length}
            </span>
          </div>

          {useMultiAgent && (
            <div style={{ border: "2px solid rgba(74,144,217,0.4)", background: "rgba(74,144,217,0.06)", padding: 14 }}>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#8E8B82", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                Echanges
              </p>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: 42, color: "#4A90D9", lineHeight: 1 }}>
                {multiAgentState.conversationHistory.filter((m) => m.role === "user").length}
              </span>
            </div>
          )}
        </div>

        {/* ── RADAR + SCORE TABLE ── */}
        {useMultiAgent && scores.length >= 3 && (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, marginBottom: 18 }}>

            {/* Radar Chart */}
            <div style={{ border: "2px solid rgba(74,144,217,0.2)", background: "rgba(74,144,217,0.04)", padding: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RadarChart scores={scores} />
            </div>

            {/* Score Breakdown Table */}
            <div style={{ border: "2px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", padding: 16 }}>
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#5A5A5A", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 12 }}>
                Matrice des competences
              </p>

              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 50px 80px", gap: 8, marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", letterSpacing: "0.15em", textTransform: "uppercase" }}>Competence</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", letterSpacing: "0.15em", textTransform: "uppercase", textAlign: "center" }}>Score</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", letterSpacing: "0.15em", textTransform: "uppercase", textAlign: "center" }}>Poids</span>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", letterSpacing: "0.15em", textTransform: "uppercase" }}>Niveau</span>
              </div>

              {/* Rows */}
              {[...scores].sort((a, b) => b.weight * b.score - a.weight * a.score).map((s) => (
                <div
                  key={s.topic}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 50px 80px",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#F3F0E6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.topic}
                  </span>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: scoreColor(s.score) }}>
                      {s.score}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <div key={i} style={{ width: 3, height: 10, background: i < s.weight ? "#4A90D9" : "rgba(255,255,255,0.08)" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${s.score}%`, background: scoreColor(s.score) }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {executiveSummary && (
          <section style={{ border: "2px solid rgba(74,144,217,0.3)", background: "rgba(74,144,217,0.08)", padding: 16, marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#4A90D9", margin: "0 0 8px" }}>
              Synthese executive
            </h2>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#D8E7F8", lineHeight: 1.7, margin: 0 }}>
              {executiveSummary}
            </p>
          </section>
        )}

        {/* ── FAILURE PATTERNS + EMPLOYEE VIBE ── */}
        {(failurePatterns.length > 0 || employeeVibe) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>

            {/* Failure Pattern Analysis */}
            <section style={{ border: "2px solid rgba(230,126,34,0.4)", background: "rgba(230,126,34,0.06)", padding: 16 }}>
              <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#E67E22", margin: "0 0 10px" }}>
                Patterns d&apos;erreur detectes
              </h2>
              {failurePatterns.length === 0 ? (
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8E8B82" }}>Aucun pattern recurrent identifie.</p>
              ) : (
                failurePatterns.map((fp, idx) => (
                  <div key={`fp-${idx}`} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(230,126,34,0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#F3F0E6", fontWeight: 700 }}>
                        {fp.pattern}
                      </span>
                      <span style={{
                        fontFamily: "'VT323', monospace", fontSize: 16, color: "#E67E22",
                        background: "rgba(230,126,34,0.15)", padding: "2px 8px",
                      }}>
                        x{fp.frequency}
                      </span>
                    </div>
                    {fp.affectedSkills.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                        {fp.affectedSkills.map((skill) => (
                          <span key={skill} style={{
                            fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#E67E22",
                            border: "1px solid rgba(230,126,34,0.3)", padding: "2px 6px",
                            letterSpacing: "0.08em", textTransform: "uppercase",
                          }}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                    {fp.recommendation && (
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#8E8B82", margin: 0 }}>
                        {fp.recommendation}
                      </p>
                    )}
                  </div>
                ))
              )}
            </section>

            {/* Employee Vibe */}
            <section style={{ border: "2px solid rgba(74,217,168,0.4)", background: "rgba(74,217,168,0.06)", padding: 16 }}>
              <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#4AD9A8", margin: "0 0 10px" }}>
                Vibe de l&apos;employe
              </h2>
              {employeeVibe ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                    <div>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                        Ton general
                      </p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#4AD9A8", fontWeight: 700, margin: 0 }}>
                        {employeeVibe.tone}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 7, color: "#5A5A5A", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                        Resistance au stress
                      </p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#4AD9A8", fontWeight: 700, margin: 0 }}>
                        {employeeVibe.stressResilience}
                      </p>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid rgba(74,217,168,0.15)", paddingTop: 8, marginBottom: 10 }}>
                    <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#F3F0E6", lineHeight: 1.6, margin: 0 }}>
                      {employeeVibe.overallAssessment}
                    </p>
                  </div>
                  {employeeVibe.details.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {employeeVibe.details.map((detail, idx) => (
                        <div key={`vibe-${idx}`} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                          <div style={{ width: 3, height: 3, background: "#4AD9A8", marginTop: 5, flexShrink: 0 }} />
                          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#8E8B82", margin: 0, lineHeight: 1.4 }}>
                            {detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8E8B82" }}>Analyse non disponible.</p>
              )}
            </section>
          </div>
        )}

        {/* ── AUTO-ANALYSIS ── */}
        {useMultiAgent && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>

            {/* Weaknesses */}
            <section style={{ border: "2px solid rgba(204,42,42,0.35)", background: "rgba(204,42,42,0.06)", padding: 16 }}>
              <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#CC2A2A", margin: "0 0 10px" }}>
                Lacunes identifiees
              </h2>
              {weakest.length === 0 ? (
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8E8B82" }}>Aucune lacune majeure detectee.</p>
              ) : (
                weakest.map((s) => (
                  <div key={s.topic} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(204,42,42,0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#F3F0E6" }}>{s.topic}</span>
                      <span style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: scoreColor(s.score) }}>{s.score}/100</span>
                    </div>
                    <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#8E8B82", marginTop: 3 }}>
                      Poids {s.weight}/5 · {s.weight >= 4 ? "Competence critique — formation prioritaire recommandee" : "Axe d'amelioration identifie"}
                    </p>
                  </div>
                ))
              )}
            </section>

            {/* Strengths */}
            <section style={{ border: "2px solid rgba(45,154,72,0.35)", background: "rgba(45,154,72,0.06)", padding: 16 }}>
              <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#2D9A48", margin: "0 0 10px" }}>
                Points forts confirmes
              </h2>
              {strongest.length === 0 ? (
                <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#8E8B82" }}>Aucun point fort marque sur cette session.</p>
              ) : (
                strongest.map((s) => (
                  <div key={s.topic} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(45,154,72,0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#F3F0E6" }}>{s.topic}</span>
                      <span style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: scoreColor(s.score) }}>{s.score}/100</span>
                    </div>
                    <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#8E8B82", marginTop: 3 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 12, marginBottom: 12 }}>
              <section style={{ border: "2px solid #A53A3A", background: "rgba(165,58,58,0.12)", padding: 16 }}>
                <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#FF8E8E", margin: "0 0 10px" }}>
                  Top 3 lacunes critiques
                </h2>
                {topGaps.length === 0 ? (
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5" }}>Aucune lacune critique disponible.</p>
                ) : (
                  topGaps.map((gap) => (
                    <article key={gap.skillId} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid rgba(255,142,142,0.25)" }}>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#F3F0E6", margin: 0 }}>
                        {gap.skillName} · criticite {gap.criticality}
                      </p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FFB3B3", marginTop: 4 }}>
                        Mastery {gap.masteryScore}/100 · Confidence {(gap.confidence * 100).toFixed(0)}%
                      </p>
                    </article>
                  ))
                )}
              </section>

              <section style={{ border: "2px solid #2D7A3A", background: "rgba(45,122,58,0.08)", padding: 16 }}>
                <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7FEF98", margin: "0 0 10px" }}>
                  Recommandations formation
                </h2>
                {recommendations.length === 0 ? (
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5" }}>Pas de recommandation prioritaire.</p>
                ) : (
                  recommendations.map((reco) => (
                    <article key={reco.skillId} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid rgba(127,239,152,0.2)" }}>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#F3F0E6", margin: 0 }}>
                        {reco.skillName} · priorite {reco.priority}
                      </p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#BFFFCB", marginTop: 4 }}>{reco.recommendation}</p>
                    </article>
                  ))
                )}
              </section>
            </div>

            {trackedSkills.length > 0 && (
              <section style={{ marginTop: 12, border: "2px solid #F3F0E6", background: "rgba(243,240,230,0.06)", padding: 16 }}>
                <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#F3F0E6", margin: "0 0 10px" }}>
                  Matrice des competences (audit)
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
                  {trackedSkills.map((skill) => (
                    <article key={skill.id} style={{ border: "1px solid rgba(243,240,230,0.25)", padding: 10, background: "rgba(10,10,10,0.25)" }}>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#F3F0E6", margin: 0 }}>
                        {skill.name} ({skill.criticality})
                      </p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#C4C0B5", marginTop: 4 }}>{skill.description}</p>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FFB089", marginTop: 4 }}>
                        Mastery {skill.masteryScore}/100 · Confidence {(skill.confidence * 100).toFixed(0)}% · Attempts {skill.attempts}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {managerNotes.length > 0 && (
              <section style={{ marginTop: 12, border: "2px solid #F3F0E6", background: "rgba(243,240,230,0.06)", padding: 16 }}>
                <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#F3F0E6", margin: "0 0 10px" }}>
                  Notes manager
                </h2>
                <div style={{ display: "grid", gap: 8 }}>
                  {managerNotes.map((note, index) => (
                    <div key={`${index}-${note.slice(0, 20)}`} style={{ borderLeft: "3px solid #4A90D9", paddingLeft: 10 }}>
                      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#F3F0E6", margin: 0 }}>{note}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {actionPlan7Days.length > 0 && (
          <section style={{ border: "2px solid rgba(74,144,217,0.3)", background: "rgba(74,144,217,0.05)", padding: 14, marginTop: 12 }}>
            <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.15em", color: "#4A90D9", margin: "0 0 10px" }}>
              Plan de remédiation immédiat
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {actionPlan7Days.slice(0, 3).map((item, idx) => (
                <div key={`${idx}-${item.slice(0, 12)}`} style={{ background: "rgba(74,144,217,0.08)", border: "1px solid rgba(74,144,217,0.2)", padding: "10px 12px" }}>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#4A90D9", margin: "0 0 4px", letterSpacing: "0.1em" }}>
                    ACTION {idx + 1}
                  </p>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#F3F0E6", margin: 0, lineHeight: 1.5 }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── FOOTER ── */}
        <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#5A5A5A", letterSpacing: "0.1em" }}>
            Genere par RAG-to-RPG · Powered by Mistral AI + ElevenLabs
          </p>
          <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#5A5A5A" }}>
            {new Date().toLocaleString("fr-FR")}
          </p>
        </div>
      </div>
    </div>
  );
}
