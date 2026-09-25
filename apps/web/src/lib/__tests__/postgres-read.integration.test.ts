import { UNAVAILABLE_SENTINEL } from "@/lib/fanout-analysis";
import {
	countPromptRuns,
	getBrandMentionRateByModel,
	getBrandMentionTotals,
	getCitationDomainPromptCounts,
	getCitationDomainStats,
	getCitationsTotalCount,
	getCitationUrlStats,
	getDashboardSummary,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getPerPromptDailyCompetitorMentions,
	getPerPromptDailyMentions,
	getPromptMentionSummary,
	getPromptRuns,
	getPromptsSummary,
	getPromptTopCompetitorMentions,
	getVisibilityDailyAggregate,
} from "@/lib/postgres-read";
import {
	createBrand,
	createCitation,
	createPrompt,
	createRun,
	deleteBrand,
} from "@/test/integration/stats-fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const brandIds: string[] = [];

async function brand(opts?: Parameters<typeof createBrand>[0]) {
	const id = await createBrand(opts);
	brandIds.push(id);
	return id;
}

afterAll(async () => {
	for (const id of brandIds) await deleteBrand(id);
});

describe("dashboard summary", () => {
	let brandId: string;
	let p1: string;

	beforeAll(async () => {
		brandId = await brand();
		p1 = await createPrompt(brandId);
		const p2 = await createPrompt(brandId);
		await createPrompt(brandId);
		await createRun(brandId, p1, { at: "2026-03-01T10:00:00Z", brandMentioned: true });
		await createRun(brandId, p1, { at: "2026-03-02T10:00:00Z", brandMentioned: false });
		await createRun(brandId, p2, { at: "2026-03-02T12:00:00Z", brandMentioned: true });
		await createRun(brandId, p2, { at: "2026-03-05T10:00:00Z", brandMentioned: false });

		const otherBrand = await brand();
		const otherPrompt = await createPrompt(otherBrand);
		await createRun(otherBrand, otherPrompt, { at: "2026-03-02T10:00:00Z", brandMentioned: true });
	});

	it("counts runs, prompts and visibility for the brand within the window", async () => {
		const [summary] = await getDashboardSummary(brandId, "2026-03-01", "2026-03-03", "UTC");
		expect(summary).toMatchObject({
			total_prompts: 2,
			total_runs: 3,
			avg_visibility: 67,
			last_updated: "2026-03-02T12:00:00.000Z",
		});
	});

	it("narrows to the enabled prompts", async () => {
		const [summary] = await getDashboardSummary(brandId, "2026-03-01", "2026-03-03", "UTC", [p1]);
		expect(summary).toMatchObject({ total_prompts: 1, total_runs: 2, avg_visibility: 50 });
	});

	it("covers all time without a window", async () => {
		const [summary] = await getDashboardSummary(brandId, null, null, "UTC");
		expect(summary).toMatchObject({ total_runs: 4, avg_visibility: 50 });
	});
});

describe("date windows", () => {
	let brandId: string;
	let promptId: string;

	beforeAll(async () => {
		brandId = await brand();
		promptId = await createPrompt(brandId);
		// 23:00 on March 3rd in New York, but already March 4th in UTC.
		await createRun(brandId, promptId, { at: "2026-03-04T03:00:00Z", brandMentioned: true, competitors: ["Globex"] });
		await createRun(brandId, promptId, { at: "2026-03-04T15:00:00Z", brandMentioned: false });
	});

	it("reads calendar days in the caller's timezone", async () => {
		const ny = await getBrandMentionTotals(brandId, "2026-03-03", "2026-03-03", "America/New_York", [promptId]);
		const utc = await getBrandMentionTotals(brandId, "2026-03-03", "2026-03-03", "UTC", [promptId]);
		expect(ny.total_runs).toBe(1);
		expect(utc.total_runs).toBe(0);
	});

	it("includes the whole of the last calendar day", async () => {
		const totals = await getBrandMentionTotals(brandId, "2026-03-04", "2026-03-04", "UTC", [promptId]);
		expect(totals.total_runs).toBe(2);
	});

	it("buckets daily rows by the caller's local date", async () => {
		const ny = await getPerPromptDailyMentions(brandId, "2026-03-01", "2026-03-05", "America/New_York", [promptId]);
		expect(ny.map((row) => [row.date, row.brand_mentions, row.competitor_mentions])).toEqual([
			["2026-03-03", 1, 1],
			["2026-03-04", 0, 0],
		]);
	});

	it("treats instant bounds as half-open", async () => {
		const totals = await getBrandMentionTotals(
			brandId,
			"2026-03-04T03:00:00.000Z",
			"2026-03-04T15:00:00.000Z",
			"UTC",
			[promptId],
		);
		expect(totals.total_runs).toBe(1);
		expect(await countPromptRuns(promptId, "2026-03-04T03:00:00.000Z", "2026-03-04T15:00:00.001Z", "UTC")).toBe(2);
	});
});

