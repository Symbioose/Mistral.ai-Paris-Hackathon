"use client";

interface KnowledgeHeatmapProps {
  scores: Array<{ topic: string; score: number; weight: number }>;
  totalScore: number;
}

function scoreColor(score: number): string {
  if (score < 30) return "#CC2A2A";
  if (score < 50) return "#D9754A";
  if (score < 70) return "#D9A84A";
  if (score < 85) return "#7AB648";
  return "#2D9A48";
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
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
              color: "#5A5A5A",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Score global
          </p>
          <p
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 8,
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
              fontFamily: "'VT323', monospace",
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
              fontFamily: "'VT323', monospace",
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
                              ? "rgba(255,255,255,0.3)"
                              : "rgba(255,255,255,0.06)",
                        }}
                      />
                    ))}
                  </div>
                  <span
                    style={{
                      fontFamily: "'Space Mono', monospace",
                      fontSize: 8,
                      color: "rgba(255,255,255,0.45)",
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
                    fontFamily: "'Space Mono', monospace",
                    fontSize: 9,
                    fontWeight: 700,
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
