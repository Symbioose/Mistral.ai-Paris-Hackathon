import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  publicScenario,
  validateConfig,
  validateReport,
  type Report,
  type Turn,
} from "../app/lib/simulation/contracts";
import demo from "../data/simulation/incident-it.v1.json";
import corpus from "../data/simulation/judge-fixtures.v1.json";
const config = validateConfig(demo);
const turns: Turn[] = [
  {
    id: "u1",
    role: "user",
    content: "Quel effet sur votre activité ?",
    created_at: "",
  },
  {
    id: "a1",
    role: "assistant",
    content: "Une perte de quarante minutes.",
    created_at: "",
  },
];
const report = (): Report => ({
  summary: "Entretien bref.",
  strengths: ["Question pertinente."],
  priorities: ["Approfondir."],
  skills: config.rubric.map((r) => ({
    key: r.key,
    label: r.label,
    score: 1,
    reason: "Preuve observée.",
    evidence: [{ turnId: "u1", quote: "Quel effet" }],
    missing: [],
    advice: "Approfondir le contexte.",
  })),
  indicators: [],
});
test("demo has seven stable skills and flexible modules", () => {
  assert.equal(config.rubric.length, 7);
  assert.equal(config.modules.length, 4);
});
test("public scenario excludes hidden facts, rubric and prompt", () => {
  const value = publicScenario("scenario", config);
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      "id",
      "title",
      "brief",
      "personaName",
      "personaRole",
      "durationMinutes",
      "avatarUrl",
      "modules",
      "voice",
      "learnerHints",
    ].sort(),
  );
  assert.ok(!JSON.stringify(value).includes(config.modules[0].instructions));
  assert.ok(!JSON.stringify(value).includes(config.persona.hiddenFacts[0]));
});
test("configuration rejects duplicated skill keys and invalid modules", () => {
  const x = structuredClone(demo);
  x.rubric[1].key = x.rubric[0].key;
  assert.throws(() => validateConfig(x));
  const y = structuredClone(demo);
  y.modules[0].number = -1;
  assert.throws(() => validateConfig(y));
});
test("custom competency sets accepted without application changes", () => {
  const x = structuredClone(demo);
  x.rubric = x.rubric.slice(0, 2);
  x.rubric[0].key = "new_competency";
  assert.equal(validateConfig(x).rubric.length, 2);
});
test("valid exact learner quote accepted", () =>
  assert.deepEqual(validateReport(report(), config, turns), report()));
test("invented quotation rejected", () => {
  const r = report();
  r.skills[0].evidence[0].quote = "Invented quote";
  assert.throws(() => validateReport(r, config, turns));
});
test("assistant words never count as learner evidence", () => {
  const r = report();
  r.skills[0].evidence = [{ turnId: "a1", quote: "Une perte" }];
  assert.throws(() => validateReport(r, config, turns));
});
test("wrong turn reference rejected even if quote exists elsewhere", () => {
  const r = report();
  r.skills[0].evidence[0].turnId = "missing";
  assert.throws(() => validateReport(r, config, turns));
});
test("positive score without evidence rejected; zero or null allowed", () => {
  const r = report();
  r.skills[0].evidence = [];
  assert.throws(() => validateReport(r, config, turns));
  r.skills[0].score = 0;
  validateReport(r, config, turns);
  r.skills[0].score = null;
  validateReport(r, config, turns);
});
test("nonfinite/out of range scores, duplicate and omitted competencies rejected", () => {
  for (const score of [5, -1, 1.5, Infinity, NaN]) {
    const r = report();
    r.skills[0].score = score;
    assert.throws(() => validateReport(r, config, turns));
  }
  const r = report();
  r.skills[1] = r.skills[0];
  assert.throws(() => validateReport(r, config, turns));
  const s = report();
  s.skills.pop();
  assert.throws(() => validateReport(s, config, turns));
});
test("fixture corpus provides 24 distinct scenarios with exact stable skill expectations", () => {
  assert.equal(corpus.fixtures.length, 24);
  assert.equal(new Set(corpus.fixtures.map((f) => f.id)).size, 24);
  for (const f of corpus.fixtures) {
    assert.deepEqual(
      Object.keys(f.expected),
      config.rubric.map((r) => r.key),
    );
    assert.ok(f.transcript.some((t) => t.role === "user"));
    assert.equal(
      new Set(f.transcript.map((t) => t.id)).size,
      f.transcript.length,
    );
  }
});
test("SQL exposes no authenticated write policy or private config read grant", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/202609250001_simulation.sql",
    "utf8",
  );
  assert.ok(!/create policy[^;]+for (insert|update|all)/i.test(sql));
  assert.ok(
    !/grant select on public\.simulation_(scenarios|versions) to authenticated/i.test(
      sql,
    ),
  );
  assert.match(sql, /revoke all on function public\.simulation_publish/);
  assert.match(sql, /lease_token=token and lease_until>now\(\)/);
  assert.match(sql, /prompt_version/);
});

