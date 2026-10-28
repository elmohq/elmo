import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	getCitationDomainCounts,
	getCitationPageStats,
	getDroppedCitationPages,
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
	await rebuildRollups(brandId);
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("citation pages", () => {
	it("lists the window's pages without Google surfaces, flagging the ones the previous window never cited", async () => {
		const { current, previous } = scopes();
		const pages = await getCitationPageStats(current, previous);
		expect(pages.map(({ url, count, is_new }) => ({ url, count, is_new }))).toEqual([
			{ url: "https://review.example/kept", count: 2, is_new: false },
			{ url: "https://docs.acme.example/a", count: 1, is_new: false },
			{ url: "https://notacme.example/d", count: 1, is_new: true },
			{ url: "https://review.example/halved", count: 1, is_new: false },
		]);
	});

	it("finds pages that lost at least half their citations, among those cited often enough before", async () => {
		const { current, previous } = scopes();
		const dropped = await getDroppedCitationPages(current, previous, 2, 10);
		expect(dropped.map(({ url, previous_count, current_count }) => ({ url, previous_count, current_count }))).toEqual([
			{ url: "https://gone.example/c", previous_count: 2, current_count: 0 },
			{ url: "https://review.example/halved", previous_count: 2, current_count: 1 },
		]);
	});

	it("counts the previous window's citations by domain", async () => {
		const { previous } = scopes();
		expect(await getCitationDomainCounts(previous)).toEqual(
			expect.arrayContaining([
				{ domain: "review.example", count: 5 },
				{ domain: "gone.example", count: 2 },
				{ domain: "docs.acme.example", count: 1 },
			]),
		);
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
