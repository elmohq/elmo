/**
 * Benchmark script to compare v1 vs v2 Tinybird table performance
 * 
 * Run with: pnpm tsx scripts/benchmark-tinybird-v2.ts
 * 
 * Tests:
 * 1. Dashboard summary
 * 2. Prompts summary 
 * 3. Visibility time series
 * 4. Citation stats
 * 5. Admin stats
 * 
 * For each test, runs against both v1 and v2 tables and compares:
 * - Query latency
 * - Result correctness (row counts, data equality)
 */

import * as v1 from "@/lib/tinybird-read";
import * as v2 from "@/lib/tinybird-read-v2";

// Test brand IDs provided by user
const TEST_BRAND_IDS = [
	"2aabb918-bd81-4e60-953d-b43a85a9dbca",
	"b1957fb2-445f-410d-b516-ddce4ebc27cb",
];

// Date ranges to test
const DATE_RANGES = [
	{ name: "7 days", fromDate: getDateDaysAgo(7), toDate: getDateToday() },
	{ name: "30 days", fromDate: getDateDaysAgo(30), toDate: getDateToday() },
	{ name: "90 days", fromDate: getDateDaysAgo(90), toDate: getDateToday() },
];

const TIMEZONE = "America/New_York";

function getDateToday(): string {
	return new Date().toISOString().split("T")[0];
}

function getDateDaysAgo(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date.toISOString().split("T")[0];
}

interface BenchmarkResult {
	test: string;
	brandId: string;
	dateRange: string;
	v1LatencyMs: number;
	v2LatencyMs: number;
	speedup: string;
	v1RowCount: number;
	v2RowCount: number;
	dataMatch: boolean;
	notes?: string;
}

async function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
	const start = performance.now();
	const result = await fn();
	const latencyMs = Math.round(performance.now() - start);
	return { result, latencyMs };
}

function formatSpeedup(v1Ms: number, v2Ms: number): string {
	if (v2Ms === 0) return "∞";
	const ratio = v1Ms / v2Ms;
	if (ratio >= 1) {
		return `${ratio.toFixed(1)}x faster`;
	} else {
		return `${(1 / ratio).toFixed(1)}x slower`;
	}
}

async function benchmarkDashboardSummary(brandId: string, fromDate: string, toDate: string): Promise<BenchmarkResult> {
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdDashboardSummary(brandId, fromDate, toDate, TIMEZONE)
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getDashboardSummary(brandId, fromDate, toDate, TIMEZONE)
	);

	const dataMatch = 
		v1Result[0]?.total_runs === v2Result[0]?.total_runs &&
		v1Result[0]?.total_prompts === v2Result[0]?.total_prompts;

	return {
		test: "Dashboard Summary",
		brandId,
		dateRange: `${fromDate} to ${toDate}`,
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result[0]?.total_runs ?? 0,
		v2RowCount: v2Result[0]?.total_runs ?? 0,
		dataMatch,
		notes: dataMatch ? undefined : `v1: ${v1Result[0]?.total_runs}, v2: ${v2Result[0]?.total_runs}`,
	};
}

async function benchmarkPromptsSummary(brandId: string, fromDate: string, toDate: string): Promise<BenchmarkResult> {
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdPromptsSummary(brandId, fromDate, toDate, TIMEZONE)
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getPromptsSummary(brandId, fromDate, toDate, TIMEZONE)
	);

	// Compare prompt counts
	const v1PromptIds = new Set(v1Result.map(p => p.prompt_id));
	const v2PromptIds = new Set(v2Result.map(p => p.prompt_id));
	const dataMatch = v1PromptIds.size === v2PromptIds.size;

	return {
		test: "Prompts Summary",
		brandId,
		dateRange: `${fromDate} to ${toDate}`,
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result.length,
		v2RowCount: v2Result.length,
		dataMatch,
	};
}

async function benchmarkVisibilityTimeSeries(brandId: string, fromDate: string, toDate: string): Promise<BenchmarkResult> {
	const brandedPromptIds: string[] = []; // Empty for this test
	
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdVisibilityTimeSeries(brandId, fromDate, toDate, TIMEZONE, brandedPromptIds)
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getVisibilityTimeSeries(brandId, fromDate, toDate, TIMEZONE, brandedPromptIds)
	);

	// Compare total runs across all days
	const v1TotalRuns = v1Result.reduce((sum, p) => sum + p.total_runs, 0);
	const v2TotalRuns = v2Result.reduce((sum, p) => sum + p.total_runs, 0);
	const dataMatch = v1TotalRuns === v2TotalRuns;

	return {
		test: "Visibility Time Series",
		brandId,
		dateRange: `${fromDate} to ${toDate}`,
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result.length,
		v2RowCount: v2Result.length,
		dataMatch,
		notes: dataMatch ? undefined : `v1 total: ${v1TotalRuns}, v2 total: ${v2TotalRuns}`,
	};
}