test("discovery map must cover every hidden fact and cite learner turns only", () => {
  const full = config.persona.hiddenFacts.map((_, fact) => ({
    fact,
    theme: "Thème",
    discovered: false,
    turnId: null,
  }));
  const r: Report = { ...report(), discovery: full };
  assert.equal(validateReport(r, config, turns).discovery!.length, full.length);
  assert.throws(() =>
    validateReport({ ...report(), discovery: full.slice(1) }, config, turns),
  );
  const viaPersona = structuredClone(full);
  viaPersona[0] = {
    fact: 0,
    theme: "Thème",
    discovered: true,
    turnId: "a1",
  } as never;
  assert.throws(() =>
    validateReport({ ...report(), discovery: viaPersona }, config, turns),
  );
  const ok = structuredClone(full);
  ok[0] = { fact: 0, theme: "Thème", discovered: true, turnId: "u1" } as never;
  validateReport({ ...report(), discovery: ok }, config, turns);
});
test("question kinds and best moment require exact learner quotes", () => {
  validateReport(
    {
      ...report(),
      questions: [{ turnId: "u1", quote: "Quel effet", kind: "open" }],
      bestMoment: { turnId: "u1", quote: "Quel effet", why: "Ouvre le sujet." },
    },
    config,
    turns,
  );
  assert.throws(() =>
    validateReport(
      {
        ...report(),
        questions: [
          { turnId: "u1", quote: "Quel effet", kind: "rhetorical" as never },
        ],
      },
      config,
      turns,
    ),
  );
  assert.throws(() =>
    validateReport(
      { ...report(), bestMoment: { turnId: "u1", quote: "Inventé", why: "x" } },
      config,
      turns,
    ),
  );
});
test("persona prompt carries scenario data and resolves versioned default rules", async () => {
  const { personaSystemPrompt } = await import("../app/lib/simulation/persona");
  const prompt = personaSystemPrompt(config, 2);
  assert.ok(prompt.includes(config.persona.hiddenFacts[3]));
  assert.ok(prompt.includes(config.modules[1].instructions));
  assert.match(prompt, /ne commentes jamais ses questions/);
});
test("conversation model references resolve provider and model", async () => {
  process.env.MISTRAL_API_KEY ||= "test";
  process.env.OPENAI_API_KEY ||= "test";
  const { conversationClient } = await import("../app/lib/simulation/models");
  assert.deepEqual(
    [
      conversationClient("mistral:open-mistral-nemo").provider,
      conversationClient("mistral:open-mistral-nemo").model,
    ],
    ["mistral", "open-mistral-nemo"],
  );
  assert.equal(conversationClient("gpt-4.1-mini").provider, "openai");
});

