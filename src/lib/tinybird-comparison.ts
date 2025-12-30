// Tinybird migration comparison utilities
// Handles timing recording, result comparison, and mismatch logging

import { redis } from "@/lib/redis";

const TIMING_TTL = 60 * 60 * 24; // 24 hours
const MISMATCH_TTL = 60 * 60 * 24 * 7; // 7 days
const MAX_TIMING_ENTRIES = 1000;

// List of endpoints being tracked
export const TRACKED_ENDPOINTS = [
	"dashboard-summary",
	"prompt-chart-data",
	"citations",
	"prompts-summary",
	"prompt-stats", // Individual prompt details page stats
	"prompt-runs", // Individual prompt runs pagination
] as const;

export type TrackedEndpoint = (typeof TRACKED_ENDPOINTS)[number];

export interface ComparisonResult {
	endpoint: TrackedEndpoint;
	brandId: string;
	filters: Record<string, unknown>;
	postgresResult: unknown;
	tinybirdResult: unknown;
	pgTime: number;
	tbTime: number;
	diagnostics?: DiagnosticInfo;
}

export interface FieldDiff {
	field: string;
	pgValue: unknown;
	tbValue: unknown;
	withinTolerance: boolean;
}

/**
 * Diagnostic information to help debug mismatches
 * Different endpoints can include different diagnostics based on what's relevant
 */
export interface DiagnosticInfo {
	// Date range of data in each source
	dateRange?: {
		pg: { earliest: string | null; latest: string | null };
		tb: { earliest: string | null; latest: string | null };
	};
	// Count of base records (prompt runs, citations, etc.)
	recordCounts?: {
		pg: number;
		tb: number;
	};
	// Per-prompt breakdown (useful for finding which prompts differ)
	perPromptCounts?: {
		pg: Record<string, number>;
		tb: Record<string, number>;
		// List of prompts with different counts
		differences: Array<{
			promptId: string;
			pgCount: number;
			tbCount: number;
			diff: number;
		}>;
	};
	// Sample IDs for debugging (first few IDs from each source)
	sampleIds?: {
		pg: string[];
		tb: string[];
		// IDs in PG but not TB
		onlyInPg: string[];
		// IDs in TB but not PG
		onlyInTb: string[];
	};
	// Any additional context
	extra?: Record<string, unknown>;
}

export interface MismatchLog {
	endpoint: string;
	timestamp: string;
	brandId: string;
	filters: Record<string, unknown>;
	postgres: unknown;
	tinybird: unknown;
	diff: FieldDiff[];
	diagnostics?: DiagnosticInfo;
}

export interface EndpointStats {
	name: string;
	pgP50: number;
	pgP95: number;
	tbP50: number;
	tbP95: number;
	speedup: number;
	matchRate: number;
	sampleCount: number;
}

export interface MigrationStats {
	endpoints: EndpointStats[];
	recentMismatches: MismatchLog[];
}

/**
 * Main verification function - compares results and logs timing/mismatches
 * Note: All operations are awaited to ensure they complete before the request ends.
 * In serverless environments (like Next.js API routes), un-awaited promises may not complete.
 */
export async function verifyAndLog(comparison: ComparisonResult): Promise<void> {
	const { endpoint, brandId, postgresResult, tinybirdResult, pgTime, tbTime, diagnostics } = comparison;

	// Record timing - awaited to ensure completion
	await Promise.all([
		recordTiming(endpoint, "postgres", pgTime),
		recordTiming(endpoint, "tinybird", tbTime),
	]);

	// Compare results
	const diffs = compareResults(postgresResult, tinybirdResult);
	const isMatch = diffs.every((d) => d.withinTolerance);

	// Record match/mismatch
	await recordComparison(endpoint, isMatch);

	// Log mismatch details for debugging
	if (!isMatch) {
		await logMismatch({
			endpoint,
			timestamp: new Date().toISOString(),
			brandId,
			filters: comparison.filters,
			postgres: postgresResult,
			tinybird: tinybirdResult,
			diff: diffs,
			diagnostics,
		});
	}
}

