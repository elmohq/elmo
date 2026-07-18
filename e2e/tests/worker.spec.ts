/**
 * Worker Job Processing E2E Test
 *
 * Proves the background worker is wired up end to end: submitting a prompt
 * through the public API enqueues a `process-prompt` pg-boss job, and the
 * worker (running the no-network `stub` provider) dequeues it and records the
 * run. We assert on the `prompt_runs` side effect rather than the job's own
 * state so the test only passes if the handler actually did its work.
 *
 * The worker is started with WORKER_DISABLE_SCHEDULES=1 (see
 * e2e/worker-override.yaml), so nothing but this submitted job runs — the
 * seeded fixtures the other specs depend on are left untouched.
 */
import { test, expect } from "@playwright/test";
import pg from "pg";
import { TEST_BRAND_ID } from "../seed";

const API_KEY = "test-api-key-e2e";
const DATABASE_URL = "postgres://postgres:postgres@localhost:5432/elmo";

// The stub provider records its runs under this model version.
const STUB_MODEL_VERSION = "stub";

test.describe("Worker job processing", () => {
  test("a submitted prompt is dequeued and processed by the worker", async ({ request }) => {
    // Submit: creating a prompt enqueues an immediate process-prompt job.
    const value = "worker e2e — does a submitted job get processed?";
    const createRes = await request.post("/api/v1/prompts", {
      headers: { Authorization: `Bearer ${API_KEY}` },
      data: { brandId: TEST_BRAND_ID, value },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const prompt = (await createRes.json()) as { id: string };
    expect(prompt.id).toBeTruthy();

    // Assert: poll until the worker records at least one run for this prompt.
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const deadline = Date.now() + 45_000;
      let run: { model: string; version: string } | undefined;
      while (Date.now() < deadline) {
        const { rows } = await client.query<{ model: string; version: string }>(
          `SELECT model, version FROM prompt_runs WHERE prompt_id = $1 LIMIT 1`,
          [prompt.id],
        );
        run = rows[0];
        if (run) break;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }

      expect(run, `worker did not record a prompt_run for ${prompt.id} within 45s`).toBeTruthy();
      // The stub provider is the only configured target for the worker, so the
      // recorded run must be its output — proof the job ran, not a stray write.
      expect(run?.version).toBe(STUB_MODEL_VERSION);
    } finally {
      await client.end();
    }
  });
});
