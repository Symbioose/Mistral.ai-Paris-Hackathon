# Simulation content and calibration

`incident-it.v1.json` is the editable demo source, with persona facts, module instructions, judge prompt, reference and seven competency definitions. Managers load this source from the admin editor, save a draft, then publish. Publication creates an immutable database snapshot. Editing a draft never changes past sessions. Rubric keys are stable within a version; custom scenarios may contain 1–30 unique keys without deploying code.

The demo and published API responses explicitly mark calibration as provisional. `judge-fixtures.v1.json` contains 24 synthetic conversations with authored score expectations and tolerance. These expectations require EPITA validation after 20 October 2026; they do not establish grader accuracy. Runtime scores always come from the model and validated learner evidence. No lexical scoring or synthetic fallback exists.

Apply `supabase/migrations/202609250001_simulation.sql` through your authorized Supabase workflow before using the API. This repository does not auto-apply remote migrations or silently seed data. The authenticated manager editor can create and publish the demo once the migration is applied. Hidden configurations and draft content have no authenticated database read grants; the server projects public metadata explicitly. Session, transcript and report reads are restricted to the learner and manager who owns the scenario. Writes and atomic lease functions are service-role only.

Environment: existing Supabase URL, anon key and service role; `OPENAI_API_KEY`; `MISTRAL_API_KEY`; optional `SIMULATION_CONVERSATION_MODEL` (`provider:model`, default `mistral:open-mistral-nemo`) and `SIMULATION_JUDGE_MODEL` (default `gpt-4.1`); `GRADIUM_API_KEY` and optional `GRADIUM_VOICE_ID` for voice (without Gradium: Deepgram STT + OpenAI TTS fallback). Scenario `voice` sets the fallback voice and speaking style. Conversation model choice is pinned on session creation; the actual persona response model is persisted with its turn and the actual judge response model with its report.

Commands:

```sh
node --import tsx --test tests/simulation.test.ts
node --import tsx scripts/evaluate-simulation.ts --dry-run
npm run eval:judge -- --repeat=3 --compare=previous.json   # median + stability; judge is not fully deterministic
npm run simulate -- --style=average                        # full simulated interview + report
node --env-file=.env.local --import tsx scripts/evaluate-simulation.ts --fixture=complete-discovery
node --env-file=.env.local --import tsx scripts/evaluate-simulation.ts --output=/tmp/simulation-calibration.json
```

The final command makes 24 paid model calls. Results include model, corpus version, full report, per-skill deviations and errors. It exits nonzero on invalid output or scores outside tolerance. The deterministic suite checks content/quote validation and static SQL access restrictions; actual RLS isolation and lease behavior still need a migrated database integration test.

Turn retries must reuse the same UUID requestId and text. Successfully committed responses replay idempotently. Concurrent work returns 409. Paired learner/persona turns commit atomically only after generation succeeds; streamed partial text must not be treated as persisted before `done`. A failed generation leaves history unchanged. A successful final report is immutable and replayed; failures mark evaluation_failed and require an explicit retry. Expired leases can be reclaimed after 180 seconds; fencing prevents an older worker from committing.

## Editable prompt templates and Studio preview

`prompts: {version,persona,judge}` stores the complete editable pedagogical templates. Missing templates on legacy drafts resolve from `prompt-templates.v1.json`; saving and publishing snapshot the resolved templates in the immutable scenario version. Runtime security framing and output validation remain enforced in code. Template substitution is single-pass. Persona placeholders: `{{personaName}}`, `{{personaRole}}`, `{{personaInstructions}}`, `{{hiddenFacts}}`, `{{module}}`. Judge placeholders: `{{factCount}}`, `{{outputSchema}}`, `{{judgePrompt}}`. `learnerHints: [{title,example}]` is optional and projected to the learner without private instructions.

`GET /api/simulation/admin` lists available fixture identifiers. `POST /api/simulation/admin/test` takes `{config,fixtureId}` and makes at most one judge call, persisting nothing. It returns the validated report and provisional deviations; custom rubrics or changed reference/facts return `passed:null` and no authored expectations. The full CLI harness retains repeated runs and drift comparison. Prompt templates default to version `judge-2026-09-26.1`; this new version still requires repeated calibration runs.

Session history defaults to the signed-in learner's own sessions. `?scope=cohort` requires manager role and returns only sessions belonging to that manager's scenarios, with safe learner names, version/model metadata and reports. Queries are batched. Existing snake-case dates remain aliases of the camel-case session fields.

The judge shares a 95-second deadline across both possible attempts and has no SDK retries. Invalid output permits one corrective attempt; provider errors require an explicit user retry. Studio preview permits a single attempt. Mutation requests reject cross-site origins, nonobject JSON and bodies over 160 KB. The trusted role migration prevents user-editable signup metadata from granting manager privileges; invited managers are promoted by the server after an atomic invitation claim.
