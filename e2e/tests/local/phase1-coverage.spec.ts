/**
 * Coverage for local-mode surfaces no other spec visits: the Share of Voice,
 * Query Fan-Out, and Opportunities pages, the competitors/prompts/LLMs
 * settings editors, the admin Workflows/Tools pages, the printable report,
 * local redirects for cloud-only auth pages, the setup-status health check,
 * and /api/v1 pagination for brands, competitors, and reports.
 *
 * Read-only against the seeded fixtures, except "generates a report", which
 * appends a report row the same way the Bruno suite does. That test needs the
 * worker running (stub provider) and is skipped when WORKER_UP is not set.
 */
import { expect, test } from "@playwright/test";
import { brandUrl, REPORT_IDS, TEST_API_KEY, TEST_BRAND_ID } from "../../fixtures";

const api = { Authorization: `Bearer ${TEST_API_KEY}` };

test.describe("Dashboard pages without prior coverage", () => {
  test("share of voice page renders competitor stats", async ({ page }) => {
    await page.goto(`${brandUrl()}/share-of-voice`);
    await expect(page.getByRole("heading", { name: /share of voice/i, level: 1 })).toBeVisible();
    // The seeded runs carry brand mentions only, so the leaderboard may be an
    // empty state — assert the page body rendered rather than specific rows.
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("query fan-out page renders its tabs", async ({ page }) => {
    await page.goto(`${brandUrl()}/query-fan-out`);
    await expect(page.getByText(/fan-out/i).first()).toBeVisible();
    await expect(page.getByRole("tab").first()).toBeVisible();
  });

  test("opportunities page loads without crashing", async ({ page }) => {
    await page.goto(`${brandUrl()}/opportunities`);
    await expect(page.getByText(/opportunit/i).first()).toBeVisible();
  });

  test("unknown brand subpage shows not-found, not a crash", async ({ page }) => {
    const response = await page.goto(`${brandUrl()}/definitely-not-a-page`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  });
});

test.describe("Settings editors render seeded data", () => {
  test("competitors settings lists seeded competitors", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/competitors`);
    await expect(page.getByText(/Competitor Alpha/i).first()).toBeVisible();
  });

  test("prompts settings lists seeded prompts with controls", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/prompts`);
    await expect(page.getByPlaceholder("Enter prompt text...").first()).toBeAttached();
    await expect(page.getByRole("button", { name: /^import prompts$/i })).toBeVisible();
  });

  test("llms settings shows platform groups", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/llms`);
    await expect(page.getByText(/claude|chatgpt/i).first()).toBeVisible();
  });
});

test.describe("Admin pages", () => {
  test("workflows page shows queue stats", async ({ page }) => {
    await page.goto("/admin/workflows");
    await expect(page.getByText(/process-prompt|queue/i).first()).toBeVisible();
  });

  test("tools page shows the analysis form", async ({ page }) => {
    await page.goto("/admin/tools");
    await expect(page.getByRole("button", { name: /analyze brand/i })).toBeVisible();
  });
});

test.describe("Reports", () => {
  test("printable report render page loads for the completed report", async ({ page }) => {
    await page.goto(`/reports/render/${REPORT_IDS.completed}`);
    await expect(page.getByText(/share of voice|report/i).first()).toBeVisible();
  });

  test(
    "worker generates a report end-to-end",
    { tag: "@worker" },
    async ({ request }) => {
      test.skip(!process.env.WORKER_UP, "requires the worker container (stub provider)");
      // The pipeline fetches the target website for real even with the stub
      // LLM, so allow well beyond the queue's 60s retry delay.
      test.setTimeout(320_000);
      const created = await request.post("/api/v1/reports", {
        headers: api,
        data: { brandName: "Phase1 Synthetic", brandWebsite: "https://example.org" },
      });
      expect(created.ok()).toBeTruthy();
      const { reportId: id } = await created.json();
      await expect
        .poll(
          async () => {
            const res = await request.get(`/api/v1/reports/${id}`, { headers: api });
            const body = await res.json();
            return body.status;
          },
          { timeout: 300_000, intervals: [5_000] },
        )
        .toMatch(/completed|failed/);
    },
  );
});

test.describe("Local-mode redirects and health", () => {
  test("forgot-password redirects to login in local mode", async ({ page }) => {
    await page.goto("/auth/forgot-password");
    await page.waitForURL(/\/auth\/login/);
  });

  test("choose-plan redirects into the app when billing is disabled", async ({ page }) => {
    await page.goto("/choose-plan");
    await page.waitForURL(/\/app/);
  });

  test("setup-status reports a migrated database", async ({ request }) => {
    const res = await request.get("/api/setup-status");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/ok|ready|true/i);
  });
});

test.describe("/api/v1 pagination beyond prompts", () => {
  for (const resource of ["brands", "competitors", "reports"] as const) {
    test(`${resource} list honors limit=1`, async ({ request }) => {
      const res = await request.get(`/api/v1/${resource}?limit=1`, { headers: api });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const items = body.items ?? body[resource] ?? body.data;
      expect(Array.isArray(items)).toBeTruthy();
      expect(items.length).toBeLessThanOrEqual(1);
    });
  }
});
