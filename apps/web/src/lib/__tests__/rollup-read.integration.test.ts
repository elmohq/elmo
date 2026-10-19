import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnalyticsScope } from "@/lib/analytics-sql";
import { UNAVAILABLE_SENTINEL } from "@/lib/fanout-analysis";
import {
	getCitationDomainPromptCounts,
	getCitationsCountByModel,
	getCitationTotal,
	getCitationUrlStats,
	getCompetitorTotals,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getMentionTotals,
	getPerPromptDailyCompetitors,
	getPerPromptDailyRuns,
	getPerPromptRunStats,
	getRunsByModel,
	getVisibilityDailyAggregate,
} from "@/lib/rollup-read";
import { NO_ASSESSMENTS } from "@/lib/sentiment";
import {
	createBrand,
	createCitation,
	createPrompt,
	createRun,
	deleteBrand,
	rebuildRollups,
} from "@/test/integration/stats-fixtures";

const brandIds: string[] = [];

async function brand(opts?: Parameters<typeof createBrand>[0]) {
	const id = await createBrand(opts);
	brandIds.push(id);
	return id;
}

afterAll(async () => {
	for (const id of brandIds) await deleteBrand(id);
});

function scope(
	brandId: string,
	from: string | null,
	to: string | null,
	timezone: string,
	rest: Partial<AnalyticsScope> = {},
): AnalyticsScope {
	return { brandId, from, to, timezone, ...rest };
}

