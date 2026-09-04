/**
 * End-to-end coverage for the rollup read path: `rollup-read.ts` must answer
 * exactly what `postgres-read.ts` (the raw oracle) answers, `analytics-read.ts`
 * must pick the right one depending on backfill state, prompt deletion and
 * reprocessing must keep the two in agreement, and `resolveBrandWindow` must
 * resolve "all" the way the dashboard expects.
 *
 * Needs a real Postgres reachable at ROLLUP_TEST_DATABASE_URL, which must be
 * the same database `@workspace/lib/db/db` connects to (it reads DATABASE_URL
 * at import time), so both env vars have to be set and equal:
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:54329/elmo_test \
 *   ROLLUP_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/elmo_test \
 *   pnpm --filter @workspace/web test
 *
 * `getVisibilityTimeSeries` has no rollup-read counterpart (its only caller is
 * a benchmark script) and is excluded from the equivalence loop below for that
 * reason, per task 05a's report.
 */

import { classifyUrl } from "@workspace/lib/citations/domain-lists";
import { rollUpCitationUrls } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import {
	citations,
	promptRuns,
	rollupCitationDomains,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupPromptRuns,
} from "@workspace/lib/db/schema";
import { setPipelineState } from "@workspace/lib/rollups";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LookbackPeriod } from "@/lib/lookback";
import type { CitationDomainStats, PerPromptCitationPageRow } from "@/lib/postgres-read";
import * as rawRead from "@/lib/postgres-read";
import * as rollupRead from "@/lib/rollup-read";
import { resolveBrandWindow } from "@/server/brand-window";
import { deletePrompt } from "@/server/prompts-core";
import {
	ALL_PROMPT_IDS,
	BRAND_ID,
	BRANDED_PROMPT_IDS,
	NOW,
	PROMPTS,
	reset,
	seedAndRebuild,
} from "./analytics-read.integration.helpers";

const connectionString = process.env.ROLLUP_TEST_DATABASE_URL;

function assertSafeTestDatabase(url: string): void {
	if (url !== process.env.DATABASE_URL) {
		throw new Error(
			"ROLLUP_TEST_DATABASE_URL must equal DATABASE_URL — @workspace/lib/db/db reads DATABASE_URL at import " +
				"time, so a mismatch here means the functions under test and this file's own setup/teardown would " +
				"silently talk to two different databases.",
		);
	}
	const host = new URL(url).hostname;
	if (host !== "127.0.0.1" && host !== "localhost") {
		throw new Error(`refusing to run analytics-read integration tests against non-local host "${host}"`);
	}
}

if (connectionString) assertSafeTestDatabase(connectionString);

// ---------------------------------------------------------------------------
// Canonicalization: rollup and raw rows may legitimately come back in a
// different order (ties in an ORDER BY are not guaranteed stable), so every
// comparison sorts a deep-key-sorted JSON encoding of each row rather than
// comparing arrays positionally.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// getCitationUrlStats / getPromptCitationUrlStats / getPerPromptCitationPages:
// raw rows are pre-fold (grouped by the literal url string), rollup rows are
// already normalized (grouped by cited_pages.id) — folding both sides through
// the same rollUpCitationUrls the app uses is what makes them comparable.
// classify() only needs to be *consistent* across both sides here, since the
// brand/competitor domain override is applied by callers outside rollup-read.ts
// and is covered by citation-classification.test.ts instead.
// ---------------------------------------------------------------------------

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

/** getPerPromptCitationPages carries no avg_position; folded per prompt so URLs from different prompts never merge. */
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

/**
 * example_title genuinely differs from raw by design (task 05a): rollup rows
 * have no per-citation timestamp, so the lateral picks the most-cited page's
 * title rather than the most recently cited one. Excluded from comparison.
 */
function stripExampleTitle(rows: CitationDomainStats[]): object[] {
	return rows.map(({ domain, count }) => ({ domain, count }));
}

// ---------------------------------------------------------------------------
// Equivalence cases: every rollup-read.ts export with a raw counterpart.
// ---------------------------------------------------------------------------

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
	// Agrees with raw as long as no run lists the same competitor name twice:
	// rollup_competitor_mentions.runs counts distinct run ids per bucket, while
	// raw's query here counts unnested rows directly. The seed never repeats a
	// name within one run's competitorsMentioned.
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
];

// ---------------------------------------------------------------------------
// Combos: windows x timezones x model filters x prompt subsets, resolved the
// way the server resolves them (resolveBrandWindow) inside each test, since
// the "all" window depends on seeded data that only exists once beforeEach
// has run.
// ---------------------------------------------------------------------------

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