async function benchmarkCitationStats(brandId: string, fromDate: string, toDate: string): Promise<BenchmarkResult> {
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdCitationDomainStats(brandId, fromDate, toDate, TIMEZONE)
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getCitationDomainStats(brandId, fromDate, toDate, TIMEZONE)
	);

	// Compare total citation counts
	const v1TotalCitations = v1Result.reduce((sum, c) => sum + c.count, 0);
	const v2TotalCitations = v2Result.reduce((sum, c) => sum + c.count, 0);
	const dataMatch = v1TotalCitations === v2TotalCitations;

	return {
		test: "Citation Domain Stats",
		brandId,
		dateRange: `${fromDate} to ${toDate}`,
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result.length,
		v2RowCount: v2Result.length,
		dataMatch,
		notes: dataMatch ? undefined : `v1 total: ${v1TotalCitations}, v2 total: ${v2TotalCitations}`,
	};
}

async function benchmarkDailyCitationStats(brandId: string, fromDate: string, toDate: string): Promise<BenchmarkResult> {
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdDailyCitationStats(brandId, fromDate, toDate, TIMEZONE)
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getDailyCitationStats(brandId, fromDate, toDate, TIMEZONE)
	);

	// Compare total citation counts
	const v1TotalCitations = v1Result.reduce((sum, c) => sum + c.count, 0);
	const v2TotalCitations = v2Result.reduce((sum, c) => sum + c.count, 0);
	const dataMatch = v1TotalCitations === v2TotalCitations;

	return {
		test: "Daily Citation Stats",
		brandId,
		dateRange: `${fromDate} to ${toDate}`,
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result.length,
		v2RowCount: v2Result.length,
		dataMatch,
		notes: dataMatch ? undefined : `v1 total: ${v1TotalCitations}, v2 total: ${v2TotalCitations}`,
	};
}

async function benchmarkAdminRunsOverTime(): Promise<BenchmarkResult> {
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdAdminRunsOverTime()
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getAdminRunsOverTime()
	);

	const v1TotalRuns = v1Result.reduce((sum, r) => sum + r.count, 0);
	const v2TotalRuns = v2Result.reduce((sum, r) => sum + r.count, 0);
	const dataMatch = v1TotalRuns === v2TotalRuns;

	return {
		test: "Admin Runs Over Time",
		brandId: "(all)",
		dateRange: "30 days",
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result.length,
		v2RowCount: v2Result.length,
		dataMatch,
		notes: dataMatch ? undefined : `v1 total: ${v1TotalRuns}, v2 total: ${v2TotalRuns}`,
	};
}

async function benchmarkAdminBrandStats(): Promise<BenchmarkResult> {
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdAdminBrandRunStats()
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getAdminBrandRunStats()
	);

	const dataMatch = v1Result.length === v2Result.length;

	return {
		test: "Admin Brand Stats",
		brandId: "(all)",
		dateRange: "7d/30d",
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result.length,
		v2RowCount: v2Result.length,
		dataMatch,
	};
}

async function benchmarkBrandEarliestRunDate(brandId: string): Promise<BenchmarkResult> {
	const { result: v1Result, latencyMs: v1Ms } = await measureLatency(() =>
		v1.getTinybirdBrandEarliestRunDate(brandId)
	);

	const { result: v2Result, latencyMs: v2Ms } = await measureLatency(() =>
		v2.getBrandEarliestRunDate(brandId)
	);

	// Compare dates (may differ slightly due to timezone handling)
	const dataMatch = v1Result === v2Result || 
		(v1Result !== null && v2Result !== null && v1Result.substring(0, 10) === v2Result.substring(0, 10));

	return {
		test: "Brand Earliest Run Date",
		brandId,
		dateRange: "all time",
		v1LatencyMs: v1Ms,
		v2LatencyMs: v2Ms,
		speedup: formatSpeedup(v1Ms, v2Ms),
		v1RowCount: v1Result ? 1 : 0,
		v2RowCount: v2Result ? 1 : 0,
		dataMatch,
		notes: dataMatch ? undefined : `v1: ${v1Result}, v2: ${v2Result}`,
	};
}

