/**
 * Live scheduling-policy verification (run by the scheduling-policy CI job in
 * .github/workflows/e2e.yaml, or locally against any disposable database).
 *
 * Drives a REAL worker over a REAL database with the no-network stub provider
 * and asserts the run policy's externally observable behavior:
 *
 *   local scenario (worker booted with DEPLOYMENT_MODE=local, stub target):
 *     - legacy volume: one firing records exactly 5 runs (RUNS_PER_PROMPT)
 *     - dueness metering: an immediate duplicate fire records nothing new
 *     - the chain stays scheduled
 *
 *   cloud scenario (DEPLOYMENT_MODE=cloud, menu models on the stub provider):
 *     - a Pro org's picked platforms run once each (replication 1) and the
 *       prompt's Claude web assignment runs once
 *     - duplicate fire records nothing new
 *     - canceling the subscription stops due targets from running
 *     - resubscribing revives tracking via schedule-maintenance
 *
 *   expedite scenario (DEPLOYMENT_MODE=cloud, same targets as cloud):
 *     - a finished job does not block the next send for the same prompt
 *     - adding a premium model to a prompt runs that model now, and re-runs
 *       nothing that is still fresh
 *
 * Scenario is argv[2]: local | cloud | expedite. DATABASE_URL env overrides the
 * default local connection string. The worker must already be running in the
 * matching mode — see the workflow for the exact env.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { getRunsPerPrompt } from "@workspace/lib/constants";
import {
  expeditePromptRuns,
  IMMEDIATE_SINGLETON_SECONDS,
  PROMPT_QUEUE,
  promptJobSendOptions,
} from "@workspace/lib/prompt-jobs";

const RUNS_PER_PROMPT = getRunsPerPrompt();
import { DATABASE_URL as FIXTURES_DATABASE_URL } from "../fixtures.js";

const DATABASE_URL = process.env.DATABASE_URL ?? FIXTURES_DATABASE_URL;
const scenario = process.argv[2];

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const boss = new PgBoss(DATABASE_URL);
boss.on("error", () => {});
await boss.start();

/**
 * Fire a prompt's cycle directly, bypassing queue dedup. The local and cloud
 * scenarios use this to assert what the run policy does once a job reaches the
 * worker, which is independent of how the job got queued.
 */
async function sendJob(promptId: string) {
  await boss.send(PROMPT_QUEUE, { promptId }, { retryLimit: 0, expireInSeconds: 900 });
}

/**
 * Queue a prompt the way production does. The addressing matters as much as the
 * payload: a send that collides with an existing job is dropped rather than
 * rejected, so a caller that invents its own options can never observe that.
 */
async function sendPromptJob(promptId: string): Promise<string | null> {
  return boss.send(PROMPT_QUEUE, { promptId }, { ...promptJobSendOptions(promptId), retryLimit: 0 });
}

/**
 * Sends are deduplicated per fixed-width time slot, so a pair of sends only
 * proves anything about each other when they share one. Step over a boundary
 * rather than race it. The headroom covers the slowest gap either pair below
 * can open: one worker cycle plus its polling latency.
 */
async function awaitSlotHeadroom(): Promise<void> {
  const slotMs = IMMEDIATE_SINGLETON_SECONDS * 1000;
  const remaining = slotMs - (Date.now() % slotMs);
  if (remaining < 180_000) await new Promise((r) => setTimeout(r, remaining + 1000));
}

async function jobCount(promptId: string, state: string): Promise<number> {
  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS n FROM pgboss.job WHERE name = $1 AND state = $2 AND data->>'promptId' = $3",
    [PROMPT_QUEUE, state, promptId],
  );
  return rows[0].n;
}

async function runShape(promptId: string): Promise<string> {
  const { rows } = await client.query(
    "SELECT model, web_search_enabled, COUNT(*)::int AS n FROM prompt_runs WHERE prompt_id = $1 GROUP BY 1,2 ORDER BY 1,2",
    [promptId],
  );
  return rows
    .map((r: { model: string; web_search_enabled: boolean; n: number }) => `${r.model}:${r.web_search_enabled ? "web" : "base"}=${r.n}`)
    .join(",");
}

async function runCount(promptId: string): Promise<number> {
  const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM prompt_runs WHERE prompt_id = $1", [promptId]);
  return rows[0].n;
}