describe("mention totals", () => {
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
		await rebuildRollups(brandId);
		await rebuildRollups(otherBrand);
	});

	it("counts runs, prompts and mentions for the brand within the window", async () => {
		expect(await getMentionTotals(scope(brandId, "2026-03-01", "2026-03-03", "UTC"))).toMatchObject({
			prompts: 2,
			runs: 3,
			brand_mentioned_runs: 2,
			brand_mentioned_prompts: 2,
			last_run_at: "2026-03-02T12:00:00.000Z",
		});
	});

	it("narrows to the given prompts", async () => {
		const totals = await getMentionTotals(scope(brandId, "2026-03-01", "2026-03-03", "UTC", { promptIds: [p1] }));
		expect(totals).toMatchObject({ prompts: 1, runs: 2, brand_mentioned_runs: 1 });
	});

	it("matches nothing for an empty prompt list", async () => {
		const totals = await getMentionTotals(scope(brandId, null, null, "UTC", { promptIds: [] }));
		expect(totals).toMatchObject({ runs: 0, prompts: 0, last_run_at: null });
	});

	it("covers all time without a window", async () => {
		const totals = await getMentionTotals(scope(brandId, null, null, "UTC"));
		expect(totals).toMatchObject({ runs: 4, brand_mentioned_runs: 2 });
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
		await rebuildRollups(brandId);
	});

	it("reads calendar days in the caller's timezone", async () => {
		const runs = async (day: string, timezone: string) =>
			(await getMentionTotals(scope(brandId, day, day, timezone, { promptIds: [promptId] }))).runs;
		expect(await runs("2026-03-03", "America/New_York")).toBe(1);
		expect(await runs("2026-03-03", "UTC")).toBe(0);
		// Ahead of UTC, the day starts the evening before: 03:00Z is already mid-morning.
		expect(await runs("2026-03-04", "Asia/Kolkata")).toBe(2);
	});

	it("includes the whole of the last calendar day", async () => {
		const totals = await getMentionTotals(scope(brandId, "2026-03-04", "2026-03-04", "UTC", { promptIds: [promptId] }));
		expect(totals.runs).toBe(2);
	});

	it("buckets daily rows by the caller's local date", async () => {
		const ny = await getPerPromptDailyRuns(
			scope(brandId, "2026-03-01", "2026-03-05", "America/New_York", { promptIds: [promptId] }),
		);
		expect(ny.map((row) => [row.date, row.runs, row.brand_mentioned_runs, row.competitor_mentions])).toEqual([
			["2026-03-03", 1, 1, 1],
			["2026-03-04", 1, 0, 0],
		]);
	});

	it("treats instant bounds as half-open", async () => {
		const totals = await getMentionTotals(
			scope(brandId, "2026-03-04T03:00:00.000Z", "2026-03-04T15:00:00.000Z", "UTC", { promptIds: [promptId] }),
		);
		expect(totals.runs).toBe(1);
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
		await rebuildRollups(brandId);
	});

	it("carries each prompt's last observation across days it did not run", async () => {
		const rows = await getVisibilityDailyAggregate(
			{ brandId, from: "2026-03-01", to: "2026-03-05", timezone: "UTC", promptIds: [branded, unbranded, neverRan] },
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
			{ brandId, from: "2026-03-01", to: "2026-03-05", timezone: "UTC", promptIds: [branded, unbranded, neverRan] },
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
		const rows = await getVisibilityDailyAggregate(
			{ brandId, from: "2026-03-03", to: "2026-03-03", timezone: "UTC", promptIds: [branded, unbranded] },
			[],
		);
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
		await rebuildRollups(brandId);
	});

	const day = (model?: string) => scope(brandId, "2026-03-02", "2026-03-02", "UTC", { promptIds: [promptId], model });

	it("separates a grounded API run from the scraped product", async () => {
		expect(await getMentionTotals(day("chatgpt"))).toMatchObject({ runs: 2, brand_mentioned_runs: 0 });
		expect(await getMentionTotals(day("chatgpt::premium"))).toMatchObject({ runs: 1, brand_mentioned_runs: 1 });
	});

	it("attributes citations through the run that produced them", async () => {
		expect(await getCitationTotal(day("chatgpt"))).toBe(2);
		expect(await getCitationTotal(day("chatgpt::premium"))).toBe(1);
		expect(await getCitationTotal(day())).toBe(3);
	});

	it("breaks runs down by model", async () => {
		const rows = await getRunsByModel(day());
		expect(rows.map((row) => [row.model, row.runs, row.brand_mentioned_runs])).toEqual([
			["chatgpt", 3, 1],
			["claude", 1, 1],
		]);
	});

	it("breaks citations down by model within the model filter", async () => {
		expect(await getCitationsCountByModel(day())).toEqual([{ model: "chatgpt", count: 3 }]);
		expect(await getCitationsCountByModel(day("chatgpt"))).toEqual([{ model: "chatgpt", count: 2 }]);
		expect(await getCitationsCountByModel(day("chatgpt::premium"))).toEqual([{ model: "chatgpt", count: 1 }]);
		expect(await getCitationsCountByModel(day("claude"))).toEqual([]);
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
		await rebuildRollups(brandId);
	});

	const window = () => scope(brandId, "2026-03-01", "2026-03-02", "UTC", { promptIds: [promptId] });

	it("totals a prompt's runs by who they mentioned", async () => {
		expect(await getMentionTotals(window())).toEqual({
			runs: 3,
			brand_mentioned_runs: 1,
			competitor_runs: 2,
			competitor_mentions: 3,
			no_mention_runs: 1,
			// No judge ran on these runs, so none has a sentiment.
			positive_runs: 0,
			neutral_runs: 0,
			negative_runs: 0,
			mixed_runs: 0,
			position_sum: 0,
			positioned_runs: 0,
			prompts: 1,
			brand_mentioned_prompts: 1,
			last_run_at: "2026-03-02T11:00:00.000Z",
		});
	});

	it("reports each prompt's run days and last run in the scope's timezone", async () => {
		expect(await getPerPromptRunStats(window())).toEqual([
			expect.objectContaining({
				prompt_id: promptId,
				runs: 3,
				run_days: 2,
				brand_mentioned_runs: 1,
				competitor_runs: 2,
				last_run_at: "2026-03-02T11:00:00.000Z",
				last_run_date: "2026-03-02",
			}),
		]);
		// 11:00Z is already the next morning at UTC+14.
		const [kiritimati] = await getPerPromptRunStats(
			scope(brandId, null, null, "Pacific/Kiritimati", { promptIds: [promptId] }),
		);
		expect(kiritimati).toMatchObject({ last_run_at: "2026-03-02T11:00:00.000Z", last_run_date: "2026-03-03" });
	});

	it("ranks competitors by the runs that mentioned them", async () => {
		expect(await getCompetitorTotals(window(), 5)).toEqual([
			{ competitor: "Globex", runs: 2, ...NO_ASSESSMENTS },
			{ competitor: "Initech", runs: 1, ...NO_ASSESSMENTS },
		]);
		expect(await getCompetitorTotals(window(), 1)).toHaveLength(1);
	});

	it("counts competitor mentions per prompt and day", async () => {
		const rows = await getPerPromptDailyCompetitors(window());
		expect(rows.map((row) => [row.date, row.competitor, row.runs])).toEqual(
			expect.arrayContaining([
				["2026-03-01", "Globex", 1],
				["2026-03-01", "Initech", 1],
				["2026-03-02", "Globex", 1],
			]),
		);
		expect(rows).toHaveLength(3);
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
		await rebuildRollups(brandId);
	});

	it("reports each URL's count, average position and prompt reach", async () => {
		const rows = await getCitationUrlStats(scope(brandId, "2026-03-01", "2026-03-02", "UTC"));
		expect(rows[0]).toEqual({
			url: "https://docs.example.com/a",
			domain: "docs.example.com",
			title: "New title",
			static_category: expect.any(String),
			page_type: expect.any(String),
			count: 3,
			avg_position: 2,
			prompt_count: 2,
		});
		expect(rows).toHaveLength(3);
	});

	it("counts distinct prompts citing each domain", async () => {
		const counts = await getCitationDomainPromptCounts(scope(brandId, "2026-03-01", "2026-03-02", "UTC"));
		expect(Object.fromEntries(counts)).toEqual({ "docs.example.com": 2, "news.example.org": 1 });
		const onlyP1 = await getCitationDomainPromptCounts(
			scope(brandId, "2026-03-01", "2026-03-02", "UTC", { promptIds: [p1] }),
		);
		expect(Object.fromEntries(onlyP1)).toEqual({ "docs.example.com": 1, "news.example.org": 1 });
	});
});

