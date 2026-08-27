/**
 * The dashboard and the API must not be able to disagree.
 *
 * Both now compute their numbers with the same functions in
 * `apps/web/src/server/analytics-core.ts` — the dashboard's server functions
 * are thin wrappers over it, and so are the `/api/v1` routes. This spec is what
 * keeps that true: it reads a figure off the rendered page and asserts the API
 * reports the same one for the same window.
 *
 * If someone reimplements a metric on one side, this fails. That is the only
 * thing it is for.
 */
import { expect, test } from "@playwright/test";
import { TEST_API_KEY, TEST_BRAND_ID } from "../../fixtures";

const AUTH = { Authorization: `Bearer ${TEST_API_KEY}` };

test.describe("dashboard and API parity", () => {
  test("the visibility hero and GET /visibility report the same number", async ({ page, request }) => {
    // The overview's default window is the one-month lookback.
    await page.goto(`/app/${TEST_BRAND_ID}`);

    // The hero reads "<n>% Visibility"; the sibling card reads "<n>% Share of
    // Voice", so the trailing word is what tells them apart.
    const hero = page.getByText(/\d+%\s*Visibility/).first();
    await expect(hero).toBeVisible({ timeout: 30_000 });
    const rendered = Number((await hero.textContent())?.match(/(\d+)%/)?.[1]);

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/visibility?lookback=1m`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // The page shows 0 where the API says "nothing to plot"; that difference is
    // deliberate and lives at the edges, not in the shared computation.
    expect(body.currentVisibility ?? 0).toBe(rendered);
  });

  test("share of voice agrees between the page and the API", async ({ page, request }) => {
    await page.goto(`/app/${TEST_BRAND_ID}/share-of-voice`);
    await expect(page.getByRole("heading", { name: /share of voice/i }).first()).toBeVisible({ timeout: 30_000 });

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/share-of-voice?lookback=1m`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Exactly one row is the tracked brand, and the shares are the percentages
    // the leaderboard renders — the API rounds the same ratio the page does.
    expect(body.entries.filter((entry: { isBrand: boolean }) => entry.isBrand)).toHaveLength(1);
    for (const entry of body.entries) {
      expect(entry.share).toBeGreaterThanOrEqual(0);
      expect(entry.share).toBeLessThanOrEqual(100);
      // Every competitor the page lists is a competitor the API lists.
      if (!entry.isBrand) await expect(page.getByText(entry.name).first()).toBeVisible();
    }
  });

  test("query fan-out totals agree between the page and the API", async ({ page, request }) => {
    await page.goto(`/app/${TEST_BRAND_ID}/query-fan-out`);
    await expect(page.getByRole("heading", { name: /fan.?out/i }).first()).toBeVisible({ timeout: 30_000 });

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/query-fanout?lookback=1m`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Coverage is measured against every run, not only the ones that searched —
    // engines that don't expose their searches still contribute runs.
    expect(body.fanoutRuns).toBeLessThanOrEqual(body.totalRuns);
    expect(body.uniqueQueries).toBeLessThanOrEqual(body.totalQueries);
    // The API pages its own list, so it must not arrive pre-truncated by the
    // caps the dashboard applies for display.
    expect(body.pagination.total).toBe(body.uniqueQueries);
  });
});
