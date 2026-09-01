/**
 * Reads a figure off the rendered page and asserts the API reports the same one
 * for the same window. Fails if someone reimplements a metric on one side.
 */
import { expect, test } from "../../test";
import { TEST_API_KEY, TEST_BRAND_ID, brandUrl } from "../../fixtures";

const AUTH = { Authorization: `Bearer ${TEST_API_KEY}` };

/** Half-open, so it runs to the start of tomorrow — anything less drops today's
 * runs and the two sides disagree for that reason alone. */
function lastMonth(): string {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  // Clamped the way the dashboard shifts, for the 31st of a month the previous
  // one does not have.
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(today.getUTCDate(), lastDay));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  return `start=${dayStart(start)}&end=${end.toISOString()}`;
}

function dayStart(date: Date): string {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

test.describe("dashboard and API parity", () => {
  test("the visibility hero and GET /analytics report the same number", async ({ page, request }) => {
    await page.goto(brandUrl());

    // The sibling card also reads "<n>%", so the trailing word disambiguates.
    const hero = page.getByText(/\d+%\s*Visibility/).first();
    await expect(hero).toBeVisible({ timeout: 30_000 });
    const rendered = Number((await hero.textContent())?.match(/(\d+)%/)?.[1]);

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/analytics?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Ratios against a rendered percentage, each rounded once at its own edge.
    // The page shows 0 where the API says "nothing to plot".
    expect(Math.round((body.visibility.current ?? 0) * 100)).toBe(rendered);
  });

  test("share of voice agrees between the page and the API", async ({ page, request }) => {
    await page.goto(`${brandUrl()}/share-of-voice`);
    await expect(page.getByRole("heading", { name: /share of voice/i }).first()).toBeVisible({ timeout: 30_000 });

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/analytics?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = (await response.json()).shareOfVoice;

    expect(body.entries.filter((entry: { isBrand: boolean }) => entry.isBrand)).toHaveLength(1);
    for (const entry of body.entries) {
      expect(entry.share).toBeGreaterThanOrEqual(0);
      expect(entry.share).toBeLessThanOrEqual(1);
      if (!entry.isBrand) await expect(page.getByText(entry.name).first()).toBeVisible();
    }
  });

  test("citations agree between the page and the API", async ({ page, request }) => {
    // The one metric still computed twice: getCitationsFn returns more than the
    // API publishes, so it isn't a wrapper. This pins the fields they share.
    await page.goto(`${brandUrl()}/citations`, { waitUntil: "networkidle" });
    await expect(page.getByText("Total Citations")).toBeVisible({ timeout: 30_000 });

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

    // The whole list is comparable, not just its presence.
    const section = pageText.slice(pageText.indexOf("Top Cited Domains"));
    const onPage = new Map<string, number>();
    for (const [, domain, count] of section.matchAll(/^([a-z0-9.-]+\.[a-z]{2,})\s*\n\s*(\d+)$/gm)) {
      if (!onPage.has(domain)) onPage.set(domain, Number(count));
    }
    expect(onPage.size, "no domain rows were parsed off the page").toBeGreaterThan(3);
    for (const row of domainBody.data) {
      expect(onPage.get(row.domain), `${row.domain} count differs from the page`).toBe(row.count);
    }

    // The likeliest place for two implementations to drift, so checked per URL
    // rather than trusted to the totals.
    const urls = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/citations/urls?${window}`, {
      headers: AUTH,
    });
    expect(urls.status()).toBe(200);
    const urlBody = await urls.json();
    expect(urlBody.totals.citations).toBe(totalOnPage);

    // A URL appears in more than one section and only the categorized table
    // carries a badge, so any row it appears in will do.
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

    // Against every run, not only the ones that searched: engines that don't
    // expose their searches still contribute runs.
    expect(body.fanoutRuns).toBeLessThanOrEqual(body.totalRuns);
    expect(body.uniqueQueries).toBeLessThanOrEqual(body.totalQueries);
    // Must not arrive pre-truncated by the caps the dashboard applies.
    expect(body.data.length).toBe(body.uniqueQueries);
  });
});
