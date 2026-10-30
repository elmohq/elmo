import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCitationDomainPage, getCitationSummary, getCitationUrlPage } from "@/lib/citation-read";
import {
	getPerPromptCitationDomains,
	getPerPromptDailyCitationClasses,
	getPerPromptGooglePages,
} from "@/lib/rollup-read";
import {
	createBrand,
	createCitation,
	createPrompt,
	createRun,
	deleteBrand,
	rebuildRollups,
} from "@/test/integration/stats-fixtures";

const GOOGLE_SEARCH = "https://www.google.com/search?q=best+crm";

let brandId: string;
let promptId: string;
const scopes = () => {
	const base = { brandId, timezone: "UTC", promptIds: [promptId] };
	return {
		previous: { ...base, from: "2026-03-01", to: "2026-03-07" },
		current: { ...base, from: "2026-03-08", to: "2026-03-14" },
	};
};

const owned = { brandDomains: ["acme.example"], competitorDomains: [] };
const unowned = { brandDomains: [], competitorDomains: [] };

const citedBy = async (at: string, urls: string[]) => {
	const run = await createRun(brandId, promptId, { at, brandMentioned: false });
	for (const url of urls) await createCitation(run, url);
};

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	promptId = await createPrompt(brandId, { value: "best crm" });

	await citedBy("2026-03-02T10:00:00Z", [
		"https://docs.acme.example/a",
		"https://review.example/kept",
		"https://review.example/halved",
		"https://gone.example/c",
	]);
	await citedBy("2026-03-03T10:00:00Z", [
		"https://review.example/kept",
		"https://review.example/halved",
		"https://gone.example/c",
	]);
	await citedBy("2026-03-04T10:00:00Z", ["https://review.example/kept"]);

	await citedBy("2026-03-09T10:00:00Z", [
		"https://docs.acme.example/a",
		"https://review.example/kept",
		"https://review.example/halved",
		"https://notacme.example/d",
		GOOGLE_SEARCH,
	]);
	await citedBy("2026-03-10T10:00:00Z", ["https://review.example/kept"]);

	await citedBy("2026-03-20T10:00:00Z", ["https://zeta.example/one", "https://alpha.example/one"]);
	await citedBy("2026-03-20T11:00:00Z", ["https://zeta.example/one", "https://alpha.example/two"]);
	await rebuildRollups(brandId);
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("citation pages", () => {
	it("lists the window's pages without Google surfaces, most cited first, flagging the ones the previous window never cited", async () => {
		const { current, previous } = scopes();
		const { rows, total } = await getCitationUrlPage(current, previous, unowned, {}, 10, 0);
		expect(total).toBe(4);
		expect(rows.map(({ url, count, is_new }) => ({ url, count, is_new }))).toEqual([
			{ url: "https://review.example/kept", count: 2, is_new: false },
			{ url: "https://docs.acme.example/a", count: 1, is_new: false },
			{ url: "https://notacme.example/d", count: 1, is_new: true },
			{ url: "https://review.example/halved", count: 1, is_new: false },
		]);
	});

	it("searches and pages through every URL in the window, not just the most cited", async () => {
		const { current, previous } = scopes();
		const firstPage = await getCitationUrlPage(current, previous, unowned, {}, 1, 0);
		expect(firstPage.rows.map((row) => row.url)).toEqual(["https://review.example/kept"]);

		const searched = await getCitationUrlPage(current, previous, unowned, { search: "HALVED" }, 1, 0);
		expect(searched.total).toBe(1);
		expect(searched.rows.map((row) => row.url)).toEqual(["https://review.example/halved"]);

		const secondPage = await getCitationUrlPage(current, previous, unowned, { search: "review.example" }, 1, 1);
		expect(secondPage.total).toBe(2);
		expect(secondPage.rows.map((row) => row.url)).toEqual(["https://review.example/halved"]);
	});

	it("still reports how many match when asked for a page past the end", async () => {
		const { current, previous } = scopes();
		const urls = await getCitationUrlPage(current, previous, unowned, {}, 10, 100);
		expect(urls).toEqual({ rows: [], total: 4 });
		const domains = await getCitationDomainPage(current, previous, unowned, {}, 10, 100);
		expect(domains).toEqual({ rows: [], total: 3 });
	});

	it("orders domains with equal citations by their most cited page", async () => {
		const window = { brandId, timezone: "UTC", promptIds: [promptId], from: "2026-03-20", to: "2026-03-20" };
		const previous = { ...window, from: "2026-03-19", to: "2026-03-19" };
		const { rows } = await getCitationDomainPage(window, previous, unowned, {}, 10, 0);
		expect(rows.map((row) => [row.domain, row.count])).toEqual([
			["zeta.example", 2],
			["alpha.example", 2],
		]);
	});

	it("treats search wildcards as literal characters", async () => {
		const { current, previous } = scopes();
		expect((await getCitationUrlPage(current, previous, unowned, { search: "%" }, 10, 0)).total).toBe(0);
		expect((await getCitationUrlPage(current, previous, unowned, { search: "docs_acme" }, 10, 0)).total).toBe(0);
	});

	it("files the brand's subdomains under the brand, but not domains that merely end alike", async () => {
		const { current, previous } = scopes();
		const { rows } = await getCitationUrlPage(current, previous, owned, { category: "brand" }, 10, 0);
		expect(rows.map((row) => row.url)).toEqual(["https://docs.acme.example/a"]);
	});

	it("summarizes totals and what changed since the previous window", async () => {
		const { current, previous } = scopes();
		const summary = await getCitationSummary(current, previous, owned, { minCount: 2, limit: 10 });

		expect(summary.uniqueDomains).toBe(3);
		expect(summary.classes.reduce((sum, row) => sum + row.count, 0)).toBe(5);
		expect(summary.classes.filter((row) => row.category === "brand").reduce((sum, row) => sum + row.count, 0)).toBe(1);
		expect(
			summary.droppedUrls.map(({ url, previous_count, current_count }) => ({ url, previous_count, current_count })),
		).toEqual([
			{ url: "https://gone.example/c", previous_count: 2, current_count: 0 },
			{ url: "https://review.example/halved", previous_count: 2, current_count: 1 },
		]);
		expect(summary.droppedDomains.map(({ domain, previous_count }) => ({ domain, previous_count }))).toEqual([
			{ domain: "gone.example", previous_count: 2 },
		]);
		expect(summary.newUrls).toEqual([]);
		expect(summary.newDomains).toEqual([]);
	});

	it("lists domains with their previous window's citations, searched across all of them", async () => {
		const { current, previous } = scopes();
		const { rows, total } = await getCitationDomainPage(current, previous, owned, {}, 10, 0);
		expect(total).toBe(3);
		expect(
			rows.map(({ domain, count, previous_count, category }) => ({ domain, count, previous_count, category })),
		).toEqual([
			{ domain: "review.example", count: 3, previous_count: 5, category: expect.any(String) },
			{ domain: "docs.acme.example", count: 1, previous_count: 1, category: "brand" },
			{ domain: "notacme.example", count: 1, previous_count: 0, category: expect.any(String) },
		]);
		const searched = await getCitationDomainPage(current, previous, owned, { search: "notacme" }, 10, 0);
		expect(searched.rows.map((row) => row.domain)).toEqual(["notacme.example"]);
	});

	it("keeps Google surfaces for the per-prompt breakdowns that use them", async () => {
		const { current } = scopes();
		expect((await getPerPromptGooglePages(current)).map((row) => row.url)).toEqual([
			"https://google.com/search?q=best+crm",
		]);
		const domains = await getPerPromptCitationDomains(current);
		expect(domains.find((row) => row.domain === "google.com")?.count).toBe(1);
		expect(domains.find((row) => row.domain === "review.example")?.count).toBe(3);
	});

	it("marks the brand's domains and their subdomains, and nothing that merely ends alike", async () => {
		const { current } = scopes();
		const rows = await getPerPromptDailyCitationClasses(current, {
			brandDomains: ["acme.example"],
			competitorDomains: ["review.example"],
		});
		const byOwner: Record<string, number> = {};
		for (const row of rows.filter((row) => row.date === "2026-03-09")) {
			byOwner[row.owner ?? "neither"] = (byOwner[row.owner ?? "neither"] ?? 0) + row.count;
		}
		expect(byOwner).toEqual({ brand: 1, competitor: 2, neither: 1 });
	});
});
