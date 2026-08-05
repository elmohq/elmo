/**
 * Live scheduling-policy verification (run by the scheduling-policy CI job in
 * .github/workflows/e2e.yaml, or locally against any disposable database).
 *
 * Drives a REAL worker over a REAL database with the no-network stub provider
 * and asserts the run policy's externally observable behavior:
 *
 *   local scenario (worker booted with DEPLOYMENT_MODE=local, stub target):
 *     - legacy volume: one firing records exactly RUNS_PER_PROMPT (5) runs
 *     - dueness metering: an immediate duplicate fire records nothing new
 *       (the maintenance-expedite oversampling fix)
 *     - the chain stays scheduled
 *
 *   cloud scenario (DEPLOYMENT_MODE=cloud, menu models on the stub provider):
 *     - a Pro org's picked platforms run once each (replication 1) and the
 *       prompt's Claude web assignment runs once
 *     - duplicate fire records nothing new
 *     - canceling the subscription stops due targets from running
 *     - resubscribing revives tracking via schedule-maintenance
 *
 * Scenario is argv[2]: local | cloud. DATABASE_URL env overrides the default
 * local connection string. The worker must already be running in the matching
 * mode — see the workflow for the exact env.
 */
import pg from "pg";
import { PgBoss } from "pg-boss";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://elmo:elmo@127.0.0.1:5432/elmo";
const scenario = process.argv[2];

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const boss = new PgBoss(DATABASE_URL);
boss.on("error", () => {});
await boss.start();

async function sendJob(promptId) {
  await boss.send("process-prompt", { promptId }, { retryLimit: 0, expireInSeconds: 900 });
}

async function runCount(promptId) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM prompt_runs WHERE prompt_id = $1", [promptId]);
  return rows[0].n;
}

