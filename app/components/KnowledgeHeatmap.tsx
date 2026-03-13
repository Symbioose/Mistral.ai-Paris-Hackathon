"use client";

interface KnowledgeHeatmapProps {
  scores: Array<{ topic: string; score: number; weight: number }>;
  totalScore: number;
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
  if (score < 50) return "Faible";
  if (score < 70) return "Moyen";
  if (score < 85) return "Bien";
  return "Maîtrisé";
}

export default function KnowledgeHeatmap({ scores, totalScore }: KnowledgeHeatmapProps) {
  const color = scoreColor(totalScore);

  return (
    <div
      style={{
        padding: "14px 14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header + global score */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 11,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Score global
          </p>
          <p
            style={{
              fontFamily: "var(--corp-font-body)",
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.05em",
            }}
          >
            {scoreLabel(totalScore)}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 32,
              color,
              lineHeight: 1,
              transition: "color 0.5s ease",
            }}
          >
            {totalScore}
          </span>
          <span
            style={{
              fontFamily: "var(--corp-font-heading)",
              fontSize: 16,
              color: "rgba(255,255,255,0.3)",
            }}
          >
            /100
          </span>
        </div>
      </div>

      {/* Global bar */}
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.06)",
          marginBottom: 16,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${totalScore}%`,
            background: `linear-gradient(90deg, ${color}, ${color}99)`,
            transition: "width 0.6s ease, background 0.6s ease",
          }}
        />
      </div>

      {/* Per-topic scores */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {scores.map(({ topic, score, weight }) => {
          const c = scoreColor(score);
          return (
            <div key={topic}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                  {/* Weight indicator */}
                  <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <div
                        key={i}
                        style={{
                          width: 2,
                          height: 5,
                          background:
                            i < weight
                              ? "rgba(255,255,255,0.15)"
                              : "rgba(255,255,255,0.05)",
                        }}
                      />
                    ))}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--corp-font-body)",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.5)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {topic}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "var(--corp-font-body)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: c,
                    letterSpacing: "0.04em",
                    flexShrink: 0,
                    transition: "color 0.5s ease",
                  }}
                >
                  {score}
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  background: "rgba(255,255,255,0.05)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${score}%`,
                    background: c,
                    transition: "width 0.55s ease, background 0.55s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
