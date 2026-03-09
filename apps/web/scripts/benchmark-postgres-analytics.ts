#!/usr/bin/env tsx
/**
 * Benchmark + correctness validation: Postgres vs Tinybird analytics queries.
 *
 * Imports the actual production functions from postgres-read.ts and
 * tinybird-read-v2.ts and compares their outputs for correctness.
 *
 * Usage:
 *   cd apps/web
 *   pnpm tsx --tsconfig tsconfig.bench.json --env-file=../../.env scripts/benchmark-postgres-analytics.ts
 *   pnpm tsx --tsconfig tsconfig.bench.json --env-file=../../.env scripts/benchmark-postgres-analytics.ts --timing-only
 *   pnpm tsx --tsconfig tsconfig.bench.json --env-file=../../.env scripts/benchmark-postgres-analytics.ts --iterations=10
 */

import * as pgRead from "../src/lib/postgres-read";
import * as tbRead from "../src/lib/tinybird-read-v2";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";

const ITERATIONS = parseInt(process.argv.find((a) => a.startsWith("--iterations="))?.split("=")[1] || "5");
const WARMUP = 1;
const TIMING_ONLY = process.argv.includes("--timing-only");

const hasTinybird = !!process.env.TINYBIRD_TOKEN && !!process.env.TINYBIRD_BASE_URL;

// ============================================================================
// Comparison helpers
// ============================================================================

function normalizeValue(val: unknown): string | number | boolean | null {
	if (val === null || val === undefined) return null;

	if (typeof val === "boolean") return val;
	if (val === 1 || val === "1" || val === true) return true;
	if (val === 0 || val === "0" || val === false) return false;

	if (typeof val === "number") return Math.round(val * 100) / 100;

	const s = String(val).trim();

	if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
		const d = new Date(s);
		if (!isNaN(d.getTime())) return d.toISOString().replace(/\.\d{3}Z$/, "Z");
	}

	const n = Number(s);
	if (!isNaN(n) && s !== "") return Math.round(n * 100) / 100;

	return s;
}

function sortKey(row: Record<string, unknown>, cols: string[]): string {
	return cols.map((c) => String(normalizeValue(row[c]) ?? "")).join("|");
}

function compareResults(
	name: string,
	pgData: unknown,
	tbData: unknown,
	keyColumns: string[],
	valueColumns: string[],
	tolerance: number = 0,
): { pass: boolean; details: string } {
	const pgRows = Array.isArray(pgData) ? pgData : [pgData];
	const tbRows = Array.isArray(tbData) ? tbData : [tbData];

	if (pgRows.length !== tbRows.length) {
		return {
			pass: false,
			details: `Row count mismatch: PG=${pgRows.length}, TB=${tbRows.length}`,
		};
	}

	if (pgRows.length === 0) return { pass: true, details: "Both empty" };

	const pgSorted = [...pgRows].sort((a, b) =>
		sortKey(a as Record<string, unknown>, keyColumns)
			.localeCompare(sortKey(b as Record<string, unknown>, keyColumns)),
	);
	const tbSorted = [...tbRows].sort((a, b) =>
		sortKey(a as Record<string, unknown>, keyColumns)
			.localeCompare(sortKey(b as Record<string, unknown>, keyColumns)),
	);

	const allCols = [...keyColumns, ...valueColumns];
	const mismatches: string[] = [];

	for (let i = 0; i < pgSorted.length; i++) {
		const pgRow = pgSorted[i] as Record<string, unknown>;
		const tbRow = tbSorted[i] as Record<string, unknown>;

		for (const col of allCols) {
			const pgVal = normalizeValue(pgRow[col]);
			const tbVal = normalizeValue(tbRow[col]);

			if (pgVal === tbVal) continue;
			if (pgVal === null && tbVal === null) continue;

			if (typeof pgVal === "number" && typeof tbVal === "number") {
				if (Math.abs(pgVal - tbVal) <= tolerance) continue;
			}

			mismatches.push(
				`Row ${i}, col "${col}": PG=${JSON.stringify(pgVal)} vs TB=${JSON.stringify(tbVal)}`,
			);

			if (mismatches.length >= 5) {
				mismatches.push("...(truncated)");
				return { pass: false, details: mismatches.join("\n    ") };
			}
		}
	}

	if (mismatches.length > 0) {
		return { pass: false, details: mismatches.join("\n    ") };
	}

	return { pass: true, details: `${pgRows.length} rows match` };
}

// ============================================================================
// Timing
// ============================================================================

