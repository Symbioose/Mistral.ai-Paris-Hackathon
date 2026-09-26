import { test, expect, type Page } from "@playwright/test";
import config from "../data/simulation/incident-it.v1.json";
const uid = "00000000-0000-4000-8000-000000000001";
const sid = "10000000-0000-4000-8000-000000000001";
const scenario = {
  id: "20000000-0000-4000-8000-000000000001",
  title: config.title,
  brief: config.brief,
  personaName: config.personaName,
  personaRole: config.personaRole,
  durationMinutes: config.durationMinutes,
  modules: config.modules.map((m) => ({ number: m.number, title: m.title })),
  learnerHints: [],
};
const session = {
  id: sid,
  status: "active",
  moduleNumber: 1,
  created_at: new Date().toISOString(),
  scenarioVersionId: "v1",
  learnerId: uid,
};
async function login(page: Page, role = "student") {
  // Browser auth is mocked: never send its synthetic cookie to the real server's auth refresh.
  await page.route("http://127.0.0.1:3017/**", async (route) => {
    if (
      ["/", "/studio", "/simulation"].includes(
        new URL(route.request().url()).pathname,
      )
    ) {
      const response = await route.fetch({
        headers: { ...route.request().headers(), cookie: "" },
      });
      return route.fulfill({ response });
    }
    return route.fallback();
  });
  const user = {
    id: uid,
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await page.route("**/auth/v1/**", (r) =>
    r.fulfill({
      json: r.request().url().includes("/token")
        ? {
            access_token: token,
            refresh_token: "test",
            token_type: "bearer",
            expires_in: 3600,
            user,
          }
        : user,
    }),
  );
  await page.route("**/rest/v1/profiles**", (r) =>
    r.fulfill({
      json: {
        id: uid,
        role,
        full_name: "Alex Martin",
        avatar_url: null,
      },
    }),
  );
  await page.route("**/api/simulation/catalog", (r) =>
    r.fulfill({ json: { scenarios: [scenario], voiceAvailable: false } }),
  );
  await page.route("**/api/simulation/voice/token", (r) =>
    r.fulfill({ json: { provider: "unavailable" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.getByLabel("Adresse e-mail").fill("test@example.com");
  await page.getByLabel("Mot de passe").fill("test-password");
  await page.getByRole("button", { name: "Retrouver mon espace" }).click();
  await expect(page.getByText("Votre prochain échange")).toBeVisible();
}

test("real avatar loads, one exchange appears once, citations reopen the transcript", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const turns: {
    id: string;
    role: string;
    content: string;
    created_at: string;
  }[] = [];
  const question = "Pouvez-vous me raconter le dernier incident ?";
  const answer =
    "Hier matin, les préparateurs ont dû attendre avant de reprendre les commandes.";
  const report = {
    summary: "Vous avez ouvert l’échange sur un incident concret.",
    strengths: ["Une question ouverte permet au client de raconter."],
    priorities: ["Explorez ensuite les conséquences pour les équipes."],
    skills: config.rubric.map((s) => ({
      key: s.key,
      label: s.label,
      score: 2,
      reason: "Vous amorcez une exploration concrète.",
      evidence: [{ turnId: "u1", quote: question }],
      missing: ["Les impacts métier"],
      advice: "Demandez : « Qu’est-ce que cela change pour vos équipes ? »",
    })),
    indicators: [],
    discovery: config.persona.hiddenFacts.map((_, fact) => ({
      fact,
      theme: `Dimension ${fact + 1}`,
      discovered: fact === 0,
      turnId: fact === 0 ? "u1" : null,
    })),
    questions: [{ turnId: "u1", quote: question, kind: "open" }],
    bestMoment: {
      turnId: "u1",
      quote: question,
      why: "Vous laissez votre interlocuteur raconter.",
    },
  };
  await page.route("**/api/simulation/sessions", (r) =>
    r.fulfill({
      json:
        r.request().method() === "POST"
          ? { session, scenario, turns: [], report: null }
          : { sessions: [] },
    }),
  );
  await page.route(`**/api/simulation/sessions/${sid}`, (r) =>
    r.fulfill({ json: { session, scenario, turns, report: null } }),
  );
  await page.route(`**/api/simulation/sessions/${sid}/turn`, (r) => {
    turns.push(
      {
        id: "u1",
        role: "user",
        content: question,
        created_at: new Date().toISOString(),
      },
      {
        id: "a1",
        role: "assistant",
        content: answer,
        created_at: new Date().toISOString(),
      },
    );
    return r.fulfill({
      contentType: "text/event-stream",
      body: `event: delta\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {"turnId":"a1"}\n\n`,
    });
  });
  await page.route(`**/api/simulation/sessions/${sid}/evaluate`, (r) =>
    r.fulfill({ json: { report } }),
  );
  await login(page);
  await page.getByRole("button", { name: /Préparer mon entretien/ }).click();
  await page
    .getByRole("button", { name: /Rencontrer mon interlocuteur/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Commencer à l’oral/ }),
  ).toBeEnabled({ timeout: 45000 });
  await page.screenshot({ path: "/tmp/yougotit-avatar-desktop.png" });
  await page.getByRole("button", { name: "Je préfère écrire" }).click();
  await page.getByRole("button", { name: "Couper la voix" }).click();
  await page.getByLabel("Votre message").fill(question);
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(
    page.getByRole("button", { name: /Afficher les échanges \(2\)/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Afficher les échanges/ }).click();
  await expect(
    page
      .getByLabel("Transcription de l’entretien")
      .getByText(answer, { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: /Terminer l’entretien/ }).click();
  await page.getByRole("button", { name: /Terminer et analyser/ }).click();
  await expect(page.getByText("Chaque échange")).toBeVisible();
  await page.getByRole("button", { name: /VOTRE MEILLEUR MOMENT/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/yougotit-report-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile landing has no horizontal overflow and login stays usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /Entrer dans mon espace/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Entrer dans mon espace/ }).click();
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
  await page.screenshot({ path: "/tmp/yougotit-mobile.png" });
});

test("Studio tests the current draft, invalidates stale results and opens learner history", async ({
  page,
}) => {
  await page.route("**/api/simulation/sessions", (r) =>
    r.fulfill({ json: { sessions: [] } }),
  );
  await page.route("**/api/simulation/sessions?scope=cohort", (r) =>
    r.fulfill({
      json: {
        sessions: [
          {
            ...session,
            learnerName: "Alex Martin",
            scenario,
            report: { summary: "Rapport existant" },
          },
        ],
      },
    }),
  );
  await page.route("**/api/simulation/admin", (r) =>
    r.fulfill({
      json: {
        scenarios: [],
        demoConfig: config,
        fixtures: [{ id: "complete-discovery", moduleNumber: 1 }],
      },
    }),
  );
  let testedTitle = "";
  await page.route("**/api/simulation/admin/test", (r) => {
    testedTitle = r.request().postDataJSON().config.title;
    return r.fulfill({
      json: {
        passed: false,
        model: "test-judge",
        promptVersion: "v1",
        report: { summary: "Une dimension manque." },
        deviations: [
          {
            key: "need_context",
            actual: 1,
            expected: 3,
            withinTolerance: false,
          },
        ],
      },
    });
  });
  await login(page, "manager");
  await page.getByRole("link", { name: "Studio pédagogique" }).click();
  await page
    .getByRole("textbox", { name: "Titre", exact: true })
    .fill("Incident de production");
  await page.getByRole("button", { name: "Tester ce brouillon" }).click();
  await expect(page.getByText("Écarts à examiner")).toBeVisible();
  expect(testedTitle).toBe("Incident de production");
  await page.getByRole("textbox", { name: "Titre", exact: true }).fill("Nouvelle version");
  await expect(page.getByText("Écarts à examiner")).toHaveCount(0);
  await page.getByRole("button", { name: "Parcours des apprenants" }).click();
  await expect(
    page.getByRole("heading", { name: "Alex Martin" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Consulter le rapport" }),
  ).toHaveAttribute("href", `/simulation?session=${sid}`);
});