describe("query fan-out", () => {
	let brandId: string;
	let promptId: string;
	const scope = () => ({ brandId, from: "2026-03-02", to: "2026-03-02", timezone: "UTC", promptIds: [promptId] });

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
		await rebuildRollups(brandId);
	});

	it("counts genuine queries once per run, ignoring echoes of the prompt and the unavailable sentinel", async () => {
		const rows = await getFanoutBreakdown(scope());
		expect(rows.map((row) => [row.query, row.count, row.brand_mentions]).sort()).toEqual([
			["crm pricing", 2, 1],
			["hubspot alternatives", 1, 0],
		]);
	});

	it("totals search runs separately from runs that fanned out", async () => {
		expect(await getFanoutModelTotals(scope())).toEqual([
			{ model: "chatgpt", runs: 3, fanout_runs: 2, total_queries: 3 },
		]);
		expect(await getFanoutPromptTotals(scope())).toEqual([{ prompt_id: promptId, runs: 2 }]);
	});

	it("follows the prompt's current text once its buckets are rebuilt", async () => {
		await db.update(prompts).set({ value: "CRM pricing" }).where(eq(prompts.id, promptId));
		await rebuildRollups(brandId);
		const rows = await getFanoutBreakdown(scope());
		expect(rows.map((row) => row.query).sort()).toEqual(["best crm for startups", "hubspot alternatives"]);
		await db.update(prompts).set({ value: "Best CRM for startups" }).where(eq(prompts.id, promptId));
		await rebuildRollups(brandId);
	});
});