describe("daily visibility aggregate", () => {
	let brandId: string;
	let branded: string;
	let unbranded: string;
	let neverRan: string;

	beforeAll(async () => {
		brandId = await brand();
		branded = await createPrompt(brandId, { systemTags: ["branded"] });
		unbranded = await createPrompt(brandId);
		neverRan = await createPrompt(brandId);
		await createRun(brandId, unbranded, { at: "2026-03-02T09:00:00Z", brandMentioned: true });
		await createRun(brandId, unbranded, { at: "2026-03-02T10:00:00Z", brandMentioned: false });
		await createRun(brandId, branded, { at: "2026-03-03T09:00:00Z", brandMentioned: true });
		await createRun(brandId, unbranded, { at: "2026-03-04T09:00:00Z", brandMentioned: true });
	});

	it("carries each prompt's last observation across days it did not run", async () => {
		const rows = await getVisibilityDailyAggregate(
			brandId,
			"2026-03-01",
			"2026-03-05",
			"UTC",
			[branded, unbranded, neverRan],
			[branded],
		);

		expect(
			rows.map((row) => [
				row.date,
				row.lvcf_branded_runs,
				row.lvcf_branded_mentioned,
				row.lvcf_nonbranded_runs,
				row.lvcf_nonbranded_mentioned,
			]),
		).toEqual([
			// Before a prompt's first run, its first observation is back-filled.
			["2026-03-01", 1, 1, 2, 1],
			["2026-03-02", 1, 1, 2, 1],
			["2026-03-03", 1, 1, 2, 1],
			["2026-03-04", 1, 1, 1, 1],
			["2026-03-05", 1, 1, 1, 1],
		]);
	});

	it("keeps actual totals free of carried-forward values", async () => {
		const rows = await getVisibilityDailyAggregate(
			brandId,
			"2026-03-01",
			"2026-03-05",
			"UTC",
			[branded, unbranded, neverRan],
			[branded],
		);

		expect(
			rows.map((row) => [
				row.date,
				row.actual_branded_runs,
				row.actual_branded_mentioned,
				row.actual_nonbranded_runs,
				row.actual_nonbranded_mentioned,
			]),
		).toEqual([
			["2026-03-01", 0, 0, 0, 0],
			["2026-03-02", 0, 0, 2, 1],
			["2026-03-03", 1, 1, 0, 0],
			["2026-03-04", 0, 0, 1, 1],
			["2026-03-05", 0, 0, 0, 0],
		]);
	});

	it("counts every prompt as non-branded when none are branded", async () => {
		const rows = await getVisibilityDailyAggregate(brandId, "2026-03-03", "2026-03-03", "UTC", [branded, unbranded], []);
		expect(rows).toEqual([
			expect.objectContaining({
				date: "2026-03-03",
				actual_branded_runs: 0,
				actual_nonbranded_runs: 1,
				lvcf_nonbranded_runs: 1,
				lvcf_nonbranded_mentioned: 1,
			}),
		]);
	});
});

