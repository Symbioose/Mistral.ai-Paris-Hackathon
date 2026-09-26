"use client";
import { useState } from "react";
import { useDialog } from "@/app/lib/conversation/useDialog";
import type {
  ConversationReport,
  ScenarioCard,
  Turn,
} from "@/app/lib/conversation/types";
import type { QuestionKind } from "@/app/lib/simulation/contracts";

// Scores are 0–4. Words first: the learner reads a level, not a grade.
const LEVELS = [
  "À découvrir",
  "Premiers pas",
  "En progrès",
  "Solide",
  "Maîtrisé",
];
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
  const discovered = report.discovery?.filter((d) => d.discovered).length ?? 0;
  return (
    <main className="yg-report yg-enter">
      <div className="yg-eyebrow">
        VOTRE RETOUR · {scenario.title.toUpperCase()}
        {moduleNumber ? ` · MODULE ${moduleNumber}` : ""}
      </div>
      <h1>
        Chaque échange
        <br />
        <em>vous fait avancer.</em>
      </h1>
      <p className="yg-lead">{report.summary}</p>

      {report.bestMoment && (
        <button
          className="yg-best"
          onClick={() => setSelected(report.bestMoment!.turnId)}
        >
          <span className="yg-kicker">VOTRE MEILLEUR MOMENT</span>
          <q>{report.bestMoment.quote}</q>
          <p>{report.bestMoment.why}</p>
          <small>Revoir ce moment ↗</small>
        </button>
      )}

      {report.discovery && (
        <section className="yg-discovery">
          <div className="yg-section-title">
            <h2>Ce que vous avez fait émerger</h2>
            <span>
              {discovered} dimension{discovered > 1 ? "s" : ""} sur{" "}
              {report.discovery.length} du besoin de{" "}
              {scenario.personaName.split(" ")[0]}
            </span>
          </div>
          <NeedMap
            discovery={report.discovery}
            center={`Le besoin de ${scenario.personaName.split(" ")[0]}`}
            onSelect={setSelected}
          />
          <p className="yg-small yg-center">
            Les dimensions en pointillés sont restées dans l’ombre : c’est là
            que se cachent vos prochaines questions.
          </p>
        </section>
      )}

      {report.questions && report.questions.length > 0 && (
        <QuestionStrip questions={report.questions} onSelect={setSelected} />
      )}

      <div className="yg-report-intro">
        <section className="yg-paper">
          <span className="yg-kicker">À CONSERVER</span>
          <h2>Vos points d’appui</h2>
          {report.strengths.map((s, i) => (
            <p key={i} className="yg-check">
              {s}
            </p>
          ))}
        </section>
        <section className="yg-paper yg-paper-tint">
          <span className="yg-kicker">POUR LE PROCHAIN ENTRETIEN</span>
          <h2>Un pas de plus</h2>
          {report.priorities.map((s, i) => (
            <p key={i}>
              <span className="yg-number">0{i + 1}</span>
              {s}
            </p>
          ))}
        </section>
      </div>

      <div className="yg-section-title">
        <h2>Votre démarche, compétence par compétence</h2>
        <span>Chaque niveau s’appuie sur vos propres mots.</span>
      </div>
      <div className="yg-skill-list">
        {report.skills.map((skill) => (
          <details className="yg-skill" key={skill.key}>
            <summary>
              <span>{skill.label}</span>
              <Level score={skill.score} />
              <span className="yg-expand">+</span>
            </summary>
            <div className="yg-skill-body">
              <p>{skill.reason}</p>
              {skill.evidence.map((e, i) => (
                <button
                  className="yg-quote"
                  key={i}
                  onClick={() => setSelected(e.turnId)}
                >
                  « {e.quote} »<small>Retrouver dans l’entretien ↗</small>
                </button>
              ))}
              {skill.missing.length > 0 && (
                <>
                  <h3>Ce qui reste à explorer</h3>
                  <ul>
                    {skill.missing.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="yg-advice">
                <strong>À essayer</strong>
                <p>{skill.advice}</p>
              </div>
            </div>
          </details>
        ))}
      </div>

      {report.indicators.length > 0 && (
        <div className="yg-indicators">
          {report.indicators.map((i, index) => (
            <article className="yg-paper" key={index}>
              <span className="yg-kicker">{i.label}</span>
              <strong>{i.value}</strong>
              <p>{i.explanation}</p>
            </article>
          ))}
        </div>
      )}

      <div className="yg-report-footer">
        <div>
          <h2>On essaie autrement ?</h2>
          <p>
            Choisissez une piste ci-dessus et testez-la dans un nouvel
            entretien. C’est en recommençant que l’aisance vient.
          </p>
        </div>
        <button className="yg-button" onClick={onAgain}>
          Nouvelle tentative <span>↗</span>
        </button>
        <button className="yg-link" onClick={onBack}>
          Voir ma progression
        </button>
      </div>

      {turn && (
        <div className="yg-modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="yg-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Extrait de la conversation"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="yg-close"
              autoFocus
              onClick={() => setSelected(null)}
            >
              Fermer ×
            </button>
            <span className="yg-kicker">DANS VOTRE ENTRETIEN</span>
            {turns
              .slice(
                Math.max(0, turns.indexOf(turn) - 1),
                turns.indexOf(turn) + 2,
              )
              .map((t) => (
                <blockquote
                  key={t.id}
                  className={t.id === selected ? "yg-highlight" : ""}
                >
                  <small>
                    {t.role === "user" ? "Vous" : scenario.personaName}
                  </small>
                  <p>{t.content}</p>
                </blockquote>
              ))}
          </section>
        </div>
      )}
    </main>
  );
}

function Level({ score }: { score: number | null }) {
  if (score === null)
    return <span className="yg-level yg-level-none">Non observé</span>;
  return (
    <span className="yg-level" title={`${score} / 4`}>
      <span className="yg-level-dots" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= score ? "on" : ""} />
        ))}
      </span>
      {LEVELS[score]}
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
  const W = 1000,
    H = 460,
    cx = W / 2,
    cy = H / 2;
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
        const x = cx + Math.cos(angle) * 250,
          y = cy + Math.sin(angle) * 165;
        const anchor =
          Math.abs(Math.cos(angle)) < 0.2
            ? "middle"
            : Math.cos(angle) > 0
              ? "start"
              : "end";
        const lx = x + (anchor === "start" ? 16 : anchor === "end" ? -16 : 0),
          ly = y + (anchor === "middle" ? (Math.sin(angle) > 0 ? 28 : -18) : 5);
        return (
          <g
            key={d.fact}
            className={d.discovered ? "yg-map-on" : "yg-map-off"}
            style={{ animationDelay: `${i * 90}ms` }}
            onClick={() => d.turnId && onSelect(d.turnId)}
            tabIndex={d.turnId ? 0 : -1}
            role={d.turnId ? "button" : undefined}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && d.turnId) {
                e.preventDefault();
                onSelect(d.turnId);
              }
            }}
          >
            <line x1={cx} y1={cy} x2={x} y2={y} />
            <circle cx={x} cy={y} r={d.discovered ? 9 : 7} />
            <text
              x={lx}
              y={
                anchor === "middle" && Math.sin(angle) < 0
                  ? ly - (wrap(d.theme).length - 1) * 16
                  : ly
              }
              textAnchor={anchor}
            >
              {wrap(d.theme).map((line, j, all) => (
                <tspan
                  key={j}
                  x={lx}
                  dy={
                    j === 0
                      ? anchor === "middle"
                        ? 0
                        : -(all.length - 1) * 8
                      : 16
                  }
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      <circle className="yg-map-core" cx={cx} cy={cy} r={62} />
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
    <section className="yg-questions">
      <div className="yg-section-title">
        <h2>Vos questions, dans l’ordre</h2>
        <span>
          {questions.length} question{questions.length > 1 ? "s" : ""} posée
          {questions.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="yg-question-strip">
        {questions.map((q, i) => (
          <button
            key={i}
            className={`yg-q yg-q-${q.kind}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect(q.turnId)}
            aria-label={`Question ${i + 1}, ${KINDS[q.kind].label} : ${q.quote}`}
          >
            <span>{i + 1}</span>
          </button>
        ))}
      </div>
      <p className="yg-question-quote">
        {shown ? (
          <>
            « {shown.quote} » <em>{KINDS[shown.kind].label}</em>
          </>
        ) : (
          "Survolez une question pour la relire."
        )}
      </p>
      <div className="yg-question-legend">
        {counts.map(([k, c]) => (
          <span key={k} className={`yg-k-${k}`}>
            <i />
            {KINDS[k].label} <strong>{c}</strong>
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
    if (last && (last + " " + word).length <= width)
      lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines;
}
