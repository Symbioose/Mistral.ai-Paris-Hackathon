import defaultPrompts from "@/data/simulation/prompt-templates.v1.json";
export const competencyKeys = [
  "need_context",
  "investigation",
  "open_questions",
  "incidents_causes",
  "ideal_solution",
  "stakeholders",
  "branching",
] as const;
export type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};
export type ScenarioConfig = {
  title: string;
  brief: string;
  personaName: string;
  personaRole: string;
  durationMinutes: number;
  persona: { instructions: string; hiddenFacts: string[] };
  modules: { number: number; title: string; instructions: string }[];
  rubric: {
    key: string;
    label: string;
    description: string;
    anchors: { score: number; description: string }[];
  }[];
  reference: string;
  judgePrompt: string;
  prompts?: { version: string; persona: string; judge: string };
  learnerHints?: { title: string; example: string }[];
  voice?: { gradiumVoiceId?: string; fallbackVoice?: string; style?: string };
};
export const questionKinds = ["open", "closed", "leading", "solution"] as const;
export type QuestionKind = (typeof questionKinds)[number];
export type Report = {
  summary: string;
  strengths: string[];
  priorities: string[];
  skills: {
    key: string;
    label: string;
    score: number | null;
    reason: string;
    evidence: { turnId: string; quote: string }[];
    missing: string[];
    advice: string;
  }[];
  indicators: { label: string; value: string; explanation: string }[];
  // Which hidden facts the learner brought to light, labelled by theme only (the fact itself stays private).
  discovery?: {
    fact: number;
    theme: string;
    discovered: boolean;
    turnId: string | null;
  }[];
  // Judge classification of each learner question, used for the conversation timeline.
  questions?: { turnId: string; quote: string; kind: QuestionKind }[];
  bestMoment?: { turnId: string; quote: string; why: string } | null;
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= 30000;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);
export function validateConfig(v: unknown): ScenarioConfig {
  if (
    !object(v) ||
    ![
      "title",
      "brief",
      "personaName",
      "personaRole",
      "reference",
      "judgePrompt",
    ].every((k) => str(v[k])) ||
    typeof v.durationMinutes !== "number" ||
    !Number.isFinite(v.durationMinutes) ||
    v.durationMinutes < 1 ||
    v.durationMinutes > 120 ||
    !object(v.persona) ||
    !str(v.persona.instructions) ||
    !strings(v.persona.hiddenFacts)
  )
    throw new Error("Configuration de scénario invalide");
  if (
    !Array.isArray(v.modules) ||
    !v.modules.length ||
    v.modules.length > 20 ||
    !v.modules.every(
      (m) =>
        object(m) &&
        Number.isInteger(m.number) &&
        Number(m.number) > 0 &&
        str(m.title) &&
        str(m.instructions),
    ) ||
    new Set(v.modules.map((m) => m.number)).size !== v.modules.length
  )
    throw new Error("Modules invalides");
  if (
    !Array.isArray(v.rubric) ||
    v.rubric.length < 1 ||
    v.rubric.length > 30 ||
    !v.rubric.every(
      (r) =>
        object(r) &&
        typeof r.key === "string" &&
        /^[a-z][a-z0-9_]{0,63}$/.test(r.key) &&
        str(r.label) &&
        str(r.description) &&
        Array.isArray(r.anchors) &&
        r.anchors.length >= 2 &&
        r.anchors.every(
          (a) =>
            object(a) &&
            Number.isInteger(a.score) &&
            Number(a.score) >= 0 &&
            Number(a.score) <= 4 &&
            str(a.description),
        ) &&
        new Set(r.anchors.map((a) => a.score)).size === r.anchors.length,
    ) ||
    new Set(v.rubric.map((r) => r.key)).size !== v.rubric.length
  )
    throw new Error("Compétences uniques et ancrages requis");
  if (
    v.voice !== undefined &&
    (!object(v.voice) ||
      ["gradiumVoiceId", "fallbackVoice", "style"].some(
        (k) =>
          (v.voice as Record<string, unknown>)[k] !== undefined &&
          !str((v.voice as Record<string, unknown>)[k]),
      ))
  )
    throw new Error("Voix invalide");
  if (
    v.prompts !== undefined &&
    (!object(v.prompts) ||
      !["version", "persona", "judge"].every((k) =>
        str((v.prompts as Record<string, unknown>)[k]),
      ))
  )
    throw new Error("Prompts invalides");
  if (
    v.learnerHints !== undefined &&
    (!Array.isArray(v.learnerHints) ||
      v.learnerHints.length > 20 ||
      !v.learnerHints.every((h) => object(h) && str(h.title) && str(h.example)))
  )
    throw new Error("Conseils apprenant invalides");
  if (JSON.stringify(v).length > 150000)
    throw new Error("Configuration trop volumineuse");
  return {
    ...v,
    prompts: v.prompts || structuredClone(defaultPrompts),
  } as unknown as ScenarioConfig;
}
export function publicScenario(id: string, c: ScenarioConfig) {
  return {
    id,
    title: c.title,
    brief: c.brief,
    personaName: c.personaName,
    personaRole: c.personaRole,
    durationMinutes: c.durationMinutes,
    avatarUrl: "/avatar/mpfb.glb",
    modules: c.modules.map((m) => ({ number: m.number, title: m.title })),
    learnerHints: (c.learnerHints || []).map((h) => ({
      title: h.title,
      example: h.example,
    })),
    voice: {
      gradiumVoiceId:
        c.voice?.gradiumVoiceId || process.env.GRADIUM_VOICE_ID || null,
      fallbackVoice: c.voice?.fallbackVoice || null,
      style: c.voice?.style || null,
    },
  };
}
export function validateReport(
  v: unknown,
  c: ScenarioConfig,
  turns: Turn[],
): Report {
  if (
    !object(v) ||
    !str(v.summary) ||
    !strings(v.strengths) ||
    !strings(v.priorities) ||
    !Array.isArray(v.skills) ||
    v.skills.length !== c.rubric.length ||
    !Array.isArray(v.indicators)
  )
    throw new Error("Rapport incomplet");
  const keys = new Set<string>();
  for (const s of v.skills) {
    if (
      !object(s) ||
      !str(s.key) ||
      keys.has(s.key) ||
      !c.rubric.some((r) => r.key === s.key && r.label === s.label) ||
      !(
        s.score === null ||
        (typeof s.score === "number" &&
          Number.isInteger(s.score) &&
          s.score >= 0 &&
          s.score <= 4)
      ) ||
      !str(s.reason) ||
      !str(s.advice) ||
      !strings(s.missing) ||
      !Array.isArray(s.evidence)
    )
      throw new Error("Compétence du rapport invalide");
    keys.add(s.key);
    for (const e of s.evidence) {
      if (
        !object(e) ||
        !str(e.quote) ||
        !str(e.turnId) ||
        !turns.some(
          (t) =>
            t.id === e.turnId &&
            t.role === "user" &&
            t.content.includes(e.quote as string),
        )
      )
        throw new Error("Citation absente du transcript apprenant");
    }
    if (s.score !== null && Number(s.score) > 0 && !s.evidence.length)
      throw new Error("Score positif sans preuve");
  }
  if (
    !v.indicators.every(
      (i) => object(i) && str(i.label) && str(i.value) && str(i.explanation),
    )
  )
    throw new Error("Indicateurs invalides");
  const learnerTurn = (id: unknown) =>
    turns.some((t) => t.id === id && t.role === "user");
  const quoted = (id: unknown, quote: unknown) =>
    str(quote) &&
    turns.some(
      (t) => t.id === id && t.role === "user" && t.content.includes(quote),
    );
  let discovery: Report["discovery"];
  if (v.discovery !== undefined) {
    if (
      !Array.isArray(v.discovery) ||
      v.discovery.length !== c.persona.hiddenFacts.length
    )
      throw new Error("Carte de découverte incomplète");
    discovery = v.discovery.map((d, i) => {
      if (
        !object(d) ||
        d.fact !== i ||
        !str(d.theme) ||
        d.theme.length > 80 ||
        typeof d.discovered !== "boolean" ||
        (d.discovered ? !learnerTurn(d.turnId) : d.turnId !== null)
      )
        throw new Error("Carte de découverte invalide");
      return {
        fact: i,
        theme: d.theme,
        discovered: d.discovered,
        turnId: d.discovered ? (d.turnId as string) : null,
      };
    });
  }
  let questions: Report["questions"];
  if (v.questions !== undefined) {
    if (!Array.isArray(v.questions)) throw new Error("Questions invalides");
    questions = v.questions.map((q) => {
      if (
        !object(q) ||
        !quoted(q.turnId, q.quote) ||
        !questionKinds.includes(q.kind as QuestionKind)
      )
        throw new Error("Question non retrouvée dans le transcript");
      return {
        turnId: q.turnId as string,
        quote: q.quote as string,
        kind: q.kind as QuestionKind,
      };
    });
  }
  let bestMoment: Report["bestMoment"] =
    v.bestMoment === null ? null : undefined;
  if (v.bestMoment !== undefined && v.bestMoment !== null) {
    if (
      !object(v.bestMoment) ||
      !quoted(v.bestMoment.turnId, v.bestMoment.quote) ||
      !str(v.bestMoment.why)
    )
      throw new Error("Moment clé invalide");
    bestMoment = {
      turnId: v.bestMoment.turnId as string,
      quote: v.bestMoment.quote as string,
      why: v.bestMoment.why,
    };
  }
  const result = v as unknown as Report;
  return {
    summary: result.summary,
    strengths: result.strengths,
    priorities: result.priorities,
    skills: result.skills.map((s) => ({
      key: s.key,
      label: s.label,
      score: s.score,
      reason: s.reason,
      evidence: s.evidence.map((e) => ({ turnId: e.turnId, quote: e.quote })),
      missing: s.missing,
      advice: s.advice,
    })),
    indicators: result.indicators.map((i) => ({
      label: i.label,
      value: i.value,
      explanation: i.explanation,
    })),
    ...(discovery ? { discovery } : {}),
    ...(questions ? { questions } : {}),
    ...(bestMoment !== undefined ? { bestMoment } : {}),
  };
}
