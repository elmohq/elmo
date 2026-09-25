import {
	getBrandAnalytics,
	getBrandCitations,
	getBrandPromptPerformance,
	getBrandShareOfVoice,
	getBrandVisibility,
} from "@/server/analytics-core";
import {
	createBrand,
	createCitation,
	createCompetitor,
	createPrompt,
	createRun,
	deleteBrand,
} from "@/test/integration/stats-fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const window = { from: "2026-03-01", to: "2026-03-03", timezone: "UTC" };

let brandId: string;
let pricing: string;
let branded: string;
let idle: string;

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	await createCompetitor(brandId, "Globex", ["globex.example"]);
	pricing = await createPrompt(brandId, { value: "acme pricing alternatives", tags: ["pricing"] });
	branded = await createPrompt(brandId, { value: "is acme any good", systemTags: ["branded"] });
	idle = await createPrompt(brandId, { value: "never scheduled" });
	const disabled = await createPrompt(brandId, { enabled: false });

	const before = await createRun(brandId, pricing, { at: "2026-02-27T10:00:00Z", brandMentioned: false });
	await createCitation(before, "https://review.example/best");

	const r1 = await createRun(brandId, pricing, {
		at: "2026-03-01T10:00:00Z",
		brandMentioned: true,
		competitors: ["Globex"],
	});
	await createCitation(r1, "https://acme.example/pricing");
	await createCitation(r1, "https://globex.example/x");
	await createRun(brandId, branded, { at: "2026-03-01T11:00:00Z", brandMentioned: false, competitors: ["Globex"] });
	const r3 = await createRun(brandId, branded, {
		at: "2026-03-02T10:00:00Z",
		brandMentioned: true,
		competitors: ["Globex", "Initech"],
	});
	await createCitation(r3, "https://review.example/best");
	const r4 = await createRun(brandId, pricing, { at: "2026-03-03T10:00:00Z", brandMentioned: true });
	await createCitation(r4, "https://review.example/best");
	await createCitation(r4, "https://www.acme.example/pricing/");

	const hidden = await createRun(brandId, disabled, { at: "2026-03-02T10:00:00Z", brandMentioned: true });
	await createCitation(hidden, "https://hidden.example/");
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("brand visibility", () => {
	it("carries each prompt's latest result forward and reports the last point as current", async () => {
		const visibility = await getBrandVisibility(brandId, window);
		expect(visibility.series).toEqual([
			{ date: "2026-03-01", visibility: 0.5 },
			{ date: "2026-03-02", visibility: 1 },
			{ date: "2026-03-03", visibility: 1 },
		]);
		expect(visibility.currentVisibility).toBe(1);
	});

	it("totals only enabled prompts and the runs that actually happened in the window", async () => {
		expect(await getBrandVisibility(brandId, window)).toMatchObject({
			totalRuns: 4,
			totalPrompts: 3,
			totalCitations: 5,
		});
	});

	it("narrows to prompts matching the tag filter", async () => {
		const visibility = await getBrandVisibility(brandId, window, { tags: "pricing" });
		expect(visibility).toMatchObject({ totalRuns: 2, totalPrompts: 1, currentVisibility: 1 });
		const brandedOnly = await getBrandVisibility(brandId, window, { tags: "branded" });
		expect(brandedOnly.series.map((point) => point.visibility)).toEqual([0, 1, 1]);
	});

	it("returns an empty result when no prompt is in scope", async () => {
		expect(await getBrandVisibility(brandId, window, { search: "no prompt says this" })).toEqual({
			currentVisibility: null,
			totalRuns: 0,
			totalPrompts: 0,
			totalCitations: 0,
			series: [],
		});
	});
});

describe("share of voice", () => {
	it("ranks the brand against competitors by each prompt's latest mentions", async () => {
		const sov = await getBrandShareOfVoice(brandId, window);
		expect(sov.brandName).toBe("Acme");
		expect(sov.totalRuns).toBe(4);
		expect(sov.brandShare).toBe(0.5);
		expect(sov.entries).toEqual([
			{ name: "Acme", isBrand: true, mentions: 2, prompts: 2, share: 0.5 },
			{ name: "Globex", isBrand: false, mentions: 1, prompts: 1, share: 0.25 },
			{ name: "Initech", isBrand: false, mentions: 1, prompts: 1, share: 0.25 },
		]);
	});

	it("ends its trend on the headline share", async () => {
		const sov = await getBrandShareOfVoice(brandId, window);
		expect(sov.series.map((point) => point.date)).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
		expect(sov.series[0].share).toBeCloseTo(1 / 3);
		expect(sov.series[1].share).toBeCloseTo(2 / 5);
		expect(sov.series.at(-1)?.share).toBe(sov.brandShare);
	});
});

describe("citations", () => {
	it("merges URL variants and classifies brand and competitor pages", async () => {
		const { urls, totals } = await getBrandCitations(brandId, window);
		expect(totals).toEqual({ citations: 5, uniqueDomains: 3, uniqueUrls: 3 });
		expect(urls).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					url: "https://acme.example/pricing",
					category: "brand",
					count: 2,
					promptCount: 1,
					isNew: true,
				}),
				expect.objectContaining({ url: "https://globex.example/x", category: "competitor", count: 1, isNew: true }),
				expect.objectContaining({ url: "https://review.example/best", count: 2, promptCount: 2, isNew: false }),
			]),
		);
	});

	it("compares each domain with the preceding window of the same length", async () => {
		const { domains } = await getBrandCitations(brandId, window);
		const byDomain = Object.fromEntries(domains.map((domain) => [domain.domain, domain]));
		expect(byDomain["review.example"]).toMatchObject({ count: 2, previousCount: 1, changeFactor: 2, promptCount: 2 });
		expect(byDomain["acme.example"]).toMatchObject({ count: 2, share: 0.4, previousCount: 0, changeFactor: null });
	});
});

describe("prompt performance", () => {
	it("lists every enabled prompt, including ones with no runs in the window", async () => {
		const rows = await getBrandPromptPerformance(brandId, window);
		const byId = Object.fromEntries(rows.map((row) => [row.promptId, row]));
		expect(rows).toHaveLength(3);
		expect(byId[pricing]).toMatchObject({
			tags: ["pricing"],
			totalRuns: 2,
			brandMentionRate: 1,
			competitorMentionRate: 0.5,
			lastRunAt: "2026-03-03T00:00:00.000Z",
			firstEvaluatedAt: "2026-02-27T10:00:00.000Z",
		});
		expect(byId[branded]).toMatchObject({ totalRuns: 2, brandMentionRate: 0.5, competitorMentionRate: 1 });
		expect(byId[idle]).toMatchObject({ totalRuns: 0, lastRunAt: null, firstEvaluatedAt: null });
	});
});

describe("brand analytics", () => {
	it("reports the same totals as the individual sections", async () => {
		const analytics = await getBrandAnalytics(brandId, window);
		expect(analytics.totals).toEqual({ runs: 4, prompts: 3, citations: 5, uniqueDomains: 3, uniqueUrls: 3 });
		expect(analytics.visibility.current).toBe(1);
		expect(analytics.shareOfVoice.brand).toBe(0.5);
		expect(analytics.models).toEqual([
			{ model: "chatgpt", label: "ChatGPT", runs: 4, brandMentions: 3, visibility: 0.75, citations: 5 },
		]);
	});
});
