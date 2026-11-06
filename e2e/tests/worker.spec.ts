/**
 * Runs after the mode projects, once the worker is up, so the worker's
 * scheduler can't re-enqueue the seeded prompts they assert on. Asserts on
 * `prompt_runs` rather than job state, so it passes only if the handler did its
 * work.
 */
import { expect, test } from "../test";
import pg from "pg";
import { DATABASE_URL, TEST_API_KEY, TEST_BRAND_ID, TEST_BRAND_NAME } from "../fixtures";

test.describe("Worker job processing", () => {
  test("a submitted prompt is dequeued and processed by the worker", async ({ request }) => {
    const value = "worker e2e — does a submitted job get processed?";
    const createRes = await request.post("/api/v1/prompts", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      data: { brandId: TEST_BRAND_ID, value },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const prompt = (await createRes.json()) as { id: string };
    expect(prompt.id).toBeTruthy();

    // The budget absorbs worker startup (CI has no readiness wait) and one 60s retry.
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

      // One firing records RUNS_PER_PROMPT runs; the pause catches a duplicate firing overshooting.
      await expect
        .poll(
          async () => {
            const { rows } = await client.query<{ n: number }>(
              `SELECT COUNT(*)::int AS n FROM prompt_runs WHERE prompt_id = $1`,
              [prompt.id],
            );
            return rows[0]?.n ?? 0;
          },
          { message: `expected 5 runs for ${prompt.id}`, timeout: 60_000 },
        )
        .toBe(5);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const { rows: settled } = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM prompt_runs WHERE prompt_id = $1`,
        [prompt.id],
      );
      expect(settled[0]?.n, "run volume must not exceed RUNS_PER_PROMPT").toBe(5);
    } finally {
      await client.end();
    }
  });

  test("the mention judge reads the brand and a competitor in a recorded answer, and the sentiment toward each", async ({ request }) => {
    // The stub provider answers with the prompt, so this is the answer the judge reads.
    const answer = [
      `${TEST_BRAND_NAME} is the best choice for small teams. It is reliable, fast and genuinely delightful to use, and support answers within minutes.`,
      "Setup takes an afternoon either way, and pricing is similar across vendors.",
      "Competitor Alpha is the one to avoid. It is slow, crashes often, and its support never replies.",
    ].join("\n\n");
    const createRes = await request.post("/api/v1/prompts", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      data: { brandId: TEST_BRAND_ID, value: answer },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const prompt = (await createRes.json()) as { id: string };

    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const judged = async () =>
        (
          await client.query<{ brand_mentioned: boolean; competitors_mentioned: string[]; assessments: Assessments }>(
            `SELECT rm.brand_mentioned, rm.competitors_mentioned, rm.assessments
             FROM prompt_runs pr JOIN run_mentions rm ON rm.run_id = pr.id
             WHERE pr.prompt_id = $1`,
            [prompt.id],
          )
        ).rows;
      await expect
        .poll(async () => (await judged()).length, {
          message: `the worker did not judge the runs for ${prompt.id}`,
          timeout: 180_000,
        })
        .toBe(5);

      for (const run of await judged()) {
        expect(run.brand_mentioned).toBe(true);
        expect(run.competitors_mentioned).toEqual(["Competitor Alpha"]);
        expect(run.assessments.brand).toMatchObject({ mentioned: true, sentiment: "positive", position: 1 });
        expect(run.assessments.competitors["Competitor Alpha"]).toMatchObject({
          mentioned: true,
          sentiment: "negative",
          position: 2,
        });
      }
    } finally {
      await client.end();
    }
  });
});

interface Assessments {
  brand?: { mentioned: boolean; sentiment?: string; position?: number };
  competitors: Record<string, { mentioned: boolean; sentiment?: string; position?: number }>;
}