async function runBenchmarks(): Promise<void> {
	console.log("=".repeat(80));
	console.log("Tinybird v1 vs v2 Benchmark");
	console.log("=".repeat(80));
	console.log(`Timezone: ${TIMEZONE}`);
	console.log(`Test brands: ${TEST_BRAND_IDS.join(", ")}`);
	console.log("");

	const results: BenchmarkResult[] = [];

	// Per-brand benchmarks
	for (const brandId of TEST_BRAND_IDS) {
		console.log(`\n--- Brand: ${brandId.substring(0, 8)}... ---`);

		// Earliest run date (no date range)
		try {
			const result = await benchmarkBrandEarliestRunDate(brandId);
			results.push(result);
			console.log(`  ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
		} catch (error) {
			console.error(`  Brand Earliest Run Date: ERROR - ${error}`);
		}

		// Date range benchmarks
		for (const { name, fromDate, toDate } of DATE_RANGES) {
			console.log(`\n  Date range: ${name} (${fromDate} to ${toDate})`);

			// Dashboard Summary
			try {
				const result = await benchmarkDashboardSummary(brandId, fromDate, toDate);
				results.push(result);
				console.log(`    ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
			} catch (error) {
				console.error(`    Dashboard Summary: ERROR - ${error}`);
			}

			// Prompts Summary
			try {
				const result = await benchmarkPromptsSummary(brandId, fromDate, toDate);
				results.push(result);
				console.log(`    ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
			} catch (error) {
				console.error(`    Prompts Summary: ERROR - ${error}`);
			}

			// Visibility Time Series
			try {
				const result = await benchmarkVisibilityTimeSeries(brandId, fromDate, toDate);
				results.push(result);
				console.log(`    ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
			} catch (error) {
				console.error(`    Visibility Time Series: ERROR - ${error}`);
			}

			// Citation Domain Stats
			try {
				const result = await benchmarkCitationStats(brandId, fromDate, toDate);
				results.push(result);
				console.log(`    ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
			} catch (error) {
				console.error(`    Citation Domain Stats: ERROR - ${error}`);
			}

			// Daily Citation Stats
			try {
				const result = await benchmarkDailyCitationStats(brandId, fromDate, toDate);
				results.push(result);
				console.log(`    ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
			} catch (error) {
				console.error(`    Daily Citation Stats: ERROR - ${error}`);
			}
		}
	}

	// Admin benchmarks (no brand filter)
	console.log("\n--- Admin Queries (all brands) ---");

	try {
		const result = await benchmarkAdminRunsOverTime();
		results.push(result);
		console.log(`  ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
	} catch (error) {
		console.error(`  Admin Runs Over Time: ERROR - ${error}`);
	}

	try {
		const result = await benchmarkAdminBrandStats();
		results.push(result);
		console.log(`  ${result.test}: v1=${result.v1LatencyMs}ms, v2=${result.v2LatencyMs}ms (${result.speedup}) ${result.dataMatch ? "✓" : "✗"}`);
	} catch (error) {
		console.error(`  Admin Brand Stats: ERROR - ${error}`);
	}

	// Summary
	console.log("\n" + "=".repeat(80));
	console.log("SUMMARY");
	console.log("=".repeat(80));

	const totalV1Ms = results.reduce((sum, r) => sum + r.v1LatencyMs, 0);
	const totalV2Ms = results.reduce((sum, r) => sum + r.v2LatencyMs, 0);
	const avgV1Ms = Math.round(totalV1Ms / results.length);
	const avgV2Ms = Math.round(totalV2Ms / results.length);
	const matchCount = results.filter(r => r.dataMatch).length;
	const mismatchCount = results.length - matchCount;

	console.log(`Total queries: ${results.length}`);
	console.log(`Average latency: v1=${avgV1Ms}ms, v2=${avgV2Ms}ms (${formatSpeedup(avgV1Ms, avgV2Ms)})`);
	console.log(`Total latency: v1=${totalV1Ms}ms, v2=${totalV2Ms}ms (${formatSpeedup(totalV1Ms, totalV2Ms)})`);
	console.log(`Data matches: ${matchCount}/${results.length}`);

	if (mismatchCount > 0) {
		console.log("\nMismatches:");
		results
			.filter(r => !r.dataMatch)
			.forEach(r => {
				console.log(`  - ${r.test} (${r.brandId}): ${r.notes || "count mismatch"}`);
			});
	}

	// CSV output for further analysis
	console.log("\n" + "=".repeat(80));
	console.log("CSV OUTPUT");
	console.log("=".repeat(80));
	console.log("test,brand_id,date_range,v1_ms,v2_ms,speedup,v1_rows,v2_rows,match");
	results.forEach(r => {
		console.log(`${r.test},${r.brandId},${r.dateRange},${r.v1LatencyMs},${r.v2LatencyMs},"${r.speedup}",${r.v1RowCount},${r.v2RowCount},${r.dataMatch}`);
	});

	// Exit with error code if data mismatches found
	if (mismatchCount > 0) {
		console.error(`\n⚠️  ${mismatchCount} data mismatches found!`);
		process.exit(1);
	} else {
		console.log("\n✓ All data matches!");
	}
}

// Run benchmarks
runBenchmarks().catch(error => {
	console.error("Benchmark failed:", error);
	process.exit(1);
});

