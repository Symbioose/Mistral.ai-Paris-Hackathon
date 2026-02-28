"use client";

import { ManagerAssessment, SimulationReport } from "@/app/lib/types";

interface SkillsReportDashboardProps {
  assessments: ManagerAssessment[];
  report: SimulationReport | null;
  documentFilename: string | null;
  onRestart: () => void;
}

export default function SkillsReportDashboard({ assessments, report, documentFilename, onRestart }: SkillsReportDashboardProps) {
  const fallbackScore = assessments.reduce((acc, a) => acc + a.playerScoreChange, 0);
  const globalScore = report ? report.globalWeightedScore : fallbackScore;

  const managerNotes = assessments
    .map((a) => a.managerNote)
    .filter((note) => note && note.trim().length > 0)
    .slice(-10)
    .reverse();

  const topGaps = report?.topCriticalGaps ?? [];
  const recommendations = report?.recommendations ?? [];
  const trackedSkills = report?.skills ?? [];

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: "linear-gradient(135deg, #111 0%, #181410 40%, #241108 100%)",
        color: "#F3F0E6",
        padding: "28px 20px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FFB089", marginBottom: 8 }}>
              Rapport manager-ready
            </p>
            <h1 style={{ fontFamily: "'VT323', monospace", fontSize: 58, color: "#FF6F3D", lineHeight: 0.92, margin: 0 }}>
              SKILL GAP REPORT
            </h1>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5", marginTop: 12 }}>
              Source: {documentFilename || "Mode RATP Survival"} · {trackedSkills.length || assessments.length} skills
            </p>
            {report?.generatedAt && (
              <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#8E8B82", marginTop: 6 }}>
                Genere le {new Date(report.generatedAt).toLocaleString("fr-FR")}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              onClick={() => window.print()}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "11px 16px",
                background: "#FF6F3D",
                color: "#F3F0E6",
                border: "2px solid #FF6F3D",
                boxShadow: "4px 4px 0 #AA4A27",
                cursor: "pointer",
              }}
            >
              Exporter PDF
            </button>
            <button
              onClick={onRestart}
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "11px 16px",
                background: "transparent",
                color: "#F3F0E6",
                border: "2px solid #F3F0E6",
                cursor: "pointer",
              }}
            >
              Nouvelle simulation
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 16 }}>
          <div style={{ border: "2px solid #FF6F3D", background: "rgba(255,111,61,0.08)", padding: 14 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FFB089", marginBottom: 6 }}>Score global pondéré</p>
            <p style={{ fontFamily: "'VT323', monospace", fontSize: 54, color: globalScore >= 60 ? "#6AE08A" : globalScore >= 40 ? "#FFCC75" : "#FF7E7E", lineHeight: 1 }}>
              {globalScore}
            </p>
          </div>
          <div style={{ border: "2px solid #C4C0B5", background: "rgba(196,192,181,0.06)", padding: 14 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#C4C0B5", marginBottom: 6 }}>Lacunes critiques</p>
            <p style={{ fontFamily: "'VT323', monospace", fontSize: 42, color: "#FF8E8E", lineHeight: 1 }}>{topGaps.length}</p>
          </div>
          <div style={{ border: "2px solid #C4C0B5", background: "rgba(196,192,181,0.06)", padding: 14 }}>
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#C4C0B5", marginBottom: 6 }}>Recommandations</p>
            <p style={{ fontFamily: "'VT323', monospace", fontSize: 42, color: "#6AE08A", lineHeight: 1 }}>{recommendations.length}</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 12 }}>
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
                  {gap.failurePatterns.length > 0 && (
                    <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FFD1D1", marginTop: 4 }}>
                      Patterns: {gap.failurePatterns.join(" | ")}
                    </p>
                  )}
                  {gap.evidenceExcerpts.length > 0 && (
                    <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#FFC09F", marginTop: 4 }}>
                      Preuves: {gap.evidenceExcerpts.join(" / ")}
                    </p>
                  )}
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

        <section style={{ marginTop: 12, border: "2px solid #F3F0E6", background: "rgba(243,240,230,0.06)", padding: 16 }}>
          <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#F3F0E6", margin: "0 0 10px" }}>
            Matrice des compétences (audit)
          </h2>
          {trackedSkills.length === 0 ? (
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5" }}>Matrice non disponible.</p>
          ) : (
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
          )}
        </section>

        <section style={{ marginTop: 12, border: "2px solid #F3F0E6", background: "rgba(243,240,230,0.06)", padding: 16 }}>
          <h2 style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#F3F0E6", margin: "0 0 10px" }}>
            Notes manager
          </h2>
          {managerNotes.length === 0 ? (
            <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#C4C0B5" }}>Aucune note manager disponible.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {managerNotes.map((note, index) => (
                <div key={`${index}-${note.slice(0, 20)}`} style={{ borderLeft: "3px solid #FF6F3D", paddingLeft: 10 }}>
                  <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#F3F0E6", margin: 0 }}>{note}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
