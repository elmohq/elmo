import { normalizeUrl } from "@workspace/lib/citations/domain-categories";
import { classifyPage } from "@workspace/lib/citations/page-classification";
import { db } from "@workspace/lib/db/db";
import {
	citations,
	promptRuns,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupPromptRuns,
} from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { DailyScope } from "@/lib/analytics-sql";
import type { LookbackPeriod } from "@/lib/lookback";
import { countPromptRuns, getResponseMatches } from "@/lib/postgres-read";
import type { PerPromptCitationPageRow } from "@/lib/rollup-read";
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

interface UrlRow {
	url: string;
	domain: string;
	title: string | null;
	count: number;
	avg_position: number | null;
	static_category?: string;
	page_type?: string;
}

// Raw URL rows are grouped by literal url and rollup rows by normalized page, so both
// sides are folded to pages. Raw pages are classified the way a rebuild stores them.
function foldCitationUrlRows(rows: UrlRow[]): object[] {
	const pages = new Map<string, UrlRow & { positionSum: number }>();
	for (const row of rows) {
		const url = normalizeUrl(row.url);
		const page = pages.get(url) ?? { ...row, url, title: null, count: 0, positionSum: 0 };
		page.count += Number(row.count);
		page.positionSum += (row.avg_position ?? 0) * Number(row.count);
		page.title ??= row.title;
		pages.set(url, page);
	}
	return [...pages.values()].map((page) => {
		const stored = page.static_category
			? { staticCategory: page.static_category, pageType: page.page_type }
			: classifyPage(page.url, page.domain, page.title);
		return {
			url: page.url,
			domain: page.domain,
			title: page.title,
			count: page.count,
			avgPosition: Math.round((page.positionSum / page.count) * 10) / 10,
			...stored,
		};
	});
}