interface BenchResult {
	name: string;
	pgAvg: number;
	pgMin: number;
	pgP95: number;
	tbAvg: number | null;
	tbMin: number | null;
	rows: number;
	comparison: { pass: boolean; details: string } | null;
}

async function timeOne(fn: () => Promise<unknown>): Promise<{ avg: number; min: number; p95: number; rows: number }> {
	let rows = 0;
	for (let i = 0; i < WARMUP; i++) {
		const r = await fn();
		rows = Array.isArray(r) ? r.length : 1;
	}
	const times: number[] = [];
	for (let i = 0; i < ITERATIONS; i++) {
		const start = performance.now();
		await fn();
		times.push(Math.round(performance.now() - start));
	}
	times.sort((a, b) => a - b);
	return {
		avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
		min: times[0],
		p95: times[Math.floor(times.length * 0.95)],
		rows,
	};
}

async function bench(
	name: string,
	pgFn: () => Promise<unknown>,
	tbFn: (() => Promise<unknown>) | null,
	keyColumns: string[],
	valueColumns: string[],
	tolerance: number = 0,
): Promise<BenchResult> {
	const pgTiming = await timeOne(pgFn);

	let tbTiming: { avg: number; min: number; p95: number } | null = null;
	let comparison: { pass: boolean; details: string } | null = null;

	if (tbFn) {
		tbTiming = await timeOne(tbFn);

		if (!TIMING_ONLY) {
			const [pgData, tbData] = await Promise.all([pgFn(), tbFn()]);
			comparison = compareResults(name, pgData, tbData, keyColumns, valueColumns, tolerance);
		}
	}

	return {
		name,
		pgAvg: pgTiming.avg,
		pgMin: pgTiming.min,
		pgP95: pgTiming.p95,
		tbAvg: tbTiming?.avg ?? null,
		tbMin: tbTiming?.min ?? null,
		rows: pgTiming.rows,
		comparison,
	};
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	console.log(`Benchmark: ${ITERATIONS} iterations + ${WARMUP} warmup`);
	console.log(`Tinybird comparison: ${hasTinybird ? "enabled" : "SKIPPED (no TINYBIRD_TOKEN)"}`);
	console.log(`Correctness checks: ${TIMING_ONLY ? "SKIPPED (--timing-only)" : "enabled"}\n`);

	// Pick the brand with the most data
	const topBrand = await db.execute<{ brand_id: string; run_count: number }>(sql`
		SELECT brand_id, count(*)::int AS run_count
		FROM prompt_runs WHERE brand_id IS NOT NULL
		GROUP BY brand_id ORDER BY run_count DESC LIMIT 1
	`);
	const top = topBrand.rows[0];
	if (!top) { console.error("No prompt_runs with brand_id. Run backfill first."); process.exit(1); }

	const brandId = top.brand_id;
	console.log(`Brand: ${brandId} (${top.run_count} runs)`);

	const promptResult = await db.execute<{ id: string }>(sql`
		SELECT id FROM prompts WHERE brand_id = ${brandId} AND enabled = true LIMIT 20
	`);
	const promptIds = promptResult.rows.map((r) => r.id);
	const firstPromptId = promptIds[0];
	if (!firstPromptId) { console.error("No enabled prompts."); process.exit(1); }

	const toDate = new Date().toISOString().split("T")[0];
	const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
	const tz = "UTC";
	const brandedPromptIds = promptIds.slice(0, Math.ceil(promptIds.length / 2));

	console.log(`Prompts: ${promptIds.length}, date range: ${fromDate} to ${toDate}\n`);

	const tb = hasTinybird ? tbRead : null;
	const results: BenchResult[] = [];

	// === getDashboardSummary ===
	results.push(await bench(
		"getDashboardSummary",
		() => pgRead.getDashboardSummary(brandId, fromDate, toDate, tz, promptIds),
		tb ? () => tb.getDashboardSummary(brandId, fromDate, toDate, tz, promptIds) : null,
		[], ["total_prompts", "total_runs", "avg_visibility"],
		1,
	));

	// === getVisibilityTimeSeries ===
	results.push(await bench(
		"getVisibilityTimeSeries",
		() => pgRead.getVisibilityTimeSeries(brandId, fromDate, toDate, tz, brandedPromptIds, promptIds),
		tb ? () => tb.getVisibilityTimeSeries(brandId, fromDate, toDate, tz, brandedPromptIds, promptIds) : null,
		["date", "is_branded"], ["total_runs", "brand_mentioned_count"],
	));

	// === getPromptsSummary ===
	results.push(await bench(
		"getPromptsSummary",
		() => pgRead.getPromptsSummary(brandId, fromDate, toDate, tz),
		tb ? () => tb.getPromptsSummary(brandId, fromDate, toDate, tz) : null,
		["prompt_id"], ["total_runs", "brand_mention_rate", "competitor_mention_rate"],
		1,
	));

	// === getPromptsFirstEvaluatedAt ===
	results.push(await bench(
		"getPromptsFirstEvaluatedAt",
		() => pgRead.getPromptsFirstEvaluatedAt(brandId, promptIds),
		tb ? () => tb.getPromptsFirstEvaluatedAt(brandId, promptIds) : null,
		["prompt_id"], ["first_evaluated_at"],
	));

	// === getPromptDailyStats ===
	results.push(await bench(
		"getPromptDailyStats",
		() => pgRead.getPromptDailyStats(firstPromptId, fromDate, toDate, tz),
		tb ? () => tb.getPromptDailyStats(firstPromptId, fromDate, toDate, tz) : null,
		["date"], ["total_runs", "brand_mentioned_count"],
	));

	// === getPromptCompetitorDailyStats ===
	results.push(await bench(
		"getPromptCompetitorDailyStats",
		() => pgRead.getPromptCompetitorDailyStats(firstPromptId, fromDate, toDate, tz),
		tb ? () => tb.getPromptCompetitorDailyStats(firstPromptId, fromDate, toDate, tz) : null,
		["date", "competitor_name"], ["mention_count"],
	));

	// === getPromptWebQueriesForMapping ===
	results.push(await bench(
		"getPromptWebQueriesForMapping",
		() => pgRead.getPromptWebQueriesForMapping(firstPromptId, fromDate, toDate, tz),
		tb ? () => tb.getPromptWebQueriesForMapping(firstPromptId, fromDate, toDate, tz) : null,
		["model_group", "web_query", "created_at_iso"], [],
	));

	// === getPromptMentionSummary ===
	results.push(await bench(
		"getPromptMentionSummary",
		() => pgRead.getPromptMentionSummary(firstPromptId, fromDate, toDate, tz),
		tb ? () => tb.getPromptMentionSummary(firstPromptId, fromDate, toDate, tz) : null,
		[], ["total_runs", "brand_mentioned_count", "competitor_mentioned_count"],
	));

	// === getPromptTopCompetitorMentions ===
	results.push(await bench(
		"getPromptTopCompetitorMentions",
		() => pgRead.getPromptTopCompetitorMentions(firstPromptId, fromDate, toDate, tz, 10),
		tb ? () => tb.getPromptTopCompetitorMentions(firstPromptId, fromDate, toDate, tz, 10) : null,
		["competitor_name"], ["mention_count"],
	));

	// === getBatchChartData ===
	results.push(await bench(
		"getBatchChartData",
		() => pgRead.getBatchChartData(brandId, promptIds, fromDate, toDate, tz),
		tb ? () => tb.getBatchChartData(brandId, promptIds, fromDate, toDate, tz) : null,
		["prompt_id", "date"], ["total_runs", "brand_mentioned_count"],
	));

	// === getBatchVisibilityData ===
	results.push(await bench(
		"getBatchVisibilityData",
		() => pgRead.getBatchVisibilityData(brandId, promptIds, brandedPromptIds, fromDate, toDate, tz).then((r) => r.visibilityTimeSeries),
		tb ? () => tb.getBatchVisibilityData(brandId, promptIds, brandedPromptIds, fromDate, toDate, tz).then((r) => r.visibilityTimeSeries) : null,
		["date", "is_branded"], ["total_runs", "brand_mentioned_count"],
	));

	// === getBrandEarliestRunDate ===
	results.push(await bench(
		"getBrandEarliestRunDate",
		() => pgRead.getBrandEarliestRunDate(brandId),
		tb ? () => tb.getBrandEarliestRunDate(brandId) : null,
		[], [],
	));

	// === Citation queries ===
	const citResult = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM citations`);
	const hasCitations = citResult.rows[0].count > 0;

	if (hasCitations) {
		results.push(await bench(
			"getCitationDomainStats",
			() => pgRead.getCitationDomainStats(brandId, fromDate, toDate, tz, promptIds),
			tb ? () => tb.getCitationDomainStats(brandId, fromDate, toDate, tz, promptIds) : null,
			["domain"], ["count"],
		));

		results.push(await bench(
			"getCitationUrlStats",
			() => pgRead.getCitationUrlStats(brandId, fromDate, toDate, tz, promptIds),
			tb ? () => tb.getCitationUrlStats(brandId, fromDate, toDate, tz, promptIds) : null,
			["url", "domain"], ["count"],
		));

		results.push(await bench(
			"getDailyCitationStats",
			() => pgRead.getDailyCitationStats(brandId, fromDate, toDate, tz, promptIds),
			tb ? () => tb.getDailyCitationStats(brandId, fromDate, toDate, tz, promptIds) : null,
			["date", "domain"], ["count"],
		));

		results.push(await bench(
			"getPromptCitationStats",
			() => pgRead.getPromptCitationStats(firstPromptId, fromDate, toDate, tz),
			tb ? () => tb.getPromptCitationStats(firstPromptId, fromDate, toDate, tz) : null,
			["domain"], ["count"],
		));

		results.push(await bench(
			"getPromptCitationUrlStats",
			() => pgRead.getPromptCitationUrlStats(firstPromptId, fromDate, toDate, tz),
			tb ? () => tb.getPromptCitationUrlStats(firstPromptId, fromDate, toDate, tz) : null,
			["url", "domain"], ["count"],
		));
	} else {
		console.log("Citations table empty -- skipping citation benchmarks\n");
	}

	// === Admin queries ===
	results.push(await bench(
		"getAdminRunsOverTime",
		() => pgRead.getAdminRunsOverTime(),
		tb ? () => tb.getAdminRunsOverTime() : null,
		["date"], ["count"],
	));

	results.push(await bench(
		"getAdminBrandRunStats",
		() => pgRead.getAdminBrandRunStats(),
		tb ? () => tb.getAdminBrandRunStats() : null,
		["brand_id"], ["runs_7d", "runs_30d"],
	));

	results.push(await bench(
		"getAdminActiveBrandsOverTime",
		() => pgRead.getAdminActiveBrandsOverTime(),
		tb ? () => tb.getAdminActiveBrandsOverTime() : null,
		["date"], ["count"],
	));

	// ============================================================================
	// Output
	// ============================================================================

	const hasComparisons = results.some((r) => r.comparison !== null);

	console.log("## Results\n");
	if (hasComparisons) {
		console.log(`| Query | PG Avg (ms) | TB Avg (ms) | Rows | Match |`);
		console.log(`|-------|-------------|-------------|------|-------|`);
	} else {
		console.log(`| Query | Avg (ms) | Min (ms) | P95 (ms) | Rows |`);
		console.log(`|-------|----------|----------|----------|------|`);
	}

	let totalPgAvg = 0;
	let totalTbAvg = 0;
	let passCount = 0;
	let failCount = 0;

	for (const r of results) {
		totalPgAvg += r.pgAvg;
		if (r.tbAvg !== null) totalTbAvg += r.tbAvg;

		if (hasComparisons) {
			const match = r.comparison ? (r.comparison.pass ? "PASS" : "FAIL") : "-";
			if (r.comparison?.pass) passCount++;
			if (r.comparison && !r.comparison.pass) failCount++;
			const tbCol = r.tbAvg !== null ? String(r.tbAvg) : "-";
			console.log(`| ${r.name} | ${r.pgAvg} | ${tbCol} | ${r.rows} | ${match} |`);
		} else {
			console.log(`| ${r.name} | ${r.pgAvg} | ${r.pgMin} | ${r.pgP95} | ${r.rows} |`);
		}
	}

	if (hasComparisons) {
		console.log(`| **TOTAL** | **${totalPgAvg}** | **${totalTbAvg}** | | |`);
	} else {
		console.log(`| **TOTAL** | **${totalPgAvg}** | | | |`);
	}

	// Correctness report
	if (hasComparisons) {
		console.log(`\n## Correctness: ${passCount} passed, ${failCount} failed\n`);
		const failures = results.filter((r) => r.comparison && !r.comparison.pass);
		for (const r of failures) {
			console.log(`FAIL ${r.name}:`);
			console.log(`    ${r.comparison!.details}`);
		}
		if (failures.length === 0) {
			console.log("All queries produce matching results between Postgres and Tinybird.");
		}
	}

	// Latency report
	const over200 = results.filter((r) => r.pgAvg > 200 && !r.name.startsWith("getAdmin"));
	const over600 = results.filter((r) => r.pgAvg > 600 && r.name.startsWith("getAdmin"));
	if (over200.length > 0 || over600.length > 0) {
		console.log("\nQueries exceeding target latency:");
		for (const r of [...over200, ...over600]) {
			console.log(`  - ${r.name}: ${r.pgAvg}ms avg`);
		}
	} else {
		console.log("\nAll queries within target latency (user-facing <200ms, admin <600ms)");
	}

	if (failCount > 0) process.exit(1);
	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
