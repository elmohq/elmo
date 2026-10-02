import { classifyUrl } from "@workspace/lib/citations/domain-lists";
import { rollUpCitationUrls } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import {
	citations,
	promptRuns,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupDirty,
	rollupPromptRuns,
} from "@workspace/lib/db/schema";
import { bucketStart } from "@workspace/lib/rollups";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { LookbackPeriod } from "@/lib/lookback";
import { countPromptRuns, getResponseMatches } from "@/lib/postgres-read";
import type { CitationDomainStats, PerPromptCitationPageRow } from "@/lib/rollup-read";
import * as rollupRead from "@/lib/rollup-read";
import { resolveBrandWindow } from "@/server/brand-window";
import { deletePrompt } from "@/server/prompts-core";
import * as rawRead from "@/test/raw-analytics-reads";
import {
	ALL_PROMPT_IDS,
	BRAND_ID,
	BRANDED_PROMPT_IDS,
	NOW,
	PROMPTS,
	reset,
	SEED_RUNS,
	seedAndRebuild,
} from "./rollup-parity.fixtures";

// Ties in an ORDER BY aren't stable, so rows are compared as a sorted set.

function sortKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	if (value instanceof Date) return value.toISOString();
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => (a < b ? -1 : Number(a > b)))
				.map(([key, v]) => [key, sortKeysDeep(v)]),
		);
	}
	return value;
}

function canonicalRows(rows: object[]): string[] {
	return rows.map((row) => JSON.stringify(sortKeysDeep(row))).sort();
}

function expectSameRows(label: string, rollupRows: object[], rawRows: object[]): void {
	expect(canonicalRows(rollupRows), label).toEqual(canonicalRows(rawRows));
}

// Raw URL rows are grouped by literal url and rollup rows by normalized page, so both
// sides are folded through rollUpCitationUrls before comparing.

const classify = (domain: string, url: string, title?: string) =>
	classifyUrl(domain, url, title ?? null, new Set(), new Set());

function foldCitationUrlRows(
	rows: { url: string; domain: string; title: string | null; count: number; avg_position: number | null }[],
): object[] {
	return rollUpCitationUrls(rows, classify).map((u) => ({
		url: u.url,
		domain: u.domain,
		title: u.title ?? null,
		count: u.count,
		category: u.category,
		pageType: u.pageType,
		avgPosition: u.avgPosition,
	}));
}

function foldPerPromptCitationPageRows(rows: PerPromptCitationPageRow[]): object[] {
	const byPrompt = new Map<
		string,
		{ url: string; domain: string; title: string | null; count: number; avg_position: number | null }[]
	>();
	for (const row of rows) {
		if (!row.url) continue;
		const list = byPrompt.get(row.prompt_id) ?? [];
		list.push({ url: row.url, domain: row.domain, title: row.title, count: row.count, avg_position: null });
		byPrompt.set(row.prompt_id, list);
	}
	const out: object[] = [];
	for (const [promptId, rows_] of byPrompt) {
		for (const row of foldCitationUrlRows(rows_)) out.push({ promptId, ...row });
	}
	return out;
}

// example_title differs from raw by design: rollups can't tell which page was cited most recently.
function stripExampleTitle(rows: CitationDomainStats[]): object[] {
	return rows.map(({ domain, count }) => ({ domain, count }));
}

interface EquivalenceCombo {
	fromDateStr: string;
	toDateStr: string;
	timezone: string;
	model?: string;
	promptIds: string[];
}

interface EquivalenceCase {
	name: string;
	check(combo: EquivalenceCombo, label: string): Promise<void>;
}

type GroupAFn<R> = (
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
) => Promise<R>;

function arrayCase<R extends object>(name: string, rollupFn: GroupAFn<R[]>, rawFn: GroupAFn<R[]>): EquivalenceCase {
	return {
		name,
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupFn(BRAND_ID, combo.fromDateStr, combo.toDateStr, combo.timezone, combo.promptIds, combo.model),
				rawFn(BRAND_ID, combo.fromDateStr, combo.toDateStr, combo.timezone, combo.promptIds, combo.model),
			]);
			expectSameRows(label, rollupRows, rawRows);
		},
	};
}

