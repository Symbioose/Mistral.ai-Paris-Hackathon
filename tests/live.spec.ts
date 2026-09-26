import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
test.skip(
  process.env.RUN_LIVE_SIMULATION !== "1",
  "Explicit opt-in: creates a real demo session and calls the persona and judge.",
);
test.setTimeout(240000);
async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe").fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Votre prochain entretien")).toBeVisible({
    timeout: 20000,
  });
}
test("real Supabase → persona → persisted transcript → judge → trainer report", async ({
  page,
  browser,
}) => {
  const { accounts } = JSON.parse(readFileSync(".env.demo.local", "utf8"));
  const learner = accounts.find((a: { role: string }) => a.role === "student");
  const manager = accounts.find((a: { role: string }) => a.role === "manager");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let sessionId = "";
  page.on("response", async (response) => {
    if (
      response.url().endsWith("/api/simulation/sessions") &&
      response.request().method() === "POST" &&
      response.ok()
    )
      sessionId = (await response.json()).session.id;
  });
  await login(page, learner);
  await page
    .getByRole("button", { name: /Préparer l’entretien/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Entrer dans la salle/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Commencer à l’oral/ }),
  ).toBeEnabled({ timeout: 45000 });
  await page.screenshot({ path: "/tmp/yougotit-live-intro.png" });
  await page.getByRole("button", { name: "Je préfère écrire" }).click();
  await page.getByRole("button", { name: "Couper la voix" }).click();
  const questions = [
    "Bonjour Camille, merci pour votre temps. Pouvez-vous me raconter le dernier incident et ce que vous cherchiez à faire ?",
    "Depuis quand cela se produit-il ? À quels moments et sur quels sites ? Qui rencontre ces difficultés ?",
    "Quelles conséquences cela a-t-il sur votre activité et sur les personnes concernées ? Pouvez-vous donner un exemple chiffré ?",
    "Quels changements ont précédé les incidents ? Quelles observations et mesures permettraient de distinguer les causes possibles ?",
    "À quoi ressemblerait pour vous une situation satisfaisante ? Comment mesureriez-vous cette amélioration et pendant combien de temps ?",
    "Qui utilise le service, qui pourrait nous aider à mesurer le problème et qui décide du budget ? Comment recueillir leur point de vue ?",
    "Quelles contraintes devons-nous respecter pour explorer et tester les pistes ? Je propose de vérifier les faits avec les équipes avant de choisir une solution technique. Ai-je oublié un point essentiel ?",
  ];
  for (let i = 0; i < questions.length; i++) {
    await page.getByLabel("Votre message").fill(questions[i]);
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`Échanges · ${i + 1}$`),
      }),
    ).toBeVisible({ timeout: 40000 });
  }
  await page.screenshot({ path: "/tmp/yougotit-live-conversation.png" });
  await page.getByRole("button", { name: "Terminer", exact: true }).click();
  await page.getByRole("button", { name: /Terminer et analyser/ }).click();
  await expect(page.getByText("a fait émerger.")).toBeVisible({
    timeout: 110000,
  });
  await page.screenshot({
    path: "/tmp/yougotit-live-report.png",
    fullPage: true,
  });
  const detail = await page.request.get(
    `/api/simulation/sessions/${sessionId}`,
  );
  expect(detail.ok()).toBeTruthy();
  const data = await detail.json();
  expect(data.session.status).toBe("completed");
  expect(data.turns).toHaveLength(14);
  expect(data.report.skills).toHaveLength(7);
  for (const skill of data.report.skills)
    for (const evidence of skill.evidence)
      expect(
        data.turns.find((t: { id: string }) => t.id === evidence.turnId)
          ?.content,
      ).toContain(evidence.quote);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: auth, error } = await db.auth.signInWithPassword(learner);
  expect(error).toBeNull();
  expect(
    (await db.from("simulation_versions").select("*")).error,
  ).not.toBeNull();
  expect(
    (
      await db
        .from("profiles")
        .update({ role: "manager" })
        .eq("id", auth.user!.id)
    ).error,
  ).not.toBeNull();
  expect(
    (await db.from("simulation_sessions").select("id").eq("id", sessionId))
      .data,
  ).toHaveLength(1);
  await db.auth.signOut();
  const context = await browser.newContext();
  const trainer = await context.newPage();
  await login(trainer, manager);
  await trainer.getByRole("link", { name: "Studio", exact: true }).click();
  await trainer
    .getByRole("button", { name: /Suivi des apprenants/ })
    .click();
  await expect(
    trainer.locator(`a[href="/simulation?session=${sessionId}"]`),
  ).toBeVisible({ timeout: 15000 });
  await trainer.screenshot({
    path: "/tmp/yougotit-live-studio.png",
    fullPage: true,
  });
  await trainer.locator(`a[href="/simulation?session=${sessionId}"]`).click();
  await expect(trainer.getByText("a fait émerger.")).toBeVisible({
    timeout: 15000,
  });
  await context.close();
  expect(errors).toEqual([]);
  writeFileSync(
    "/tmp/yougotit-live-result.json",
    JSON.stringify(
      {
        sessionId,
        turns: data.turns.length,
        skills: data.report.skills.map((s: { key: string; score: number }) => ({
          key: s.key,
          score: s.score,
        })),
        evaluationMetadata: data.evaluationMetadata,
      },
      null,
      2,
    ),
  );
});