describe("model filter", () => {
	let brandId: string;
	let promptId: string;

	beforeAll(async () => {
		brandId = await brand();
		promptId = await createPrompt(brandId);
		const at = "2026-03-02T10:00:00Z";
		const grounded = await createRun(brandId, promptId, {
			at,
			brandMentioned: true,
			provider: "openai-api",
			webSearch: true,
		});
		const scraped = await createRun(brandId, promptId, { at, brandMentioned: false, provider: "brightdata" });
		await createRun(brandId, promptId, { at, brandMentioned: false, provider: "openai-api", webSearch: false });
		await createRun(brandId, promptId, { at, brandMentioned: true, model: "claude", provider: "anthropic-api" });
		await createCitation(grounded, "https://a.example/1");
		await createCitation(scraped, "https://b.example/1");
		await createCitation(scraped, "https://b.example/2");
	});

	it("separates a grounded API run from the scraped product", async () => {
		const standard = await getBrandMentionTotals(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId], "chatgpt");
		const premium = await getBrandMentionTotals(
			brandId,
			"2026-03-02",
			"2026-03-02",
			"UTC",
			[promptId],
			"chatgpt::premium",
		);
		expect(standard).toMatchObject({ total_runs: 2, brand_mentioned_runs: 0 });
		expect(premium).toMatchObject({ total_runs: 1, brand_mentioned_runs: 1 });
	});

	it("attributes citations through the run that produced them", async () => {
		const window = ["2026-03-02", "2026-03-02", "UTC", [promptId]] as const;
		expect(await getCitationsTotalCount(brandId, ...window, "chatgpt")).toBe(2);
		expect(await getCitationsTotalCount(brandId, ...window, "chatgpt::premium")).toBe(1);
		expect(await getCitationsTotalCount(brandId, ...window)).toBe(3);
	});

	it("breaks mention rate down by model", async () => {
		const rows = await getBrandMentionRateByModel(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId]);
		expect(rows).toEqual([
			{ model: "chatgpt", runs: 3, brand_mentioned_count: 1 },
			{ model: "claude", runs: 1, brand_mentioned_count: 1 },
		]);
	});
});

describe("prompt mention stats", () => {
	let brandId: string;
	let promptId: string;

	beforeAll(async () => {
		brandId = await brand();
		promptId = await createPrompt(brandId);
		const run = await createRun(brandId, promptId, {
			at: "2026-03-01T10:00:00Z",
			brandMentioned: true,
			competitors: ["Globex", "Initech"],
		});
		await createRun(brandId, promptId, { at: "2026-03-02T10:00:00Z", brandMentioned: false, competitors: ["Globex"] });
		await createRun(brandId, promptId, { at: "2026-03-02T11:00:00Z", brandMentioned: false });
		await createCitation(run, "https://a.example/1");
		await createCitation(run, "https://a.example/2");
	});

	it("summarizes brand and competitor mention rates", async () => {
		const [summary] = await getPromptsSummary(brandId, "2026-03-01", "2026-03-02", "UTC");
		expect(summary).toMatchObject({ prompt_id: promptId, total_runs: 3, total_weighted_mentions: 5 });
		expect(summary.brand_mention_rate).toBeCloseTo(1 / 3);
		expect(summary.competitor_mention_rate).toBeCloseTo(2 / 3);
		expect(await getPromptMentionSummary(promptId, "2026-03-01", "2026-03-02", "UTC")).toEqual({
			total_runs: 3,
			brand_mentioned_count: 1,
			competitor_mentioned_count: 3,
		});
	});

	it("ranks competitors by the runs that mentioned them", async () => {
		expect(await getPromptTopCompetitorMentions(promptId, "2026-03-01", "2026-03-02", "UTC", 5)).toEqual([
			{ competitor_name: "Globex", mention_count: 2 },
			{ competitor_name: "Initech", mention_count: 1 },
		]);
		expect(await getPromptTopCompetitorMentions(promptId, "2026-03-01", "2026-03-02", "UTC", 1)).toHaveLength(1);
	});

	it("counts competitor mentions per prompt and day", async () => {
		const rows = await getPerPromptDailyCompetitorMentions(brandId, "2026-03-01", "2026-03-02", "UTC", [promptId]);
		expect(rows.map((row) => [row.date, row.competitor, row.mentions])).toEqual(
			expect.arrayContaining([
				["2026-03-01", "Globex", 1],
				["2026-03-01", "Initech", 1],
				["2026-03-02", "Globex", 1],
			]),
		);
		expect(rows).toHaveLength(3);
	});

	it("pages a prompt's runs newest first with their citation counts", async () => {
		const window = ["2026-03-01", "2026-03-02", "UTC"] as const;
		expect(await countPromptRuns(promptId, ...window)).toBe(3);
		const firstPage = await getPromptRuns(promptId, ...window, 2, 0);
		const secondPage = await getPromptRuns(promptId, ...window, 2, 2);
		expect(firstPage.map((run) => run.brand_mentioned)).toEqual([false, false]);
		expect(secondPage).toEqual([expect.objectContaining({ brand_mentioned: true, citation_count: 2 })]);
	});
});

