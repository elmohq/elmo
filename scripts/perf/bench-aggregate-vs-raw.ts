/*
 * Side-by-side benchmark + correctness check between the OLD (raw-table)
 * analytics queries and the NEW (hourly_* aggregate) queries.
 *
 * Run after the backfill has completed to:
 *   1. Confirm the aggregate path returns the same data as the raw path.
 *   2. Measure how much faster the aggregate path is.
 *
 * Usage (from repo root, requires .readonlydb to point at a db that has
 * the hourly_* tables populated):
 *
 *   pnpm tsx scripts/perf/bench-aggregate-vs-raw.ts                # default brand, all lookbacks
 *   BENCH_BRAND_ID=<uuid> pnpm tsx scripts/perf/bench-aggregate-vs-raw.ts
 *
 * What it does, per (page, lookback) pair:
 *
 *   - Picks an upper-bound `cutoff` of `aggregate_refresh_state.last_refreshed_through`
 *     so both paths see the same source data.
 *   - Runs the raw query and the aggregate query side-by-side.
 *   - Diffs the result rows by JSON serialization (after canonical sort).
 *   - Prints raw_ms / agg_ms / speedup, and either ✓ or ✗ for equivalence.
 *
 * The raw query SQL is inlined here verbatim from what `postgres-read.ts`
 * looked like before this PR — kept self-contained so we don't need to
 * keep the old code paths alive in the app once this benchmark is done.
 *
 * Read-only.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const url = (() => {
	const raw = readFileSync(join(repoRoot, ".readonlydb"), "utf8");
	const m = raw.match(/DATABASE_URL="([^"]+)"/);
	if (!m) throw new Error("bad .readonlydb");
	return m[1];
})();

const BRAND_ID = process.env.BENCH_BRAND_ID ?? "2aabb918-bd81-4e60-953d-b43a85a9dbca";
const TZ = process.env.BENCH_TZ ?? "UTC";
const RUNS = Number(process.env.BENCH_RUNS ?? "3");

// ============================================================================
// Helpers
// ============================================================================

function daysAgo(n: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().split("T")[0];
}

async function timed<T>(client: pg.Client, text: string, values: unknown[]): Promise<{ rows: T[]; ms: number }> {
	const t0 = process.hrtime.bigint();
	const r = await client.query(text, values);
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	return { rows: r.rows as T[], ms };
}

function canonicalize(rows: unknown[]): string {
	// Stable serialization: sort each row's keys, then sort the row list.
	const sorted = rows
		.map((r) => {
			if (r === null || typeof r !== "object") return JSON.stringify(r);
			const obj = r as Record<string, unknown>;
			const keys = Object.keys(obj).sort();
			return JSON.stringify(keys.map((k) => [k, normalizeValue(obj[k])]));
		})
		.sort();
	return JSON.stringify(sorted);
}

function normalizeValue(v: unknown): unknown {
	if (v === null || v === undefined) return null;
	if (v instanceof Date) return v.toISOString();
	if (typeof v === "number") {
		// Round floats to 6 decimals to absorb avg() precision noise.
		return Number.isInteger(v) ? v : Number(v.toFixed(6));
	}
	if (typeof v === "string") {
		// Postgres date-as-string vs Date: normalize "YYYY-MM-DD" form.
		const dateMatch = /^(\d{4}-\d{2}-\d{2})T?/.exec(v);
		return dateMatch ? dateMatch[1] : v;
	}
	return v;
}

interface Trial {
	page: string;
	lookback: string;
	rawMs: number[];
	aggMs: number[];
	rowsRaw: number;
	rowsAgg: number;
	equal: boolean;
	mismatchSample?: { rawHash: string; aggHash: string };
}

function summary(trials: Trial[]): void {
	console.log("\n================== summary ==================\n");
	console.log(
		"page                           lookback  raw_med  agg_med  speedup  rows_raw  rows_agg  equal",
	);
	console.log("-".repeat(102));
	for (const t of trials) {
		const rawMed = median(t.rawMs).toFixed(0).padStart(7);
		const aggMed = median(t.aggMs).toFixed(0).padStart(7);
		const speedup = median(t.aggMs) > 0 ? (median(t.rawMs) / median(t.aggMs)).toFixed(1) + "x" : "—";
		const eq = t.equal ? "✓" : "✗";
		console.log(
			`${t.page.padEnd(32)} ${t.lookback.padEnd(8)} ${rawMed}  ${aggMed}  ${speedup.padStart(7)}  ${String(t.rowsRaw).padStart(8)}  ${String(t.rowsAgg).padStart(8)}  ${eq}`,
		);
	}
	const allEqual = trials.every((t) => t.equal);
	console.log("\n" + (allEqual ? "all queries equivalent ✓" : "MISMATCHES — see ✗ rows above ✗"));
}

function median(xs: number[]): number {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

// ============================================================================
// Query pairs (raw / aggregate)
//
// Each entry runs both queries with the same input, compares their canonical
// row hashes, and times both. The aggregate query mirrors the production
// implementation in `apps/web/src/lib/postgres-read.ts`.
// ============================================================================

interface QueryPair {
	page: string;
	lookback: string;
	raw: { sql: string; values: unknown[] };
	agg: { sql: string; values: unknown[] };
}

function buildPairs(promptIds: string[], cutoff: Date): QueryPair[] {
	const pairs: QueryPair[] = [];

	for (const days of [7, 30, 90]) {
		const lookback = `${days}d`;
		const from = daysAgo(days);
		// Both raw and aggregate queries see exactly the same source data
		// regardless of how far behind the worker / backfill is, so any
		// equivalence diff is a real bug rather than a clock skew artifact.
		const args = [BRAND_ID, from, TZ, cutoff, promptIds];

		// ----- getDashboardSummary -----
		pairs.push({
			page: "getDashboardSummary",
			lookback,
			raw: {
				sql: `
					SELECT
						count(DISTINCT prompt_id)::int AS total_prompts,
						count(*)::int AS total_runs,
						round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS avg_visibility,
						to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_updated
					FROM prompt_runs
					WHERE brand_id = $1
						AND created_at >= ($2::date AT TIME ZONE $3)
						AND created_at < $4
						AND prompt_id = ANY($5::uuid[])`,
				values: args,
			},
			agg: {
				sql: `
					SELECT
						count(DISTINCT prompt_id)::int AS total_prompts,
						coalesce(sum(total_runs), 0)::int AS total_runs,
						round(coalesce(sum(brand_mentioned_count), 0) * 100.0 / NULLIF(coalesce(sum(total_runs), 0), 0), 0)::int AS avg_visibility,
						to_char(max(last_run_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '.000Z' AS last_updated
					FROM hourly_prompt_runs
					WHERE brand_id = $1
						AND hour >= ($2::date AT TIME ZONE $3)
						AND hour < $4
						AND prompt_id = ANY($5::uuid[])`,
				values: args,
			},
		});

		// ----- getPerPromptVisibilityTimeSeries -----
		pairs.push({
			page: "getPerPromptVisibilityTimeSeries",
			lookback,
			raw: {
				sql: `
					SELECT
						prompt_id,
						(created_at AT TIME ZONE $3)::date AS date,
						count(*)::int AS total_runs,
						count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
					FROM prompt_runs
					WHERE brand_id = $1
						AND created_at >= ($2::date AT TIME ZONE $3)
						AND created_at < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY prompt_id, date`,
				values: args,
			},
			agg: {
				sql: `
					SELECT
						prompt_id,
						(hour AT TIME ZONE $3)::date AS date,
						sum(total_runs)::int AS total_runs,
						sum(brand_mentioned_count)::int AS brand_mentioned_count
					FROM hourly_prompt_runs
					WHERE brand_id = $1
						AND hour >= ($2::date AT TIME ZONE $3)
						AND hour < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY prompt_id, date`,
				values: args,
			},
		});

		// ----- getPromptsSummary -----
		pairs.push({
			page: "getPromptsSummary",
			lookback,
			raw: {
				sql: `
					SELECT
						prompt_id,
						count(*)::int AS total_runs,
						round(count(*) FILTER (WHERE brand_mentioned) * 100.0 / NULLIF(count(*), 0), 0)::int AS brand_mention_rate,
						round(count(*) FILTER (WHERE array_length(competitors_mentioned, 1) > 0) * 100.0 / NULLIF(count(*), 0), 0)::int AS competitor_mention_rate,
						(count(*) FILTER (WHERE brand_mentioned) * 2 + COALESCE(sum(array_length(competitors_mentioned, 1)), 0))::int AS total_weighted_mentions,
						max((created_at AT TIME ZONE $3)::date) AS last_run_date
					FROM prompt_runs
					WHERE brand_id = $1
						AND created_at >= ($2::date AT TIME ZONE $3)
						AND created_at < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY prompt_id`,
				values: args,
			},
			agg: {
				sql: `
					SELECT
						prompt_id,
						coalesce(sum(total_runs), 0)::int AS total_runs,
						round(coalesce(sum(brand_mentioned_count), 0) * 100.0 / NULLIF(coalesce(sum(total_runs), 0), 0), 0)::int AS brand_mention_rate,
						round(coalesce(sum(competitor_run_count), 0) * 100.0 / NULLIF(coalesce(sum(total_runs), 0), 0), 0)::int AS competitor_mention_rate,
						(coalesce(sum(brand_mentioned_count), 0) * 2 + coalesce(sum(competitor_mention_sum), 0))::int AS total_weighted_mentions,
						max((last_run_at AT TIME ZONE $3)::date) AS last_run_date
					FROM hourly_prompt_runs
					WHERE brand_id = $1
						AND hour >= ($2::date AT TIME ZONE $3)
						AND hour < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY prompt_id`,
				values: args,
			},
		});

		// ----- getCitationsTotalCount -----
		pairs.push({
			page: "getCitationsTotalCount",
			lookback,
			raw: {
				sql: `
					SELECT count(*)::int AS total
					FROM citations
					WHERE brand_id = $1
						AND created_at >= ($2::date AT TIME ZONE $3)
						AND created_at < $4
						AND prompt_id = ANY($5::uuid[])`,
				values: args,
			},
			agg: {
				sql: `
					SELECT coalesce(sum(count), 0)::int AS total
					FROM hourly_citations
					WHERE brand_id = $1
						AND hour >= ($2::date AT TIME ZONE $3)
						AND hour < $4
						AND prompt_id = ANY($5::uuid[])`,
				values: args,
			},
		});

		// ----- getCitationDomainStats (without example_title — title is approximate) -----
		pairs.push({
			page: "getCitationDomainStats",
			lookback,
			raw: {
				sql: `
					SELECT domain, count(*)::int AS count
					FROM citations
					WHERE brand_id = $1
						AND created_at >= ($2::date AT TIME ZONE $3)
						AND created_at < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY domain`,
				values: args,
			},
			agg: {
				sql: `
					SELECT domain, sum(count)::int AS count
					FROM hourly_citations
					WHERE brand_id = $1
						AND hour >= ($2::date AT TIME ZONE $3)
						AND hour < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY domain`,
				values: args,
			},
		});

		// ----- getCitationUrlStats -----
		pairs.push({
			page: "getCitationUrlStats",
			lookback,
			raw: {
				sql: `
					SELECT url, domain,
						count(*)::int AS count,
						round(avg(citation_index)::numeric, 1)::float AS avg_position,
						count(DISTINCT prompt_id)::int AS prompt_count
					FROM citations
					WHERE brand_id = $1
						AND created_at >= ($2::date AT TIME ZONE $3)
						AND created_at < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY url, domain`,
				values: args,
			},
			agg: {
				sql: `
					SELECT url, domain,
						sum(count)::int AS count,
						round(sum(sum_citation_index)::numeric / NULLIF(sum(count), 0), 1)::float AS avg_position,
						count(DISTINCT prompt_id)::int AS prompt_count
					FROM hourly_citation_urls
					WHERE brand_id = $1
						AND hour >= ($2::date AT TIME ZONE $3)
						AND hour < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY url, domain`,
				values: args,
			},
		});

		// ----- getPerPromptDailyCitationStats (drives chart) -----
		pairs.push({
			page: "getPerPromptDailyCitationStats",
			lookback,
			raw: {
				sql: `
					SELECT prompt_id,
						(created_at AT TIME ZONE $3)::date AS date,
						domain,
						count(*)::int AS count
					FROM citations
					WHERE brand_id = $1
						AND created_at >= ($2::date AT TIME ZONE $3)
						AND created_at < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY prompt_id, date, domain`,
				values: args,
			},
			agg: {
				sql: `
					SELECT prompt_id,
						(hour AT TIME ZONE $3)::date AS date,
						domain,
						sum(count)::int AS count
					FROM hourly_citations
					WHERE brand_id = $1
						AND hour >= ($2::date AT TIME ZONE $3)
						AND hour < $4
						AND prompt_id = ANY($5::uuid[])
					GROUP BY prompt_id, date, domain`,
				values: args,
			},
		});
	}

	return pairs;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	const client = new pg.Client({ connectionString: url });
	await client.connect();

	const prompts = (
		await client.query(`SELECT id FROM prompts WHERE brand_id=$1 AND enabled=true`, [BRAND_ID])
	).rows.map((r: { id: string }) => r.id);

	if (prompts.length === 0) {
		console.error(`No enabled prompts for brand ${BRAND_ID}`);
		process.exit(1);
	}

	// Sanity: are the aggregates populated?
	const stateRow = (
		await client.query(
			`SELECT last_refreshed_through, backfill_completed_at FROM aggregate_refresh_state WHERE id = 1`,
		)
	).rows[0] as { last_refreshed_through: Date | null; backfill_completed_at: Date | null } | undefined;

	console.log(`brand: ${BRAND_ID}`);
	console.log(`tz:    ${TZ}`);
	console.log(`runs:  ${RUNS} per query`);
	console.log(`enabled prompts: ${prompts.length}`);
	if (stateRow) {
		console.log(
			`aggregate_refresh_state: last_refreshed_through=${stateRow.last_refreshed_through?.toISOString() ?? "null"}, backfill_completed_at=${stateRow.backfill_completed_at?.toISOString() ?? "null"}`,
		);
	} else {
		console.warn("aggregate_refresh_state row missing — did the migration run?");
		process.exit(1);
	}
	if (!stateRow.last_refreshed_through || stateRow.last_refreshed_through.getTime() === new Date("1970-01-01").getTime()) {
		console.warn(
			"aggregate_refresh_state.last_refreshed_through is at the epoch — has the backfill (or live worker) run yet?",
		);
		process.exit(1);
	}

	// Pin both query paths to the watermark so they read the same source set
	// regardless of how far behind the worker / backfill is.
	const cutoff = stateRow.last_refreshed_through;
	console.log(`cutoff: ${cutoff.toISOString()} (both paths capped here)`);

	const pairs = buildPairs(prompts, cutoff);
	const trials: Trial[] = [];

	for (const pair of pairs) {
		console.log(`\n[${pair.page} @ ${pair.lookback}]`);

		// Warm both paths with one untimed run.
		await client.query(pair.raw.sql, pair.raw.values);
		await client.query(pair.agg.sql, pair.agg.values);

		const rawMs: number[] = [];
		const aggMs: number[] = [];
		let rawRows: unknown[] = [];
		let aggRows: unknown[] = [];

		for (let i = 0; i < RUNS; i++) {
			const r = await timed(client, pair.raw.sql, pair.raw.values);
			rawRows = r.rows;
			rawMs.push(r.ms);
			const a = await timed(client, pair.agg.sql, pair.agg.values);
			aggRows = a.rows;
			aggMs.push(a.ms);
		}

		const rawHash = canonicalize(rawRows);
		const aggHash = canonicalize(aggRows);
		const equal = rawHash === aggHash;

		console.log(`  raw: ${rawMs.map((x) => x.toFixed(0)).join(", ")} ms  (rows=${rawRows.length})`);
		console.log(`  agg: ${aggMs.map((x) => x.toFixed(0)).join(", ")} ms  (rows=${aggRows.length})`);
		console.log(`  equal: ${equal ? "✓" : "✗"}`);

		if (!equal) {
			// Show a few differing rows so the human can investigate.
			const rawSet = new Set(JSON.parse(rawHash) as string[]);
			const aggSet = new Set(JSON.parse(aggHash) as string[]);
			const onlyInRaw = [...rawSet].filter((x) => !aggSet.has(x)).slice(0, 3);
			const onlyInAgg = [...aggSet].filter((x) => !rawSet.has(x)).slice(0, 3);
			if (onlyInRaw.length) console.log("  only in raw (first 3):", onlyInRaw);
			if (onlyInAgg.length) console.log("  only in agg (first 3):", onlyInAgg);
		}

		trials.push({
			page: pair.page,
			lookback: pair.lookback,
			rawMs,
			aggMs,
			rowsRaw: rawRows.length,
			rowsAgg: aggRows.length,
			equal,
			mismatchSample: equal ? undefined : { rawHash: rawHash.slice(0, 80), aggHash: aggHash.slice(0, 80) },
		});
	}

	summary(trials);
	await client.end();

	const anyMismatch = trials.some((t) => !t.equal);
	process.exit(anyMismatch ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
