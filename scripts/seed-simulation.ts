// Idempotent demo provisioning. Credentials stay in the ignored local file.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { validateConfig } from "../app/lib/simulation/contracts";
import demo from "../data/simulation/incident-it.v1.json";

async function main() {
  const credentialsPath = ".env.demo.local";
  const saved = existsSync(credentialsPath)
    ? JSON.parse(readFileSync(credentialsPath, "utf8"))
    : null;
  const accounts = saved?.accounts || [
    {
      email: process.env.SEED_MANAGER_EMAIL || "formateur@yougotit.demo",
      password:
        process.env.SEED_PASSWORD || randomBytes(24).toString("base64url"),
      full_name: "Formateur EPITA",
      role: "manager",
    },
    {
      email: process.env.SEED_LEARNER_EMAIL || "apprenant@yougotit.demo",
      password:
        process.env.SEED_PASSWORD || randomBytes(24).toString("base64url"),
      full_name: "Philippe Durand",
      role: "student",
    },
  ];
  // Persist before provisioning so an interrupted run keeps the generated passwords.
  writeFileSync(credentialsPath, JSON.stringify({ accounts }, null, 2), {
    mode: 0o600,
  });
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const ids: Record<string, string> = {};
  for (const a of accounts) {
    let user;
    let page = 1;
    for (;;) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: 100,
      });
      if (error) throw error;
      user = data.users.find((u) => u.email === a.email);
      if (user || data.users.length < 100) break;
      page++;
    }
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email: a.email,
        password: a.password,
        email_confirm: true,
        user_metadata: { full_name: a.full_name },
        app_metadata: { role: a.role },
      });
      if (error) throw error;
      user = data.user;
      console.log(`Compte démo créé : ${a.role}`);
    }
    const { error } = await db
      .from("profiles")
      .upsert({ id: user.id, role: a.role, full_name: a.full_name });
    if (error) throw error;
    ids[a.role] = user.id;
  }
  const config = validateConfig(demo);
  const { data: existing, error } = await db
    .from("simulation_scenarios")
    .select("id,published_version_id")
    .eq("owner_id", ids.manager)
    .eq("draft_config->>title", config.title)
    .limit(2);
  if (error) throw error;
  if (existing.length > 1)
    throw new Error(
      "Plusieurs scénarios démo portent ce titre : choisissez explicitement celui à modifier.",
    );
  let scenarioId = existing[0]?.id;
  if (!scenarioId) {
    const { data, error } = await db
      .from("simulation_scenarios")
      .insert({ owner_id: ids.manager, draft_config: config })
      .select("id")
      .single();
    if (error) throw error;
    scenarioId = data.id;
  }
  let published = null;
  if (existing[0]?.published_version_id) {
    const { data, error } = await db
      .from("simulation_versions")
      .select("config")
      .eq("id", existing[0].published_version_id)
      .single();
    if (error) throw error;
    published = data.config;
  }
  if (!isDeepStrictEqual(published, config)) {
    const { error: saveError } = await db
      .from("simulation_scenarios")
      .update({ draft_config: config })
      .eq("id", scenarioId);
    if (saveError) throw saveError;
    const { error: publishError } = await db.rpc("simulation_publish", {
      scenario: scenarioId,
      manager: ids.manager,
    });
    if (publishError) throw publishError;
    console.log("Scénario de démonstration publié.");
  } else console.log("Scénario déjà à jour : aucune nouvelle version.");
  console.log(
    `Identifiants de démonstration conservés localement dans ${credentialsPath} (non versionné).`,
  );
}
main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