function scalarCase<R>(name: string, rollupFn: GroupAFn<R>, rawFn: GroupAFn<R>): EquivalenceCase {
	return {
		name,
		async check(combo, label) {
			const [rollupValue, rawValue] = await Promise.all([
				rollupFn(BRAND_ID, combo.fromDateStr, combo.toDateStr, combo.timezone, combo.promptIds, combo.model),
				rawFn(BRAND_ID, combo.fromDateStr, combo.toDateStr, combo.timezone, combo.promptIds, combo.model),
			]);
			expect(rollupValue, label).toEqual(rawValue);
		},
	};
}

const EQUIVALENCE_CASES: EquivalenceCase[] = [
	arrayCase("getDashboardSummary", rollupRead.getDashboardSummary, rawRead.getDashboardSummary),
	arrayCase(
		"getPerPromptVisibilityTimeSeries",
		rollupRead.getPerPromptVisibilityTimeSeries,
		rawRead.getPerPromptVisibilityTimeSeries,
	),
	scalarCase("getCitationsTotalCount", rollupRead.getCitationsTotalCount, rawRead.getCitationsTotalCount),
	{
		name: "getCitationDomainStats",
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupRead.getCitationDomainStats(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					combo.model,
				),
				rawRead.getCitationDomainStats(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					combo.model,
				),
			]);
			expectSameRows(label, stripExampleTitle(rollupRows), stripExampleTitle(rawRows));
		},
	},
	{
		name: "getCitationUrlStats",
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupRead.getCitationUrlStats(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					combo.model,
				),
				rawRead.getCitationUrlStats(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					combo.model,
				),
			]);
			expectSameRows(label, foldCitationUrlRows(rollupRows), foldCitationUrlRows(rawRows));
		},
	},
	scalarCase(
		"getCitationDomainPromptCounts",
		rollupRead.getCitationDomainPromptCounts,
		rawRead.getCitationDomainPromptCounts,
	),
	arrayCase("getDailyCitationStats", rollupRead.getDailyCitationStats, rawRead.getDailyCitationStats),
	arrayCase(
		"getPerPromptDailyCitationStats",
		rollupRead.getPerPromptDailyCitationStats,
		rawRead.getPerPromptDailyCitationStats,
	),
	arrayCase("getPerPromptRunStats", rollupRead.getPerPromptRunStats, rawRead.getPerPromptRunStats),
	scalarCase("getBrandMentionTotals", rollupRead.getBrandMentionTotals, rawRead.getBrandMentionTotals),
	arrayCase("getPerPromptDailyMentions", rollupRead.getPerPromptDailyMentions, rawRead.getPerPromptDailyMentions),
	// Only agrees while no run lists a competitor twice: the rollup counts distinct runs,
	// raw counts unnested rows.
	arrayCase(
		"getPerPromptDailyCompetitorMentions",
		rollupRead.getPerPromptDailyCompetitorMentions,
		rawRead.getPerPromptDailyCompetitorMentions,
	),
	{
		name: "getPerPromptCitationPages",
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupRead.getPerPromptCitationPages(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					combo.model,
				),
				rawRead.getPerPromptCitationPages(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					combo.model,
				),
			]);
			expectSameRows(label, foldPerPromptCitationPageRows(rollupRows), foldPerPromptCitationPageRows(rawRows));
		},
	},
	arrayCase("getBrandMentionRateByModel", rollupRead.getBrandMentionRateByModel, rawRead.getBrandMentionRateByModel),
	{
		name: "getPromptsSummary",
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupRead.getPromptsSummary(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					undefined,
					combo.model,
					combo.promptIds,
				),
				rawRead.getPromptsSummary(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					undefined,
					combo.model,
					combo.promptIds,
				),
			]);
			expectSameRows(label, rollupRows, rawRows);
		},
	},
	{
		name: "getVisibilityDailyAggregate",
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupRead.getVisibilityDailyAggregate(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					BRANDED_PROMPT_IDS,
					combo.model,
				),
				rawRead.getVisibilityDailyAggregate(
					BRAND_ID,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					combo.promptIds,
					BRANDED_PROMPT_IDS,
					combo.model,
				),
			]);
			expectSameRows(label, rollupRows, rawRows);
		},
	},
	{
		name: "getBatchChartData",
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupRead.getBatchChartData(
					BRAND_ID,
					combo.promptIds,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					undefined,
					combo.model,
				),
				rawRead.getBatchChartData(
					BRAND_ID,
					combo.promptIds,
					combo.fromDateStr,
					combo.toDateStr,
					combo.timezone,
					undefined,
					combo.model,
				),
			]);
			expectSameRows(label, rollupRows, rawRows);
		},
	},
	{
		name: "countResponses",
		async check(combo, label) {
			const scope = {
				brandId: BRAND_ID,
				fromDate: combo.fromDateStr,
				toDate: combo.toDateStr,
				timezone: combo.timezone,
				promptIds: combo.promptIds,
				model: combo.model,
			};
			expect(await rollupRead.countResponses(scope), label).toBe(await rawRead.countResponses(scope));
		},
	},
	{
		name: "getPromptsFirstEvaluatedAt",
		async check(combo, label) {
			const [rollupRows, rawRows] = await Promise.all([
				rollupRead.getPromptsFirstEvaluatedAt(BRAND_ID, combo.promptIds),
				rawRead.getPromptsFirstEvaluatedAt(BRAND_ID, combo.promptIds),
			]);
			expectSameRows(label, rollupRows, rawRows);
		},
	},
];