describe("citation stats", () => {
	let brandId: string;
	let p1: string;

	beforeAll(async () => {
		brandId = await brand();
		p1 = await createPrompt(brandId);
		const p2 = await createPrompt(brandId);
		const r1 = await createRun(brandId, p1, { at: "2026-03-01T10:00:00Z", brandMentioned: false });
		const r2 = await createRun(brandId, p2, { at: "2026-03-02T10:00:00Z", brandMentioned: false });
		const r3 = await createRun(brandId, p1, { at: "2026-03-02T11:00:00Z", brandMentioned: false });
		await createCitation(r1, "https://docs.example.com/a", { title: "Old title", index: 1 });
		await createCitation(r2, "https://docs.example.com/a", { title: "New title", index: 3 });
		await createCitation(r3, "https://docs.example.com/b", { index: 2 });
		await createCitation(r3, "https://news.example.org/x", { index: 1 });
		await createCitation(r3, "https://docs.example.com/a", { index: 2 });
	});

	it("counts citations per domain with the latest known title", async () => {
		const rows = await getCitationDomainStats(brandId, "2026-03-01", "2026-03-02", "UTC");
		expect(rows).toEqual([
			{ domain: "docs.example.com", count: 4, example_title: "New title" },
			{ domain: "news.example.org", count: 1, example_title: null },
		]);
	});

	it("reports each URL's count, average position and prompt reach", async () => {
		const rows = await getCitationUrlStats(brandId, "2026-03-01", "2026-03-02", "UTC");
		expect(rows[0]).toEqual({
			url: "https://docs.example.com/a",
			domain: "docs.example.com",
			title: "New title",
			count: 3,
			avg_position: 2,
			prompt_count: 2,
		});
		expect(rows).toHaveLength(3);
	});

	it("counts distinct prompts citing each domain", async () => {
		const counts = await getCitationDomainPromptCounts(brandId, "2026-03-01", "2026-03-02", "UTC");
		expect(Object.fromEntries(counts)).toEqual({ "docs.example.com": 2, "news.example.org": 1 });
		const onlyP1 = await getCitationDomainPromptCounts(brandId, "2026-03-01", "2026-03-02", "UTC", [p1]);
		expect(Object.fromEntries(onlyP1)).toEqual({ "docs.example.com": 1, "news.example.org": 1 });
	});
});

describe("query fan-out", () => {
	let brandId: string;
	let promptId: string;

	beforeAll(async () => {
		brandId = await brand();
		promptId = await createPrompt(brandId, { value: "Best CRM for startups" });
		const at = "2026-03-02T10:00:00Z";
		await createRun(brandId, promptId, {
			at,
			brandMentioned: true,
			webQueries: ["CRM pricing", " crm pricing", "best crm for startups", UNAVAILABLE_SENTINEL, ""],
		});
		await createRun(brandId, promptId, {
			at,
			brandMentioned: false,
			webQueries: ["crm pricing", "hubspot alternatives"],
		});
		await createRun(brandId, promptId, { at, brandMentioned: false, webQueries: [UNAVAILABLE_SENTINEL] });
		await createRun(brandId, promptId, { at, brandMentioned: false, webSearch: false });
	});

	it("counts genuine queries once per run, ignoring echoes of the prompt and the unavailable sentinel", async () => {
		const rows = await getFanoutBreakdown(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId]);
		expect(rows.map((row) => [row.query, row.count, row.brand_mentions]).sort()).toEqual([
			["crm pricing", 2, 1],
			["hubspot alternatives", 1, 0],
		]);
	});

	it("totals search runs separately from runs that fanned out", async () => {
		expect(await getFanoutModelTotals(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId])).toEqual([
			{ model: "chatgpt", runs: 3, fanout_runs: 2, total_queries: 3 },
		]);
		expect(await getFanoutPromptTotals(brandId, "2026-03-02", "2026-03-02", "UTC", [promptId])).toEqual([
			{ prompt_id: promptId, runs: 2 },
		]);
	});
});
