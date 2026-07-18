/**
 * Worker Job Processing E2E Test
 *
 * Proves the background worker is wired up end to end: submitting a prompt
 * through the public API enqueues a `process-prompt` pg-boss job, and the
 * worker (running the no-network `stub` provider) dequeues it and records the
 * run. We assert on the `prompt_runs` side effect rather than the job's own
 * state so the test only passes if the handler actually did its work.
 *
 * This spec is the `worker` Playwright project and runs in its own phase,
 * after the worker is started. The fixture-dependent specs (the `fixtures`
 * project) run earlier while the worker is still down, so the worker's
 * self-healing scheduler can't re-enqueue the seeded prompts and mutate data
 * they assert on (see .github/workflows/e2e.yaml).
 */
import { test, expect } from "@playwright/test";
import pg from "pg";
import { DATABASE_URL, TEST_API_KEY, TEST_BRAND_ID } from "../fixtures";

test.describe("Worker job processing", () => {
  test("a submitted prompt is dequeued and processed by the worker", async ({ request }) => {
    // Submit: creating a prompt enqueues an immediate process-prompt job.
    const value = "worker e2e — does a submitted job get processed?";
    const createRes = await request.post("/api/v1/prompts", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      data: { brandId: TEST_BRAND_ID, value },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const prompt = (await createRes.json()) as { id: string };
    expect(prompt.id).toBeTruthy();

    // Assert: poll until the worker records a run for this prompt. The stub
    // provider is the worker's only configured target, so the run must carry
    // its version — proof the job ran, not a stray write. The job is durable
    // in pg-boss, so the poll budget absorbs worker startup (there is no
    // separate readiness wait in CI) and covers one retry cycle of the
    // process-prompt queue (retryDelay 60s).
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await expect
        .poll(
          async () => {
            const { rows } = await client.query<{ version: string }>(
              `SELECT version FROM prompt_runs WHERE prompt_id = $1 LIMIT 1`,
              [prompt.id],
            );
            return rows[0]?.version;
          },
          {
            message: `worker did not record a prompt_run for ${prompt.id}`,
            timeout: 120_000,
          },
        )
        .toBe("stub");
    } finally {
      await client.end();
    }
  });
});