/**
 * Deep comparison of PostgreSQL and Tinybird results
 * Returns array of field differences with tolerance checking
 */
export function compareResults(pg: unknown, tb: unknown, prefix = ""): FieldDiff[] {
	const diffs: FieldDiff[] = [];

	// Type mismatch
	if (typeof pg !== typeof tb) {
		diffs.push({ field: prefix || "root", pgValue: pg, tbValue: tb, withinTolerance: false });
		return diffs;
	}

	// Handle null/undefined
	if (pg === null || pg === undefined) {
		if (tb === null || tb === undefined) {
			return diffs; // Both null/undefined, match
		}
		diffs.push({ field: prefix || "root", pgValue: pg, tbValue: tb, withinTolerance: false });
		return diffs;
	}

	// Array comparison (order-independent)
	if (Array.isArray(pg) && Array.isArray(tb)) {
		// For arrays of objects with IDs, compare by ID
		if (pg.length > 0 && typeof pg[0] === "object" && pg[0] !== null) {
			const pgSorted = [...pg].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
			const tbSorted = [...tb].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

			if (pgSorted.length !== tbSorted.length) {
				diffs.push({
					field: `${prefix || "array"}.length`,
					pgValue: pgSorted.length,
					tbValue: tbSorted.length,
					withinTolerance: false,
				});
			}

			for (let i = 0; i < Math.min(pgSorted.length, tbSorted.length); i++) {
				diffs.push(...compareResults(pgSorted[i], tbSorted[i], `${prefix || "array"}[${i}]`));
			}
		} else {
			// Simple array comparison
			const pgSorted = [...pg].sort();
			const tbSorted = [...(tb as unknown[])].sort();
			if (JSON.stringify(pgSorted) !== JSON.stringify(tbSorted)) {
				diffs.push({
					field: prefix || "array",
					pgValue: pg,
					tbValue: tb,
					withinTolerance: false,
				});
			}
		}
		return diffs;
	}

	// Object comparison (recursive)
	if (typeof pg === "object" && pg !== null) {
		const pgObj = pg as Record<string, unknown>;
		const tbObj = tb as Record<string, unknown>;
		const allKeys = new Set([...Object.keys(pgObj), ...Object.keys(tbObj)]);

		for (const key of allKeys) {
			const fieldPath = prefix ? `${prefix}.${key}` : key;
			diffs.push(...compareResults(pgObj[key], tbObj[key], fieldPath));
		}
		return diffs;
	}

	// Number comparison with tolerance
	if (typeof pg === "number" && typeof tb === "number") {
		// Allow small floating point differences (0.1% or 0.1 absolute)
		const tolerance = Math.max(0.1, Math.abs(pg) * 0.001);
		const withinTolerance = Math.abs(pg - tb) <= tolerance;

		if (pg !== tb) {
			diffs.push({ field: prefix, pgValue: pg, tbValue: tb, withinTolerance });
		}
		return diffs;
	}

	// String/boolean/primitive comparison
	if (pg !== tb) {
		diffs.push({ field: prefix, pgValue: pg, tbValue: tb, withinTolerance: false });
	}

	return diffs;
}

/**
 * Record timing for an endpoint and source
 */
async function recordTiming(endpoint: TrackedEndpoint, source: "postgres" | "tinybird", time: number): Promise<void> {
	const key = `tinybird:timing:${endpoint}:${source}`;
	await redis.lpush(key, time.toString());
	await redis.ltrim(key, 0, MAX_TIMING_ENTRIES - 1);
	await redis.expire(key, TIMING_TTL);
}

/**
 * Record a comparison result (match or mismatch)
 */
async function recordComparison(endpoint: TrackedEndpoint, isMatch: boolean): Promise<void> {
	const key = `tinybird:comparison:${endpoint}`;
	await redis.lpush(key, isMatch ? "1" : "0");
	await redis.ltrim(key, 0, MAX_TIMING_ENTRIES - 1);
	await redis.expire(key, TIMING_TTL);
}