describe.skipIf(!connectionString)("analytics-read integration", () => {
	beforeEach(async () => {
		await reset(db);
		await seedAndRebuild(db);
	});

	describe("read equivalence: rollup-read matches postgres-read", () => {
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
		// One branded, one unbranded, one with a user tag override — no model
		// dimension here, since none of these three take a model filter.
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

						// getPromptTopCompetitorMentions: same duplicate-name caveat as
						// getPerPromptDailyCompetitorMentions above.
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

	describe("facade gating", () => {
		it("reads raw before the backfill completes and rollups (even if stale) once it has", async () => {
			// A deliberate difference: an extra run inserted after the rebuild, so
			// raw sees it and the un-rebuilt rollup tables do not.
			await db.insert(promptRuns).values({
				id: "eeeeeeee-0000-4000-8000-999999999999",
				promptId: PROMPTS[0].id,
				brandId: BRAND_ID,
				model: "chatgpt",
				provider: null,
				version: "1",
				webSearchEnabled: false,
				rawOutput: { text: "seed" },
				brandMentioned: true,
				competitorsMentioned: [],
				createdAt: new Date("2026-07-05T12:00:00.000Z"),
			});

			const rawTotal = (await rawRead.getDashboardSummary(BRAND_ID, "2026-07-01", "2026-07-11", "UTC"))[0].total_runs;
			const staleRollupTotal = (await rollupRead.getDashboardSummary(BRAND_ID, "2026-07-01", "2026-07-11", "UTC"))[0]
				.total_runs;
			expect(rawTotal, "sanity: the extra run should be visible to raw but not yet to the rollup").not.toBe(
				staleRollupTotal,
			);

			await setPipelineState(db, { backfillCompletedAt: null });
			vi.resetModules();
			const notReady = await import("@/lib/analytics-read");
			const notReadyTotal = (await notReady.getDashboardSummary(BRAND_ID, "2026-07-01", "2026-07-11", "UTC"))[0]
				.total_runs;
			expect(notReadyTotal).toBe(rawTotal);

			await setPipelineState(db, { backfillCompletedAt: new Date() });
			vi.resetModules();
			const ready = await import("@/lib/analytics-read");
			const readyTotal = (await ready.getDashboardSummary(BRAND_ID, "2026-07-01", "2026-07-11", "UTC"))[0].total_runs;
			expect(readyTotal).toBe(staleRollupTotal);
		});

		// Not held to raw equivalence (task spec): the not-ready fallback
		// classifies raw per-URL rows in JS instead of calling a raw function, so
		// this checks the facade against itself across both gate states.
		it("getPerPromptDailyCitationClasses agrees whether or not the backfill has finished", async () => {
			const window = await resolveBrandWindow(BRAND_ID, "1m", "UTC", { now: NOW });

			vi.resetModules();
			const ready = await import("@/lib/analytics-read");
			const readyRows = await ready.getPerPromptDailyCitationClasses(
				BRAND_ID,
				window.fromDateStr,
				window.toDateStr,
				"UTC",
				ALL_PROMPT_IDS,
			);

			await setPipelineState(db, { backfillCompletedAt: null });
			vi.resetModules();
			const notReady = await import("@/lib/analytics-read");
			const fallbackRows = await notReady.getPerPromptDailyCitationClasses(
				BRAND_ID,
				window.fromDateStr,
				window.toDateStr,
				"UTC",
				ALL_PROMPT_IDS,
			);

			expectSameRows("getPerPromptDailyCitationClasses ready vs. not-ready fallback", readyRows, fallbackRows);
		});
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
			expect(await db.select().from(rollupCitationDomains).where(eq(rollupCitationDomains.promptId, promptId))).toEqual(
				[],
			);

			expect((await db.select().from(promptRuns).where(eq(promptRuns.promptId, otherPromptId))).length).toBeGreaterThan(
				0,
			);
			expect(
				(await db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.promptId, otherPromptId))).length,
			).toBeGreaterThan(0);
		});
	});

	describe("resolveBrandWindow", () => {
		it("opens the 'all' window at the brand's earliest run, read as a calendar day in the viewer's timezone", async () => {
			// The earliest seeded run is 2026-07-01T06:59:00Z (day 0's 06:59 UTC
			// slot, the smallest time-of-day in the rotation) — one minute before
			// midnight in America/Los_Angeles (PDT), and mid-morning in UTC and
			// Asia/Kolkata, so only the Los Angeles window opens a day earlier.
			expect((await resolveBrandWindow(BRAND_ID, "all", "UTC", { now: NOW })).fromDateStr).toBe("2026-07-01");
			expect((await resolveBrandWindow(BRAND_ID, "all", "Asia/Kolkata", { now: NOW })).fromDateStr).toBe("2026-07-01");
			expect((await resolveBrandWindow(BRAND_ID, "all", "America/Los_Angeles", { now: NOW })).fromDateStr).toBe(
				"2026-06-30",
			);
		});
	});
});