// Windows are resolved inside each test because "all" depends on data seeded in beforeEach.

const LOOKBACKS: LookbackPeriod[] = ["1w", "1m", "all"];
const TIMEZONES = ["UTC", "America/Los_Angeles", "Asia/Kolkata"];
const MODEL_FILTERS: (string | undefined)[] = [undefined, "chatgpt", "chatgpt::premium"];
const PROMPT_SUBSETS: [string, string[]][] = [
	["all enabled", ALL_PROMPT_IDS],
	["branded only", BRANDED_PROMPT_IDS],
];

interface ComboSpec {
	label: string;
	lookback: LookbackPeriod;
	timezone: string;
	model?: string;
	promptIds: string[];
}

function buildCombos(): ComboSpec[] {
	const combos: ComboSpec[] = [];
	for (const lookback of LOOKBACKS) {
		for (const timezone of TIMEZONES) {
			for (const model of MODEL_FILTERS) {
				for (const [subsetName, promptIds] of PROMPT_SUBSETS) {
					combos.push({
						lookback,
						timezone,
						model,
						promptIds,
						label: `${lookback} ${timezone} model=${model ?? "none"} prompts=${subsetName}`,
					});
				}
			}
		}
	}
	return combos;
}

const COMBOS = buildCombos();

describe("rollup reads against raw", () => {
	beforeEach(async () => {
		await reset(db);
		await seedAndRebuild(db);
	});

	describe("read equivalence: rollup-read matches the raw reference", () => {
		for (const combo of COMBOS) {
			it(combo.label, async () => {
				const window = await resolveBrandWindow(BRAND_ID, combo.lookback, combo.timezone, { now: NOW });
				const resolved: EquivalenceCombo = { ...window, model: combo.model, promptIds: combo.promptIds };
				for (const equivalenceCase of EQUIVALENCE_CASES) {
					await equivalenceCase.check(resolved, `${equivalenceCase.name} ${combo.label}`);
				}
			});
		}
	});

	describe("read equivalence: prompt-scoped functions", () => {
		const representativePromptIds = [PROMPTS[0].id, PROMPTS[2].id, PROMPTS[5].id];

		for (const lookback of LOOKBACKS) {
			for (const timezone of TIMEZONES) {
				it(`${lookback} ${timezone}`, async () => {
					const window = await resolveBrandWindow(BRAND_ID, lookback, timezone, { now: NOW });
					for (const promptId of representativePromptIds) {
						const label = `promptId=${promptId} ${lookback} ${timezone}`;

						const [rollupUrlRows, rawUrlRows] = await Promise.all([
							rollupRead.getPromptCitationUrlStats(promptId, window.fromDateStr, window.toDateStr, timezone),
							rawRead.getPromptCitationUrlStats(promptId, window.fromDateStr, window.toDateStr, timezone),
						]);
						expectSameRows(label, foldCitationUrlRows(rollupUrlRows), foldCitationUrlRows(rawUrlRows));

						const [rollupSummary, rawSummary] = await Promise.all([
							rollupRead.getPromptMentionSummary(promptId, window.fromDateStr, window.toDateStr, timezone),
							rawRead.getPromptMentionSummary(promptId, window.fromDateStr, window.toDateStr, timezone),
						]);
						expect(rollupSummary, label).toEqual(rawSummary);

						// Same duplicate-competitor caveat as getPerPromptDailyCompetitorMentions.
						const [rollupTop, rawTop] = await Promise.all([
							rollupRead.getPromptTopCompetitorMentions(promptId, window.fromDateStr, window.toDateStr, timezone, 10),
							rawRead.getPromptTopCompetitorMentions(promptId, window.fromDateStr, window.toDateStr, timezone, 10),
						]);
						expectSameRows(label, rollupTop, rawTop);
					}
				});
			}
		}
	});

	describe("prompt deletion", () => {
		it("removes the prompt's rollup rows in the same stroke as its raw rows, leaving other prompts untouched", async () => {
			const promptId = PROMPTS[2].id;
			const otherPromptId = PROMPTS[0].id;

			expect((await db.select().from(promptRuns).where(eq(promptRuns.promptId, promptId))).length).toBeGreaterThan(0);
			expect(
				(await db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.promptId, promptId))).length,
			).toBeGreaterThan(0);
			expect(
				(await db.select().from(rollupCitationUrls).where(eq(rollupCitationUrls.promptId, promptId))).length,
			).toBeGreaterThan(0);

			await deletePrompt(promptId);

			expect(await db.select().from(promptRuns).where(eq(promptRuns.promptId, promptId))).toEqual([]);
			expect(await db.select().from(citations).where(eq(citations.promptId, promptId))).toEqual([]);
			expect(await db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.promptId, promptId))).toEqual([]);
			expect(
				await db.select().from(rollupCompetitorMentions).where(eq(rollupCompetitorMentions.promptId, promptId)),
			).toEqual([]);
			expect(await db.select().from(rollupCitationUrls).where(eq(rollupCitationUrls.promptId, promptId))).toEqual([]);
			expect((await db.select().from(rollupDirty).where(eq(rollupDirty.brandId, BRAND_ID))).length).toBeGreaterThan(0);

			expect((await db.select().from(promptRuns).where(eq(promptRuns.promptId, otherPromptId))).length).toBeGreaterThan(
				0,
			);
			expect(
				(await db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.promptId, otherPromptId))).length,
			).toBeGreaterThan(0);
		});
	});

	describe("resolveBrandWindow", () => {
		it("finds the brand's earliest run where the raw rows do", async () => {
			expect(await rollupRead.getBrandEarliestRunDate(BRAND_ID)).toEqual(
				await rawRead.getBrandEarliestRunDate(BRAND_ID),
			);
		});

		it("opens the 'all' window at the brand's earliest run, read as a calendar day in the viewer's timezone", async () => {
			// The earliest run, 2026-07-01T06:59:00Z, is still June 30 in Los Angeles.
			expect((await resolveBrandWindow(BRAND_ID, "all", "UTC", { now: NOW })).fromDateStr).toBe("2026-07-01");
			expect((await resolveBrandWindow(BRAND_ID, "all", "Asia/Kolkata", { now: NOW })).fromDateStr).toBe("2026-07-01");
			expect((await resolveBrandWindow(BRAND_ID, "all", "America/Los_Angeles", { now: NOW })).fromDateStr).toBe(
				"2026-06-30",
			);
		});
	});

	describe("live prompts only", () => {
		it("ignores rollup rows left behind by a prompt the brand no longer has", async () => {
			const before = await rollupRead.getDashboardSummary(BRAND_ID, null, null, "UTC");
			// What a prompt deleted by a release without rollups leaves behind.
			await db.insert(rollupPromptRuns).values({
				brandId: BRAND_ID,
				bucket: new Date("2026-06-01T00:00:00.000Z"),
				promptId: "dddddddd-0000-4000-8000-0000000000ff",
				model: "chatgpt",
				provider: "",
				webSearchEnabled: false,
				runs: 5,
				brandMentionedRuns: 5,
				competitorRuns: 0,
				competitorMentions: 0,
				noMentionRuns: 0,
				firstRunAt: new Date("2026-06-01T00:01:00.000Z"),
				lastRunAt: new Date("2026-06-01T00:02:00.000Z"),
			});

			expect(await rollupRead.getDashboardSummary(BRAND_ID, null, null, "UTC")).toEqual(before);
			expect(await rollupRead.getBrandEarliestRunDate(BRAND_ID)).toEqual(
				await rawRead.getBrandEarliestRunDate(BRAND_ID),
			);
		});
	});

	// Local midnight here falls mid-bucket, so the rollups put a run from the first
	// quarter hour of a day on the day before, and every window agrees with that.
	describe("a timezone whose midnight isn't on a bucket boundary", () => {
		const timezone = "Asia/Kathmandu";
		const OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
		const attributedDay = (createdAt: string) =>
			new Date(bucketStart(new Date(createdAt)).getTime() + OFFSET_MS).toISOString().slice(0, 10);
		const trueLocalDay = (createdAt: string) => new Date(Date.parse(createdAt) + OFFSET_MS).toISOString().slice(0, 10);
		const totalRuns = async (from: string, to: string) =>
			(await rollupRead.getBrandMentionTotals(BRAND_ID, from, to, timezone)).total_runs;

		it("seeds runs in the first quarter hour of a local day", () => {
			expect(SEED_RUNS.some((run) => attributedDay(run.createdAt) !== trueLocalDay(run.createdAt))).toBe(true);
		});

		it("puts each run on the local day its bucket starts on", async () => {
			const rows = await rollupRead.getPerPromptDailyMentions(
				BRAND_ID,
				"2026-06-30",
				"2026-07-11",
				timezone,
				ALL_PROMPT_IDS,
			);
			const byDay: Record<string, number> = {};
			for (const row of rows) byDay[row.date] = (byDay[row.date] ?? 0) + row.brand_mentions;
			const expected: Record<string, number> = {};
			for (const run of SEED_RUNS.filter((r) => r.brandMentioned)) {
				const day = attributedDay(run.createdAt);
				expected[day] = (expected[day] ?? 0) + 1;
			}
			expect(byDay).toEqual(expected);
		});

		it("counts every run once across adjacent windows", async () => {
			const whole = await totalRuns("2026-06-30", "2026-07-11");
			expect(whole).toBe(SEED_RUNS.length);
			for (const split of ["2026-07-02", "2026-07-05", "2026-07-08"]) {
				const dayBefore = new Date(Date.parse(split) - 86_400_000).toISOString().slice(0, 10);
				expect((await totalRuns("2026-06-30", dayBefore)) + (await totalRuns(split, "2026-07-11"))).toBe(whole);
			}
		});

		it("windows raw run lists the same way", async () => {
			for (const [from, to] of [
				["2026-07-02", "2026-07-02"],
				["2026-07-03", "2026-07-06"],
			]) {
				const scope = { brandId: BRAND_ID, fromDate: from, toDate: to, timezone, promptIds: ALL_PROMPT_IDS };
				const expected = SEED_RUNS.filter((run) => {
					const day = attributedDay(run.createdAt);
					return day >= from && day <= to;
				}).length;
				const [firstMatch] = await getResponseMatches(scope, 1, 0);
				expect(firstMatch?.matched ?? 0).toBe(expected);
				expect(await rollupRead.countResponses(scope)).toBe(expected);
				let listed = 0;
				for (const promptId of ALL_PROMPT_IDS) listed += await countPromptRuns(promptId, from, to, timezone);
				expect(listed).toBe(expected);
			}
		});
	});
});