test("legacy config resolves versioned prompt snapshots and custom templates are preserved", async () => {
  const legacy = validateConfig(demo);
  assert.ok(legacy.prompts?.persona);
  assert.ok(legacy.prompts?.judge);
  assert.ok(legacy.prompts?.version);
  const custom = validateConfig({
    ...demo,
    prompts: {
      version: "trainer-v2",
      persona: "Personnage: {{personaName}}. {{personaInstructions}}",
      judge: "Évaluer avec cette consigne: {{judgePrompt}}. {{outputSchema}}",
    },
    learnerHints: [{ title: "Contexte", example: "Que se passe-t-il ?" }],
  });
  const { personaSystemPrompt } = await import("../app/lib/simulation/persona");
  const { judgeMessages } = await import("../app/lib/simulation/judge");
  assert.match(personaSystemPrompt(custom, 1), /Personnage: Camille/);
  assert.ok(!personaSystemPrompt(custom, 1).includes("COMMENT TU PARLES"));
  assert.ok(
    judgeMessages(custom, turns, 1)[0].content.includes(
      "Évaluer avec cette consigne",
    ),
  );
  assert.deepEqual(publicScenario("id", custom).learnerHints, [
    { title: "Contexte", example: "Que se passe-t-il ?" },
  ]);
  assert.throws(() =>
    validateConfig({ ...demo, prompts: { version: "missing templates" } }),
  );
});
test("anchor scores must be unique integers", () => {
  const duplicated = structuredClone(demo);
  duplicated.rubric[0].anchors[1].score = duplicated.rubric[0].anchors[0].score;
  assert.throws(() => validateConfig(duplicated));
  const fractional = structuredClone(demo);
  fractional.rubric[0].anchors[0].score = 0.5;
  assert.throws(() => validateConfig(fractional));
});
test("request parsing rejects nonobjects, cross-site requests and oversize streams", async () => {
  const { body, HttpError } = await import("../app/lib/simulation/http");
  const request = (text: string, headers: Record<string, string> = {}) =>
    new Request("https://yougotit.test/api", {
      method: "POST",
      body: text,
      headers,
    });
  for (const value of ["null", "[]", '"hello"', "42"])
    await assert.rejects(
      body(request(value)),
      (e) => e instanceof HttpError && e.status === 400,
    );
  await assert.rejects(
    body(request("{}", { origin: "https://evil.test" })),
    (e) => e instanceof HttpError && e.status === 403,
  );
  await assert.rejects(
    body(request("{}", { "sec-fetch-site": "cross-site" })),
    (e) => e instanceof HttpError && e.status === 403,
  );
  await assert.rejects(
    body(request(JSON.stringify({ text: "a".repeat(160000) }))),
    (e) => e instanceof HttpError && e.status === 413,
  );
  assert.deepEqual(
    await body(
      request('{"moduleNumber":1}', { origin: "https://yougotit.test" }),
    ),
    { moduleNumber: 1 },
  );
});
test("custom rubric preview never invents expected scores or a pass", async () => {
  const { compareFixture } = await import("../app/lib/simulation/preview");
  const c = validateConfig({
    ...demo,
    rubric: [{ ...demo.rubric[0], key: "custom" }],
  });
  const result = compareFixture(
    c,
    { ...report(), skills: [{ ...report().skills[0], key: "custom" }] },
    corpus.fixtures[0],
  );
  assert.equal(result.passed, null);
  assert.deepEqual(result.deviations, []);
});
test("judge corrects one invalid report within same budget and preserves stored prompt version", async (t) => {
  process.env.OPENAI_API_KEY ||= "test";
  const { judge } = await import("../app/lib/simulation/judge");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(
      JSON.stringify({
        model: "judge-actual",
        choices: [
          { message: { content: JSON.stringify(calls === 1 ? {} : report()) } },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  const c = validateConfig({
    ...demo,
    prompts: { ...config.prompts!, version: "custom-snapshot-v3" },
  });
  const result = await judge(c, turns, 1, { deadlineMs: 5000 });
  assert.equal(calls, 2);
  assert.equal(result.promptVersion, "custom-snapshot-v3");
  assert.equal(result.model, "judge-actual");
});
test("preview judge makes only one call, and provider 429 is not retried", async (t) => {
  const { judge } = await import("../app/lib/simulation/judge");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(
      JSON.stringify({ error: { message: "Rate limited" } }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  });
  await assert.rejects(
    judge(config, turns, 1, { maxAttempts: 1, deadlineMs: 1000 }),
  );
  assert.equal(calls, 1);
});
test("judge total deadline aborts the provider call", async (t) => {
  const { judge } = await import("../app/lib/simulation/judge");
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      calls++;
      return new Promise<Response>((_, reject) => {
        const signal = init.signal;
        if (signal?.aborted) reject(new Error("aborted"));
        else
          signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
      });
    },
  );
  const keepAlive = setTimeout(() => {}, 1000);
  const started = Date.now();
  try {
    await assert.rejects(judge(config, turns, 1, { deadlineMs: 30 }));
    assert.equal(calls, 1);
    assert.ok(Date.now() - started < 500);
  } finally {
    clearTimeout(keepAlive);
  }
});
test("profile bootstrap trusts admin metadata, never editable role metadata", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/202609260001_trusted_profile_roles.sql",
    "utf8",
  );
  assert.match(sql, /raw_app_meta_data->>'role'/);
  assert.ok(!sql.includes("raw_user_meta_data->>'role'"));
  assert.match(sql, /current_user in \('authenticated','anon'\)/);
});