function foldPerPromptCitationPageRows(rows: PerPromptCitationPageRow[]): object[] {
	const byPrompt = new Map<string, UrlRow[]>();
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

type EquivalenceScope = DailyScope;

interface EquivalenceCase {
	name: string;
	check(scope: EquivalenceScope, label: string): Promise<void>;
}

type ScopedRead<R> = (scope: EquivalenceScope) => Promise<R>;

function rowsCase<R extends object>(
	name: string,
	rollupFn: ScopedRead<R[]>,
	rawFn: ScopedRead<R[]>,
	fold: (rows: R[]) => object[] = (rows) => rows,
): EquivalenceCase {
	return {
		name,
		async check(scope, label) {
			const [rollupRows, rawRows] = await Promise.all([rollupFn(scope), rawFn(scope)]);
			expectSameRows(label, fold(rollupRows), fold(rawRows));
		},
	};
}

function valueCase<R>(name: string, rollupFn: ScopedRead<R>, rawFn: ScopedRead<R>): EquivalenceCase {
	return {
		name,
		async check(scope, label) {
			const [rollupValue, rawValue] = await Promise.all([rollupFn(scope), rawFn(scope)]);
			expect(rollupValue, label).toEqual(rawValue);
		},
	};
}

const EQUIVALENCE_CASES: EquivalenceCase[] = [
	valueCase("getMentionTotals", rollupRead.getMentionTotals, rawRead.getMentionTotals),
	rowsCase("getPerPromptDailyRuns", rollupRead.getPerPromptDailyRuns, rawRead.getPerPromptDailyRuns),
	// The competitor reads only agree while no run lists a competitor twice: the rollup
	// counts distinct runs, raw counts unnested rows.
	rowsCase(
		"getPerPromptDailyCompetitors",
		rollupRead.getPerPromptDailyCompetitors,
		rawRead.getPerPromptDailyCompetitors,
	),
	rowsCase("getCompetitorTotals", rollupRead.getCompetitorTotals, rawRead.getCompetitorTotals),
	rowsCase("getPerPromptRunStats", rollupRead.getPerPromptRunStats, rawRead.getPerPromptRunStats),
	rowsCase("getRunsByModel", rollupRead.getRunsByModel, rawRead.getRunsByModel),
	rowsCase(
		"getVisibilityDailyAggregate",
		(scope) => rollupRead.getVisibilityDailyAggregate(scope, BRANDED_PROMPT_IDS),
		(scope) => rawRead.getVisibilityDailyAggregate(scope, BRANDED_PROMPT_IDS),
	),
	valueCase("getCitationTotal", rollupRead.getCitationTotal, rawRead.getCitationTotal),
	rowsCase("getCitationUrlStats", rollupRead.getCitationUrlStats, rawRead.getCitationUrlStats, foldCitationUrlRows),
	rowsCase("getFanoutBreakdown", rollupRead.getFanoutBreakdown, rawRead.getFanoutBreakdown),
	rowsCase("getFanoutModelTotals", rollupRead.getFanoutModelTotals, rawRead.getFanoutModelTotals),
	rowsCase("getFanoutPromptTotals", rollupRead.getFanoutPromptTotals, rawRead.getFanoutPromptTotals),
	valueCase(
		"getCitationDomainPromptCounts",
		rollupRead.getCitationDomainPromptCounts,
		rawRead.getCitationDomainPromptCounts,
	),
	rowsCase(
		"getPerPromptCitationPages",
		rollupRead.getPerPromptCitationPages,
		rawRead.getPerPromptCitationPages,
		foldPerPromptCitationPageRows,
	),
	rowsCase(
		"getPerPromptDailyCitationDomains",
		rollupRead.getPerPromptDailyCitationDomains,
		rawRead.getPerPromptDailyCitationDomains,
	),
	rowsCase("getCitationsCountByModel", rollupRead.getCitationsCountByModel, rawRead.getCitationsCountByModel),
	rowsCase(
		"getPromptsFirstEvaluatedAt",
		(scope) => rollupRead.getPromptsFirstEvaluatedAt(scope.brandId, scope.promptIds),
		(scope) => rawRead.getPromptsFirstEvaluatedAt(scope.brandId, scope.promptIds),
	),
];

async function expectEquivalent(scope: EquivalenceScope, label: string): Promise<void> {
	for (const equivalenceCase of EQUIVALENCE_CASES) {
		await equivalenceCase.check(scope, `${equivalenceCase.name} ${label}`);
	}
}

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
		it("has fan-out in the seeded window, so the fan-out cases compare real rows", async () => {
			const scope = { brandId: BRAND_ID, from: null, to: null, timezone: "UTC" };
			const queries = (await rollupRead.getFanoutBreakdown(scope)).map((row) => row.query);
			expect(new Set(queries)).toEqual(new Set(["crm pricing", "hubspot alternatives", "best crm tools"]));
		});

		for (const combo of COMBOS) {
			it(combo.label, async () => {
				const window = await resolveBrandWindow(BRAND_ID, combo.lookback, combo.timezone, { now: NOW });
				await expectEquivalent(
					{
						brandId: BRAND_ID,
						from: window.fromDateStr,
						to: window.toDateStr,
						timezone: window.timezone,
						promptIds: combo.promptIds,
						model: combo.model,
					},
					combo.label,
				);
			});
		}

		for (const webSearchEnabled of [true, false]) {
			it(`all UTC webSearchEnabled=${webSearchEnabled}`, async () => {
				const window = await resolveBrandWindow(BRAND_ID, "all", "UTC", { now: NOW });
				await expectEquivalent(
					{
						brandId: BRAND_ID,
						from: window.fromDateStr,
						to: window.toDateStr,
						timezone: "UTC",
						promptIds: ALL_PROMPT_IDS,
						webSearchEnabled,
					},
					`webSearchEnabled=${webSearchEnabled}`,
				);
			});
		}
	});

	describe("read equivalence: a single prompt", () => {
		const representativePromptIds = [PROMPTS[0].id, PROMPTS[2].id, PROMPTS[5].id];

		for (const lookback of LOOKBACKS) {
			for (const timezone of TIMEZONES) {
				it(`${lookback} ${timezone}`, async () => {
					const window = await resolveBrandWindow(BRAND_ID, lookback, timezone, { now: NOW });
					for (const promptId of representativePromptIds) {
						const label = `promptId=${promptId} ${lookback} ${timezone}`;
						const scope = {
							brandId: BRAND_ID,
							from: window.fromDateStr,
							to: window.toDateStr,
							timezone,
							promptIds: [promptId],
						};

						const [rollupUrlRows, rawUrlRows] = await Promise.all([
							rollupRead.getCitationUrlStats(scope),
							rawRead.getCitationUrlStats(scope),
						]);
						expectSameRows(label, foldCitationUrlRows(rollupUrlRows), foldCitationUrlRows(rawUrlRows));

						expect(await rollupRead.getMentionTotals(scope), label).toEqual(await rawRead.getMentionTotals(scope));

						const [rollupTop, rawTop] = await Promise.all([
							rollupRead.getCompetitorTotals(scope, 10),
							rawRead.getCompetitorTotals(scope, 10),
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

	// UTC+05:45: local midnight is a bucket boundary only because buckets are a quarter hour.
	describe("a timezone with a quarter-hour offset", () => {
		const timezone = "Asia/Kathmandu";
		const OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
		const localTime = (createdAt: string) => new Date(Date.parse(createdAt) + OFFSET_MS).toISOString();
		const attributedDay = (createdAt: string) => localTime(createdAt).slice(0, 10);
		const totalRuns = async (from: string, to: string) =>
			(await rollupRead.getMentionTotals({ brandId: BRAND_ID, from, to, timezone })).runs;

		it("seeds runs in the first quarter hour of a local day", () => {
			expect(SEED_RUNS.some((run) => localTime(run.createdAt).slice(11, 16) < "00:15")).toBe(true);
		});

		it("puts each run on its local day", async () => {
			const rows = await rollupRead.getPerPromptDailyRuns({
				brandId: BRAND_ID,
				from: "2026-06-30",
				to: "2026-07-11",
				timezone,
				promptIds: ALL_PROMPT_IDS,
			});
			const byDay: Record<string, number> = {};
			for (const row of rows) byDay[row.date] = (byDay[row.date] ?? 0) + row.brand_mentioned_runs;
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
				const scope = { brandId: BRAND_ID, from, to, timezone, promptIds: ALL_PROMPT_IDS };
				const expected = SEED_RUNS.filter((run) => {
					const day = attributedDay(run.createdAt);
					return day >= from && day <= to;
				}).length;
				const [firstMatch] = await getResponseMatches(scope, 1, 0);
				expect(firstMatch?.matched ?? 0).toBe(expected);
				expect((await rollupRead.getMentionTotals(scope)).runs).toBe(expected);
				let listed = 0;
				for (const promptId of ALL_PROMPT_IDS) listed += await countPromptRuns(promptId, from, to, timezone);
				expect(listed).toBe(expected);
			}
		});
	});
});