async function waitFor(fn, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function assert(cond, message) {
  if (!cond) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log(`✓ ${message}`);
}

if (scenario === "local") {
  const { rows: [prompt] } = await client.query(
    "INSERT INTO prompts (brand_id, value, enabled) VALUES ('default', 'scheduling e2e — legacy volume', true) RETURNING id",
  );
  try {
    await sendJob(prompt.id);
    await waitFor(async () => (await runCount(prompt.id)) > 0, 120000, "first runs");
    await new Promise((r) => setTimeout(r, 5000));
    const count = await runCount(prompt.id);
    assert(count === 5, `legacy volume: exactly RUNS_PER_PROMPT (5) runs recorded (got ${count})`);
    const { rows } = await client.query(
      "SELECT DISTINCT model, version FROM prompt_runs WHERE prompt_id = $1", [prompt.id]);
    assert(rows.length === 1 && rows[0].model === "stub" && rows[0].version === "stub", "runs carry the stub target");

    await sendJob(prompt.id);
    await new Promise((r) => setTimeout(r, 8000));
    const after = await runCount(prompt.id);
    assert(after === 5, `dueness metering: an immediate re-fire adds no runs (got ${after})`);

    const { rows: pending } = await client.query(
      "SELECT COUNT(*)::int AS n FROM pgboss.job WHERE name='process-prompt' AND state='created' AND data->>'promptId' = $1",
      [prompt.id]);
    assert(pending[0].n >= 1, "chain alive: a future job is scheduled");
  } finally {
    await client.query("DELETE FROM usage_events WHERE prompt_id = $1", [prompt.id]);
    await client.query("DELETE FROM prompt_runs WHERE prompt_id = $1", [prompt.id]);
    await client.query("DELETE FROM prompts WHERE id = $1", [prompt.id]);
  }
} else if (scenario === "cloud") {
  await client.query("DELETE FROM usage_events WHERE brand_id = 'cloudbrand-1'");
  await client.query("DELETE FROM prompt_runs WHERE brand_id = 'cloudbrand-1'");
  await client.query("DELETE FROM prompts WHERE brand_id = 'cloudbrand-1'");
  await client.query("DELETE FROM brands WHERE id = 'cloudbrand-1'");
  await client.query("DELETE FROM subscription WHERE reference_id = 'cloudorg-1'");
  await client.query("DELETE FROM organization_settings WHERE organization_id = 'cloudorg-1'");
  await client.query("DELETE FROM organization WHERE id = 'cloudorg-1'");

  await client.query(
    "INSERT INTO organization (id, name, slug, created_at) VALUES ('cloudorg-1', 'Cloud Verify', 'cloud-verify', NOW())");
  // Seeding the subscription row directly is faithful to production state:
  // the row is exactly what the Stripe webhook maintains.
  await client.query(
    `INSERT INTO subscription (id, plan, reference_id, status, period_start, period_end)
     VALUES ('sub-verify-1', 'pro', 'cloudorg-1', 'active', NOW() - interval '1 day', NOW() + interval '29 days')`);
  await client.query(
    `INSERT INTO brands (id, organization_id, name, website, enabled, onboarded, enabled_models, created_at, updated_at)
     VALUES ('cloudbrand-1', 'cloudorg-1', 'Cloud Verify Brand', 'https://verify.example', true, true, '{chatgpt,perplexity}', NOW(), NOW())`);
  const { rows: [prompt] } = await client.query(
    "INSERT INTO prompts (brand_id, value, enabled, claude_mode) VALUES ('cloudbrand-1', 'scheduling e2e — cloud policy', true, 'web') RETURNING id");

  await sendJob(prompt.id);
  await waitFor(async () => (await runCount(prompt.id)) > 0, 120000, "cloud runs");
  await new Promise((r) => setTimeout(r, 5000));
  const { rows: runs } = await client.query(
    "SELECT model, web_search_enabled, COUNT(*)::int AS n FROM prompt_runs WHERE prompt_id = $1 GROUP BY 1,2 ORDER BY 1,2",
    [prompt.id]);
  const shape = runs.map((r) => `${r.model}:${r.web_search_enabled ? "web" : "base"}=${r.n}`).join(",");
  assert(
    shape === "chatgpt:base=1,claude:web=1,perplexity:base=1",
    `cloud volume: picked platforms + claude web, replication 1 (got ${shape})`,
  );

  const { rows: [usage] } = await client.query(
    "SELECT COUNT(*)::int AS n FROM usage_events WHERE prompt_id = $1 AND organization_id = 'cloudorg-1' AND event_type = 'prompt_run'",
    [prompt.id]);
  assert(usage.n === 3, `usage metering: one attributable event per provider call (got ${usage.n})`);

  await sendJob(prompt.id);
  await new Promise((r) => setTimeout(r, 8000));
  assert((await runCount(prompt.id)) === 3, "cloud dueness: re-fire adds nothing");

  // Cancel → due targets stop running. (A pre-cancel singleton future job may
  // still drain once; it parks on firing.)
  await client.query("UPDATE subscription SET status = 'canceled' WHERE id = 'sub-verify-1'");
  await client.query("UPDATE prompt_runs SET created_at = created_at - interval '2 days' WHERE prompt_id = $1", [prompt.id]);
  await sendJob(prompt.id);
  await new Promise((r) => setTimeout(r, 8000));
  assert((await runCount(prompt.id)) === 3, "canceled org: due targets do not run");

  // Resubscribe → maintenance revives within one tick.
  await client.query("UPDATE subscription SET status = 'active' WHERE id = 'sub-verify-1'");
  await boss.send("schedule-maintenance", { source: "verify" }, { retryLimit: 0 });
  await waitFor(async () => (await runCount(prompt.id)) > 3, 120000, "revival runs");
  const revived = await runCount(prompt.id);
  assert(revived === 6, `resubscribe: maintenance revives the chain and due targets run (got ${revived})`);
} else {
  console.error("scenario must be local or cloud");
  process.exit(2);
}

await boss.stop({ graceful: false });
await client.end();
console.log(`\n${scenario} scheduling verification PASSED`);
