"use client";
import { useState } from "react";
import { useDialog } from "@/app/lib/conversation/useDialog";
import type {
  ConversationReport,
  ScenarioCard,
  Turn,
} from "@/app/lib/conversation/types";
import type { QuestionKind } from "@/app/lib/simulation/contracts";
import { Arrow } from "./Chrome";

// Scores are 0–4. Words first: the learner reads a level, not a grade.
const LEVELS = ["À découvrir", "Premiers pas", "En progrès", "Solide", "Maîtrisé"];
const KINDS: Record<QuestionKind, { label: string; hint: string }> = {
  open: { label: "Ouverte", hint: "laisse le client raconter" },
  closed: { label: "Fermée", hint: "oui/non ou choix" },
  leading: { label: "Orientée", hint: "suggère la réponse" },
  solution: { label: "Solution", hint: "formule une proposition" },
};

export default function Report({
  report,
  turns,
  scenario,
  moduleNumber,
  onAgain,
  onBack,
}: {
  report: ConversationReport;
  turns: Turn[];
  scenario: ScenarioCard;
  moduleNumber?: number;
  onAgain: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  useDialog(selected !== null, () => setSelected(null));
  const turn = turns.find((t) => t.id === selected);
  const index = turn ? turns.indexOf(turn) : -1;
  const discovered = report.discovery?.filter((d) => d.discovered).length ?? 0;
  const total = report.discovery?.length ?? 0;
  const who = scenario.personaName.split(" ")[0];
  const learnerTurns = turns.filter((t) => t.role === "user").length;
  return (
    <main className="yg-page">
      <header className="yg-report-head">
        <div className="yg-reveal">
          <p className="yg-kicker">
            Retour d’entretien · <b>{scenario.title}</b>
            {moduleNumber ? ` · Module ${moduleNumber}` : ""}
          </p>
          <h1 className="yg-title" style={{ marginTop: 16 }}>
            Voici ce que votre entretien <em>a fait émerger.</em>
          </h1>
          <p className="yg-lead">{report.summary}</p>
        </div>
        {report.discovery && (
          <aside className="yg-score-seal yg-reveal" aria-label="Besoin découvert">
            <span className="yg-kicker">Besoin découvert</span>
            <strong>
              {discovered}
              <small> / {total}</small>
            </strong>
            <div className="yg-bars" style={{ "--n": total } as React.CSSProperties} aria-hidden="true">
              {report.discovery.map((d) => (
                <i key={d.fact} className={d.discovered ? "on" : ""} />
              ))}
            </div>
            <p className="yg-small">
              dimensions du besoin de {who} mises au jour en {learnerTurns} intervention
              {learnerTurns > 1 ? "s" : ""}.
            </p>
          </aside>
        )}
      </header>

      {report.bestMoment && (
        <button className="yg-best yg-reveal" onClick={() => setSelected(report.bestMoment!.turnId)}>
          <span className="yg-kicker">Votre meilleur moment</span>
          <q>{report.bestMoment.quote}</q>
          <p>{report.bestMoment.why}</p>
          <small>Revoir ce moment dans l’entretien →</small>
        </button>
      )}

      {report.discovery && (
        <section className="yg-section">
          <div className="yg-section-head">
            <h2>La carte du besoin</h2>
            <span>Cliquez une dimension pour retrouver la question</span>
          </div>
          <div className="yg-map-wrap">
            <NeedMap discovery={report.discovery} center={`Le besoin de ${who}`} onSelect={setSelected} />
            <div className="yg-map-legend">
              <div><i /> Mis au jour par vos questions</div>
              <div><i className="off" /> Resté dans l’ombre</div>
              <p className="yg-small">
                Les dimensions en pointillés n’ont pas été abordées. C’est là que se trouvent vos
                prochaines questions.
              </p>
            </div>
          </div>
        </section>
      )}

      {report.questions && report.questions.length > 0 && (
        <QuestionStrip questions={report.questions} onSelect={setSelected} />
      )}

      <section className="yg-section yg-columns">
        <div>
          <div className="yg-section-head">
            <h2>Vos points d’appui</h2>
            <span>À garder</span>
          </div>
          <ol className="yg-list">
            {report.strengths.map((s, i) => (
              <li key={i}>
                <span>✓</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="yg-section-head">
            <h2>Au prochain entretien</h2>
            <span>À essayer</span>
          </div>
          <ol className="yg-list yg-list--signal">
            {report.priorities.map((s, i) => (
              <li key={i}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="yg-section">
        <div className="yg-section-head">
          <h2>Compétence par compétence</h2>
          <span>Chaque niveau s’appuie sur vos propres mots</span>
        </div>
        <div className="yg-skills">
          {report.skills.map((skill) => (
            <details className="yg-skill" key={skill.key}>
              <summary>
                <span>{skill.label}</span>
                <Gauge score={skill.score} />
                <span className={`yg-level ${skill.score === null ? "is-none" : ""}`}>
                  {skill.score === null ? "Non observé" : LEVELS[skill.score]}
                </span>
                <span className="yg-plus" aria-hidden="true">+</span>
              </summary>
              <div className="yg-skill-body">
                <p>{skill.reason}</p>
                <div className="yg-evidence">
                  {skill.evidence.map((e, i) => (
                    <button className="yg-quote" key={i} onClick={() => setSelected(e.turnId)}>
                      « {e.quote} »<small>Retrouver dans l’entretien</small>
                    </button>
                  ))}
                  {skill.missing.length > 0 && (
                    <>
                      <p className="yg-kicker" style={{ marginTop: 8 }}>Reste à explorer</p>
                      <ul className="yg-missing">
                        {skill.missing.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="yg-advice">
                  <strong>À essayer</strong>
                  <p>{skill.advice}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {report.indicators.length > 0 && (
        <section className="yg-section">
          <div className="yg-section-head">
            <h2>Indicateurs</h2>
            <span>Descriptifs, tirés du transcript</span>
          </div>
          <div className="yg-indicators">
            {report.indicators.map((i, n) => (
              <article className="yg-indicator" key={n}>
                <span className="yg-kicker">{i.label}</span>
                <strong>{i.value}</strong>
                <p>{i.explanation}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="yg-again">
        <div>
          <h2 className="yg-title">On essaie autrement&nbsp;?</h2>
          <p>Choisissez une piste ci-dessus et testez-la tout de suite. L’aisance vient en recommençant.</p>
        </div>
        <div className="yg-again-actions">
          <button className="yg-btn yg-btn--signal yg-btn--lg" onClick={onAgain}>
            Nouvelle tentative <Arrow />
          </button>
          <button className="yg-btn yg-btn--ghost yg-btn--lg" onClick={onBack}>
            Ma progression
          </button>
        </div>
      </section>

      {turn && (
        <div className="yg-modal-backdrop" onClick={() => setSelected(null)}>
          <section className="yg-modal" role="dialog" aria-modal="true" aria-label="Extrait de l’entretien" onClick={(e) => e.stopPropagation()}>
            <div className="yg-modal-head">
              <p className="yg-kicker">Dans votre entretien</p>
              <button className="yg-close" autoFocus onClick={() => setSelected(null)}>
                Fermer
              </button>
            </div>
            <div className="yg-excerpt">
              {turns.slice(Math.max(0, index - 1), index + 2).map((t) => (
                <div key={t.id} className={`yg-turn ${t.role === "user" ? "is-user" : ""} ${t.id === selected ? "is-focus" : ""}`}>
                  <small>{t.role === "user" ? "Vous" : scenario.personaName}</small>
                  <p>{t.content}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function Gauge({ score }: { score: number | null }) {
  return (
    <span
      className={`yg-gauge ${score === 4 ? "is-top" : ""}`}
      title={score === null ? "Non observé" : `${score} / 4`}
      aria-label={score === null ? "Non observé" : `Niveau ${score} sur 4`}
    >
      {[1, 2, 3, 4].map((n) => (
        <i key={n} className={score !== null && n <= score ? "on" : ""} />
      ))}
    </span>
  );
}

/** Radial map of the need: the scenario's hidden facts, labelled by theme only. */
function NeedMap({
  discovery,
  center,
  onSelect,
}: {
  discovery: NonNullable<ConversationReport["discovery"]>;
  center: string;
  onSelect: (turnId: string) => void;
}) {
  const W = 900, H = 460, cx = W / 2, cy = H / 2;
  const n = discovery.length;
  return (
    <svg
      className="yg-map"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Carte du besoin : ${discovery.filter((d) => d.discovered).length} dimensions découvertes sur ${n}`}
    >
      {discovery.map((d, i) => {
        const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(angle) * 240, y = cy + Math.sin(angle) * 170;
        const anchor = Math.abs(Math.cos(angle)) < 0.2 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
        const lx = x + (anchor === "start" ? 16 : anchor === "end" ? -16 : 0);
        const ly = y + (anchor === "middle" ? (Math.sin(angle) > 0 ? 28 : -18) : 5);
        const lines = wrap(d.theme);
        return (
          <g
            key={d.fact}
            className={d.discovered ? "is-on" : "is-off"}
            style={{ animationDelay: `${i * 80}ms` }}
            onClick={() => d.turnId && onSelect(d.turnId)}
            tabIndex={d.turnId ? 0 : -1}
            role={d.turnId ? "button" : undefined}
            aria-label={d.turnId ? `${d.theme} : retrouver la question` : undefined}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && d.turnId) {
                e.preventDefault();
                onSelect(d.turnId);
              }
            }}
          >
            <line x1={cx} y1={cy} x2={x} y2={y} />
            <circle cx={x} cy={y} r={d.discovered ? 8 : 6} />
            <text x={lx} y={anchor === "middle" && Math.sin(angle) < 0 ? ly - (lines.length - 1) * 16 : ly} textAnchor={anchor}>
              {lines.map((line, j, all) => (
                <tspan key={j} x={lx} dy={j === 0 ? (anchor === "middle" ? 0 : -(all.length - 1) * 8) : 16}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      <circle className="yg-map-core" cx={cx} cy={cy} r={60} />
      <text className="yg-map-core-text" x={cx} y={cy - 4} textAnchor="middle">
        {wrap(center, 14).map((line, j) => (
          <tspan key={j} x={cx} dy={j ? 19 : 0}>
            {line}
          </tspan>
        ))}
      </text>
    </svg>
  );
}

function QuestionStrip({
  questions,
  onSelect,
}: {
  questions: NonNullable<ConversationReport["questions"]>;
  onSelect: (turnId: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const counts = (Object.keys(KINDS) as QuestionKind[]).map(
    (k) => [k, questions.filter((q) => q.kind === k).length] as const,
  );
  const shown = hover !== null ? questions[hover] : null;
  return (
    <section className="yg-section">
      <div className="yg-section-head">
        <h2>Vos questions, dans l’ordre</h2>
        <span>
          {questions.length} question{questions.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="yg-qline">
        {questions.map((q, i) => (
          <button
            key={i}
            className={`yg-q yg-q--${q.kind} ${hover === i ? "is-shown" : ""}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(q.turnId)}
            aria-label={`Question ${i + 1}, ${KINDS[q.kind].label} : ${q.quote}`}
          >
            {String(i + 1).padStart(2, "0")}
          </button>
        ))}
      </div>
      <p className="yg-qquote">
        {shown ? (
          <>
            « {shown.quote} »<em>{KINDS[shown.kind].label}</em>
          </>
        ) : (
          <span className="yg-small">Survolez une question pour la relire, cliquez pour la retrouver.</span>
        )}
      </p>
      <div className="yg-qlegend">
        {counts.map(([k, c]) => (
          <span key={k}>
            <i className={`yg-q--${k}`} />
            {KINDS[k].label} <b>{c}</b>
            <small>{KINDS[k].hint}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

/** Splits a label into short lines so the radial map never clips at the edges. */
function wrap(text: string, width = 22) {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last && (last + " " + word).length <= width) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines;
}