async function waitFor<T>(fn: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function assert(cond: boolean, message: string): void {
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
    assert(count === RUNS_PER_PROMPT, `legacy volume: exactly ${RUNS_PER_PROMPT} runs recorded (got ${count})`);
    const { rows } = await client.query(
      "SELECT DISTINCT model, version FROM prompt_runs WHERE prompt_id = $1", [prompt.id]);
    assert(rows.length === 1 && rows[0].model === "stub" && rows[0].version === "stub", "runs carry the stub target");

    await sendJob(prompt.id);
    await new Promise((r) => setTimeout(r, 8000));
    const after = await runCount(prompt.id);
    assert(after === RUNS_PER_PROMPT, `dueness metering: an immediate re-fire adds no runs (got ${after})`);

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
  await client.query(
    `INSERT INTO subscription (id, plan, reference_id, status, period_start, period_end)
     VALUES ('sub-verify-1', 'pro', 'cloudorg-1', 'active', NOW() - interval '1 day', NOW() + interval '29 days')`);
  await client.query(
    `INSERT INTO brands (id, organization_id, name, website, enabled, onboarded, enabled_models, created_at, updated_at)
     VALUES ('cloudbrand-1', 'cloudorg-1', 'Cloud Verify Brand', 'https://verify.example', true, true, '{chatgpt,perplexity}', NOW(), NOW())`);
  const { rows: [prompt] } = await client.query(
    "INSERT INTO prompts (brand_id, value, enabled, premium_models) VALUES ('cloudbrand-1', 'scheduling e2e — cloud policy', true, '{claude}') RETURNING id");

  await sendJob(prompt.id);
  await waitFor(async () => (await runCount(prompt.id)) > 0, 120000, "cloud runs");
  await new Promise((r) => setTimeout(r, 5000));
  const shape = await runShape(prompt.id);
  assert(
    shape === "chatgpt:base=1,claude:web=1,perplexity:base=1",
    `cloud volume: picked platforms + one premium slot, replication 1 (got ${shape})`,
  );

  const { rows: [usage] } = await client.query(
    "SELECT COUNT(*)::int AS n FROM usage_events WHERE prompt_id = $1 AND organization_id = 'cloudorg-1' AND event_type = 'prompt_run'",
    [prompt.id]);
  assert(usage.n === 3, `usage metering: one attributable event per provider call (got ${usage.n})`);

  await sendJob(prompt.id);
  await new Promise((r) => setTimeout(r, 8000));
  assert((await runCount(prompt.id)) === 3, "cloud dueness: re-fire adds nothing");

  // Cancel → due targets stop running.
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
} else if (scenario === "expedite") {
  // --- A finished job must not block the next send for the same prompt ------
  //
  // No prompt row behind this id, so the worker completes the job as a no-op.
  // That is all this needs: a finished job sitting on the queue.
  await awaitSlotHeadroom();
  const ghostId = randomUUID();
  const firstSend = await sendPromptJob(ghostId);
  assert(firstSend !== null, "queue accepts a send for a prompt with nothing queued");
  await waitFor(async () => (await jobCount(ghostId, "completed")) === 1, 60000, "the first job to finish");

  const secondSend = await sendPromptJob(ghostId);
  assert(secondSend !== null, "a finished job does not block the next send for the same prompt");
  await client.query("DELETE FROM pgboss.job WHERE name = $1 AND data->>'promptId' = $2", [PROMPT_QUEUE, ghostId]);

  // --- Adding a premium model runs that model, and only that model ----------
  await client.query("DELETE FROM usage_events WHERE brand_id = 'expeditebrand-1'");
  await client.query("DELETE FROM prompt_runs WHERE brand_id = 'expeditebrand-1'");
  await client.query("DELETE FROM prompts WHERE brand_id = 'expeditebrand-1'");
  await client.query("DELETE FROM brands WHERE id = 'expeditebrand-1'");
  await client.query("DELETE FROM subscription WHERE reference_id = 'expediteorg-1'");
  await client.query("DELETE FROM organization_settings WHERE organization_id = 'expediteorg-1'");
  await client.query("DELETE FROM organization WHERE id = 'expediteorg-1'");

  await client.query(
    "INSERT INTO organization (id, name, slug, created_at) VALUES ('expediteorg-1', 'Expedite Verify', 'expedite-verify', NOW())");
  // Starts canceled so the first cycle is a deliberate no-op — see below.
  await client.query(
    `INSERT INTO subscription (id, plan, reference_id, status, period_start, period_end)
     VALUES ('sub-expedite-1', 'pro', 'expediteorg-1', 'canceled', NOW() - interval '1 day', NOW() + interval '29 days')`);
  await client.query(
    `INSERT INTO brands (id, organization_id, name, website, enabled, onboarded, enabled_models, created_at, updated_at)
     VALUES ('expeditebrand-1', 'expediteorg-1', 'Expedite Verify Brand', 'https://expedite.example', true, true, '{chatgpt}', NOW(), NOW())`);
  const { rows: [prompt] } = await client.query(
    "INSERT INTO prompts (brand_id, value, enabled, premium_models) VALUES ('expeditebrand-1', 'scheduling e2e — expedite', true, '{}') RETURNING id");

  // A cycle for an unentitled org queues nothing on its way out, which is how
  // this reaches the state a configuration change has to recover from: a
  // finished job on the queue and no chain behind it.
  await awaitSlotHeadroom();
  await sendPromptJob(prompt.id);
  await waitFor(async () => (await jobCount(prompt.id, "completed")) === 1, 60000, "the parked cycle to finish");
  assert(
    (await jobCount(prompt.id, "created")) === 0 && (await runCount(prompt.id)) === 0,
    "an unentitled cycle records no runs and leaves no queued job",
  );

  // Give the standard target fresh history so only the premium target can come
  // due — this is what makes "only the new model runs" observable.
  await client.query(
    `INSERT INTO prompt_runs
       (prompt_id, brand_id, model, provider, version, web_search_enabled, raw_output, web_queries, brand_mentioned, competitors_mentioned)
     VALUES ($1, 'expeditebrand-1', 'chatgpt', 'stub', 'stub', false, '{}', '{}', false, '{}')`,
    [prompt.id],
  );

  await client.query("UPDATE subscription SET status = 'active' WHERE id = 'sub-expedite-1'");
  await client.query("UPDATE prompts SET premium_models = '{claude}' WHERE id = $1", [prompt.id]);

  await expeditePromptRuns(boss, [prompt.id]);
  await waitFor(async () => (await runCount(prompt.id)) > 1, 120000, "the expedited premium run");
  await new Promise((r) => setTimeout(r, 5000));

  const shape = await runShape(prompt.id);
  assert(
    shape === "chatgpt:base=1,claude:web=1",
    `adding a premium model runs it now, and re-runs nothing else (got ${shape})`,
  );
} else {
  console.error("scenario must be local, cloud, or expedite");
  process.exit(2);
}

await boss.stop({ graceful: false });
await client.end();
console.log(`\n${scenario} scheduling verification PASSED`);