/**
 * Log a mismatch for debugging
 */
async function logMismatch(mismatch: MismatchLog): Promise<void> {
	const key = `tinybird:mismatches:${mismatch.endpoint}`;
	await redis.lpush(key, JSON.stringify(mismatch));
	await redis.ltrim(key, 0, 99); // Keep last 100 mismatches per endpoint
	await redis.expire(key, MISMATCH_TTL);
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
	if (arr.length === 0) return 0;
	const sorted = [...arr].sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return Math.round(sorted[Math.max(0, index)] * 100) / 100;
}

/**
 * Get migration stats for admin dashboard
 */
export async function getMigrationStats(): Promise<MigrationStats> {
	const stats: EndpointStats[] = [];

	for (const endpoint of TRACKED_ENDPOINTS) {
		const [pgTimesRaw, tbTimesRaw, comparisonsRaw] = await Promise.all([
			redis.lrange(`tinybird:timing:${endpoint}:postgres`, 0, -1),
			redis.lrange(`tinybird:timing:${endpoint}:tinybird`, 0, -1),
			redis.lrange(`tinybird:comparison:${endpoint}`, 0, -1),
		]);

		const pgTimes = (pgTimesRaw as string[]).map(Number).filter((n) => !isNaN(n));
		const tbTimes = (tbTimesRaw as string[]).map(Number).filter((n) => !isNaN(n));
		const comparisons = (comparisonsRaw as string[]).map(Number).filter((n) => !isNaN(n));

		const pgP50 = percentile(pgTimes, 50);
		const tbP50 = percentile(tbTimes, 50);
		const speedup = pgP50 > 0 && tbP50 > 0 ? Math.round((pgP50 / tbP50) * 10) / 10 : 0;

		stats.push({
			name: endpoint,
			pgP50,
			pgP95: percentile(pgTimes, 95),
			tbP50,
			tbP95: percentile(tbTimes, 95),
			speedup,
			matchRate:
				comparisons.length > 0
					? Math.round((comparisons.filter((c) => c === 1).length / comparisons.length) * 1000) / 10
					: 100,
			sampleCount: Math.max(pgTimes.length, tbTimes.length, comparisons.length),
		});
	}

	// Get recent mismatches from all endpoints
	const recentMismatches: MismatchLog[] = [];
	for (const endpoint of TRACKED_ENDPOINTS) {
		// Upstash Redis auto-deserializes JSON, so items may already be objects
		const mismatches = await redis.lrange(`tinybird:mismatches:${endpoint}`, 0, 4);
		for (const m of mismatches) {
			try {
				// Handle both cases: already parsed object or JSON string
				if (typeof m === "string") {
					recentMismatches.push(JSON.parse(m));
				} else if (m && typeof m === "object") {
					recentMismatches.push(m as MismatchLog);
				}
			} catch {
				// Skip invalid data
			}
		}
	}

	// Sort by timestamp descending and take top 10
	recentMismatches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

	return {
		endpoints: stats,
		recentMismatches: recentMismatches.slice(0, 10),
	};
}

/**
 * Clear all migration stats (for testing or reset)
 */
export async function clearMigrationStats(): Promise<void> {
	const keysToDelete: string[] = [];

	for (const endpoint of TRACKED_ENDPOINTS) {
		keysToDelete.push(`tinybird:timing:${endpoint}:postgres`);
		keysToDelete.push(`tinybird:timing:${endpoint}:tinybird`);
		keysToDelete.push(`tinybird:comparison:${endpoint}`);
		keysToDelete.push(`tinybird:mismatches:${endpoint}`);
	}

	await Promise.all(keysToDelete.map((key) => redis.del(key)));
}

/**
 * Check if Tinybird verification is enabled
 */
export function isTinybirdVerifyEnabled(): boolean {
	return process.env.TINYBIRD_VERIFY_ENABLED === "true";
}

