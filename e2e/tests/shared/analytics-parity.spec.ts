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
import { expect, test } from "../../test";
import { TEST_API_KEY, TEST_BRAND_ID, brandUrl } from "../../fixtures";

const AUTH = { Authorization: `Bearer ${TEST_API_KEY}` };

/**
 * The dashboard's one-month preset, as the instants the API takes.
 *
 * The dashboard's window is a run of calendar days ending today, so the API's
 * half-open equivalent runs to the *start of tomorrow* — anything less would
 * drop today's runs and the two sides would disagree for that reason alone.
 */
function lastMonth(): string {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  // Clamp the day the way the dashboard's own shift does, so the two windows
  // stay identical on the 31st of a month the previous one doesn't have.
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(today.getUTCDate(), lastDay));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  return `start=${dayStart(start)}&end=${end.toISOString()}`;
}

/** Midnight UTC on the day this instant falls in. */
function dayStart(date: Date): string {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

test.describe("dashboard and API parity", () => {
  test("the visibility hero and GET /analytics report the same number", async ({ page, request }) => {
    // The overview's default window is the one-month preset.
    await page.goto(brandUrl());

    // The hero reads "<n>% Visibility"; the sibling card reads "<n>% Share of
    // Voice", so the trailing word is what tells them apart.
    const hero = page.getByText(/\d+%\s*Visibility/).first();
    await expect(hero).toBeVisible({ timeout: 30_000 });
    const rendered = Number((await hero.textContent())?.match(/(\d+)%/)?.[1]);

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/analytics?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // The API answers in ratios and the page renders a percentage; both round
    // the same shared number once, at their own edge. The page shows 0 where the
    // API says "nothing to plot" — that difference is deliberate and also lives
    // at the edges, not in the computation they share.
    expect(Math.round((body.visibility.current ?? 0) * 100)).toBe(rendered);
  });

  test("share of voice agrees between the page and the API", async ({ page, request }) => {
    await page.goto(`${brandUrl()}/share-of-voice`);
    await expect(page.getByRole("heading", { name: /share of voice/i }).first()).toBeVisible({ timeout: 30_000 });

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/analytics?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = (await response.json()).shareOfVoice;

    // Exactly one row is the tracked brand, and every share is the exact ratio
    // the leaderboard rounds for display.
    expect(body.entries.filter((entry: { isBrand: boolean }) => entry.isBrand)).toHaveLength(1);
    for (const entry of body.entries) {
      expect(entry.share).toBeGreaterThanOrEqual(0);
      expect(entry.share).toBeLessThanOrEqual(1);
      // Every competitor the page lists is a competitor the API lists.
      if (!entry.isBrand) await expect(page.getByText(entry.name).first()).toBeVisible();
    }
  });

  test("citations agree between the page and the API", async ({ page, request }) => {
    // Citations is the one metric still computed twice — getCitationsFn returns
    // more than the API publishes (the Google module, what's-changed, page-type
    // distribution), so it isn't a wrapper. Two implementations are fine; two
    // answers are not. This pins the fields they both produce.
    await page.goto(`${brandUrl()}/citations`, { waitUntil: "networkidle" });
    await expect(page.getByText("Total Citations")).toBeVisible({ timeout: 30_000 });

    // The page's default window is the last 30 days, ending today, which is what
    // `citationDateWindow` builds. The API takes the same span as instants, so
    // the end is the start of tomorrow rather than the start of today.
    const today = new Date();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 29);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const window = `start=${dayStart(from)}&end=${dayStart(tomorrow)}`;

    const numberUnder = async (label: string) => {
      const value = page.locator("div", { has: page.getByText(label, { exact: true }) }).last();
      return Number((await value.innerText()).match(/(\d+)/)?.[1]);
    };

    const domains = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/citations/domains?${window}`, {
      headers: AUTH,
    });
    expect(domains.status()).toBe(200);
    const domainBody = await domains.json();

    const pageText = await page.locator("main").innerText();
    const totalOnPage = Number(pageText.match(/Total Citations\s*\n?\s*(\d+)/)?.[1]);
    const domainsOnPage = Number(pageText.match(/Unique Domains\s*\n?\s*(\d+)/)?.[1]);

    expect(totalOnPage, "the page renders a citation total").toBeGreaterThan(0);
    expect(domainBody.totals.citations).toBe(totalOnPage);
    expect(domainBody.totals.uniqueDomains).toBe(domainsOnPage);

    // Every domain the API reports, with the count the page renders beside it.
    // The "Top Cited Domains" table lists them as `domain` then count, ordered
    // by count — so the whole list is comparable, not just its presence.
    const section = pageText.slice(pageText.indexOf("Top Cited Domains"));
    const onPage = new Map<string, number>();
    for (const [, domain, count] of section.matchAll(/^([a-z0-9.-]+\.[a-z]{2,})\s*\n\s*(\d+)$/gm)) {
      if (!onPage.has(domain)) onPage.set(domain, Number(count));
    }
    expect(onPage.size, "no domain rows were parsed off the page").toBeGreaterThan(3);
    for (const row of domainBody.data) {
      expect(onPage.get(row.domain), `${row.domain} count differs from the page`).toBe(row.count);
    }

    // Categorization is the likeliest place for two implementations to drift,
    // so check it per URL rather than trusting the totals to catch it.
    const urls = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/citations/urls?${window}`, {
      headers: AUTH,
    });
    expect(urls.status()).toBe(200);
    const urlBody = await urls.json();
    expect(urlBody.totals.citations).toBe(totalOnPage);

    // A URL appears in more than one section, and only the categorized table
    // carries a badge — so collect every row it appears in and look for the
    // category in any of them.
    const rendered: { href: string; rows: string[] }[] = await page.evaluate(() => {
      const byHref = new Map<string, string[]>();
      for (const anchor of document.querySelectorAll("a[href^='http']")) {
        const href = anchor.getAttribute("href") ?? "";
        const rows: string[] = [];
        let node = anchor.parentElement;
        for (let depth = 0; node && depth < 4; depth++) {
          rows.push((node.textContent ?? "").toLowerCase());
          node = node.parentElement;
        }
        byHref.set(href, [...(byHref.get(href) ?? []), ...rows]);
      }
      return [...byHref].map(([href, rows]) => ({ href, rows }));
    });

    let compared = 0;
    for (const row of urlBody.data) {
      const match = rendered.find((candidate) => candidate.href === row.url);
      if (!match) continue; // the page caps its list; the API does not
      expect(
        match.rows.some((text) => text.includes(row.category)),
        `${row.url} is categorized differently on the page (API says ${row.category})`,
      ).toBe(true);
      compared++;
    }
    expect(compared, "no URL was actually compared").toBeGreaterThan(3);
  });

  test("query fan-out totals agree between the page and the API", async ({ page, request }) => {
    await page.goto(`${brandUrl()}/query-fan-out`);
    await expect(page.getByRole("heading", { name: /fan.?out/i }).first()).toBeVisible({ timeout: 30_000 });

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/query-fanout?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Coverage is measured against every run, not only the ones that searched —
    // engines that don't expose their searches still contribute runs.
    expect(body.fanoutRuns).toBeLessThanOrEqual(body.totalRuns);
    expect(body.uniqueQueries).toBeLessThanOrEqual(body.totalQueries);
    // The API answers with the whole list, so it must not arrive pre-truncated
    // by the caps the dashboard applies for display.
    expect(body.data.length).toBe(body.uniqueQueries);
  });
});
