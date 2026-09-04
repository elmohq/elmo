#!/usr/bin/env tsx
/**
 * Equivalence + timing: postgres-read.ts (raw tables) vs rollup-read.ts
 * (rollup tables), for every function task 05a migrated.
 *
 * For the top N brands by run count, every combination of lookback (1w, 1m,
 * 3m), timezone (UTC, America/Los_Angeles, Asia/Kolkata), and model filter
 * (unset, and the first model found in that brand's runs), this calls each
 * migrated function via both modules with identical arguments, canonicalizes
 * both results (sorted by key columns, numbers stringified so a `12` and a
 * `"12"` compare equal), and diffs them. `getCitationUrlStats`,
 * `getPromptCitationUrlStats`, and `getPerPromptCitationPages` are folded
 * through `rollUpCitationUrls` first (raw rows are pre-fold: two literal URLs
 * that normalize the same are still two rows). `getCitationDomainStats`
 * compares only `domain`/`count`: `example_title` is documented in
 * rollup-read.ts as answering a different question once rollups are live
 * ("this domain's most-cited page" instead of "most recently cited"), so it
 * is expected to differ and is excluded rather than reported as a mismatch.
 *
 * Requires DATABASE_URL to be set explicitly — never loads a .env file, and
 * refuses to run if it's unset. Point it only at a throwaway database; this
 * reads real rows but writes nothing.
 *
 * Usage:
 *   cd apps/web
 *   DATABASE_URL=postgres://... pnpm exec tsx scripts/compare-analytics-reads.ts
 *   DATABASE_URL=postgres://... pnpm exec tsx scripts/compare-analytics-reads.ts --brands=10
 *
 * Do not run this in an agent sandbox against anything but the designated
 * test database.
 */
import type { CitationCategory } from "@workspace/lib/citations/domain-categories";
import { rollUpCitationUrls } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import { getBoundedLookbackRange } from "@/lib/timezone-utils";
import * as rawRead from "../src/lib/postgres-read";
import * as rollupRead from "../src/lib/rollup-read";

if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL must be set explicitly (no .env is loaded). Refusing to run.");
	process.exit(1);
}

const BRAND_COUNT = Number(process.argv.find((a) => a.startsWith("--brands="))?.split("=")[1] ?? "5");
const LOOKBACKS = ["1w", "1m", "3m"] as const;
const TIMEZONES = ["UTC", "America/Los_Angeles", "Asia/Kolkata"] as const;

// ============================================================================
// Canonicalization + diffing
// ============================================================================

/** Recursively sorts object keys and stringifies numbers, so two rows that
 * differ only in key order or in string-vs-number typing compare equal. */
function stableStringify(value: unknown): string {
	const normalize = (v: unknown): unknown => {
		if (typeof v === "number") return String(v);
		if (Array.isArray(v)) return v.map(normalize);
		if (v && typeof v === "object") {
			const out: Record<string, unknown> = {};
			for (const key of Object.keys(v as Record<string, unknown>).sort()) {
				out[key] = normalize((v as Record<string, unknown>)[key]);
			}
			return out;
		}
		return v;
	};
	return JSON.stringify(normalize(value));
}

function sortByKeys<T>(rows: T[], keyFields: string[]): T[] {
	return [...rows].sort((a, b) => {
		for (const k of keyFields) {
			const av = String((a as Record<string, unknown>)[k]);
			const bv = String((b as Record<string, unknown>)[k]);
			if (av !== bv) return av < bv ? -1 : 1;
		}
		return 0;
	});
}

interface DiffResult {
	ok: boolean;
	rawMs: number;
	rollupMs: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
	const start = performance.now();
	const result = await fn();
	return { result, ms: Math.round(performance.now() - start) };
}

let mismatches = 0;
const timings = new Map<string, { rawMs: number[]; rollupMs: number[] }>();

function recordTiming(name: string, rawMs: number, rollupMs: number) {
	const entry = timings.get(name) ?? { rawMs: [], rollupMs: [] };
	entry.rawMs.push(rawMs);
	entry.rollupMs.push(rollupMs);
	timings.set(name, entry);
}

/** Runs one raw/rollup pair, canonicalizes, diffs, and prints a mismatch. */
async function compare<T>(
	label: string,
	context: string,
	fetchRaw: () => Promise<T>,
	fetchRollup: () => Promise<T>,
	canonicalize: (value: T) => string,
): Promise<DiffResult> {
	const [raw, rollup] = await Promise.all([timed(fetchRaw), timed(fetchRollup)]);
	recordTiming(label, raw.ms, rollup.ms);
	const rawCanon = canonicalize(raw.result);
	const rollupCanon = canonicalize(rollup.result);
	const ok = rawCanon === rollupCanon;
	if (!ok) {
		mismatches++;
		console.error(`MISMATCH ${label} [${context}]`);
		console.error("  raw:   ", rawCanon.slice(0, 2000));
		console.error("  rollup:", rollupCanon.slice(0, 2000));
	}
	return { ok, rawMs: raw.ms, rollupMs: rollup.ms };
}

const canonArray =
	(keyFields: string[]) =>
	<T>(rows: T[]): string =>
		stableStringify(sortByKeys(rows, keyFields));

const canonOne = <T>(value: T): string => stableStringify(value);

const canonMap = (map: Map<string, number>): string =>
	stableStringify(
		sortByKeys(
			[...map.entries()].map(([domain, count]) => ({ domain, count })),
			["domain"],
		),
	);

/** No-op classifier: the citation-url family fold only needs to agree on
 * url/domain/title/count/avgPosition here — category correctness is covered
 * separately (resolveCitationClass and the rollup integration tests). */
const dummyClassify = (): CitationCategory => "other";

interface FoldedUrlRow {
	url: string;
	domain: string;
	title: string | null;
	count: number;
	avgPosition: number | null;
}

function foldCitationUrlRows(
	rows: { url: string; domain: string; title: string | null; count: number; avg_position: number | null }[],
): FoldedUrlRow[] {
	return rollUpCitationUrls(rows, dummyClassify).map((r) => ({
		url: r.url,
		domain: r.domain,
		title: r.title ?? null,
		count: r.count,
		avgPosition: r.avgPosition,
	}));
}

/** getPerPromptCitationPages has no avg_position and is grouped per prompt —
 * fold each prompt's rows separately so URLs from different prompts never merge. */
function foldPerPromptCitationPages(
	rows: { prompt_id: string; url: string | null; domain: string; title: string | null; count: number }[],
): (FoldedUrlRow & { prompt_id: string })[] {
	const byPrompt = new Map<string, typeof rows>();
	for (const row of rows) {
		if (!row.url) continue;
		const list = byPrompt.get(row.prompt_id) ?? [];
		list.push(row);
		byPrompt.set(row.prompt_id, list);
	}
	const out: (FoldedUrlRow & { prompt_id: string })[] = [];
	for (const [promptId, promptRows] of byPrompt) {
		const withPosition = promptRows.map((r) => ({ ...r, url: r.url as string, avg_position: null }));
		for (const folded of foldCitationUrlRows(withPosition)) out.push({ prompt_id: promptId, ...folded });
	}
	return out;
}

// ============================================================================
// Brand discovery
// ============================================================================

interface BrandCase {
	brandId: string;
	promptIds: string[];
	firstModel: string | undefined;
}

async function topBrands(limit: number): Promise<BrandCase[]> {
	const rows = await db.execute(sql`
		SELECT brand_id, count(*)::int AS runs
		FROM prompt_runs
		GROUP BY brand_id
		ORDER BY runs DESC
		LIMIT ${limit}
	`);
	const cases: BrandCase[] = [];
	for (const row of rows.rows as { brand_id: string }[]) {
		const brandId = row.brand_id;
		const [promptRows, modelRows] = await Promise.all([
			db.execute(sql`SELECT id FROM prompts WHERE brand_id = ${brandId}`),
			db.execute(sql`SELECT model FROM prompt_runs WHERE brand_id = ${brandId} ORDER BY model LIMIT 1`),
		]);
		cases.push({
			brandId,
			promptIds: (promptRows.rows as { id: string }[]).map((r) => r.id),
			firstModel: (modelRows.rows as { model: string }[])[0]?.model,
		});
	}
	return cases;
}

// ============================================================================
// Per-window comparisons
// ============================================================================

async function compareWindow(brand: BrandCase, from: string, to: string, tz: string, model: string | undefined) {
	const ctx = `${brand.brandId} ${from}..${to} ${tz} model=${model ?? "unset"}`;
	const ids = brand.promptIds;

	await compare(
		"getDashboardSummary",
		ctx,
		() => rawRead.getDashboardSummary(brand.brandId, from, to, tz, ids),
		() => rollupRead.getDashboardSummary(brand.brandId, from, to, tz, ids),
		canonArray([]),
	);
	await compare(
		"getPerPromptVisibilityTimeSeries",
		ctx,
		() => rawRead.getPerPromptVisibilityTimeSeries(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getPerPromptVisibilityTimeSeries(brand.brandId, from, to, tz, ids, model),
		canonArray(["prompt_id", "date"]),
	);
	await compare(
		"getVisibilityDailyAggregate",
		ctx,
		() => rawRead.getVisibilityDailyAggregate(brand.brandId, from, to, tz, ids, ids, model),
		() => rollupRead.getVisibilityDailyAggregate(brand.brandId, from, to, tz, ids, ids, model),
		canonArray(["date"]),
	);
	await compare(
		"getCitationsTotalCount",
		ctx,
		() => rawRead.getCitationsTotalCount(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getCitationsTotalCount(brand.brandId, from, to, tz, ids, model),
		canonOne,
	);
	await compare(
		"getPromptsSummary",
		ctx,
		() => rawRead.getPromptsSummary(brand.brandId, from, to, tz, undefined, model, ids),
		() => rollupRead.getPromptsSummary(brand.brandId, from, to, tz, undefined, model, ids),
		canonArray(["prompt_id"]),
	);
	await compare(
		"getCitationDomainStats",
		ctx,
		() => rawRead.getCitationDomainStats(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getCitationDomainStats(brand.brandId, from, to, tz, ids, model),
		// example_title intentionally differs post-rollup (see file header) — compare counts only.
		(rows) => canonArray(["domain"])(rows.map((r) => ({ domain: r.domain, count: r.count }))),
	);
	await compare(
		"getCitationUrlStats",
		ctx,
		() => rawRead.getCitationUrlStats(brand.brandId, from, to, tz, ids, model).then(foldCitationUrlRows),
		() => rollupRead.getCitationUrlStats(brand.brandId, from, to, tz, ids, model).then(foldCitationUrlRows),
		canonArray(["url"]),
	);
	await compare(
		"getCitationDomainPromptCounts",
		ctx,
		() => rawRead.getCitationDomainPromptCounts(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getCitationDomainPromptCounts(brand.brandId, from, to, tz, ids, model),
		canonMap,
	);
	await compare(
		"getDailyCitationStats",
		ctx,
		() => rawRead.getDailyCitationStats(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getDailyCitationStats(brand.brandId, from, to, tz, ids, model),
		canonArray(["date", "domain"]),
	);
	await compare(
		"getPerPromptDailyCitationStats",
		ctx,
		() => rawRead.getPerPromptDailyCitationStats(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getPerPromptDailyCitationStats(brand.brandId, from, to, tz, ids, model),
		canonArray(["prompt_id", "date", "domain"]),
	);
	await compare(
		"getPerPromptRunStats",
		ctx,
		() => rawRead.getPerPromptRunStats(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getPerPromptRunStats(brand.brandId, from, to, tz, ids, model),
		canonArray(["prompt_id"]),
	);
	await compare(
		"getBrandMentionTotals",
		ctx,
		() => rawRead.getBrandMentionTotals(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getBrandMentionTotals(brand.brandId, from, to, tz, ids, model),
		canonOne,
	);
	await compare(
		"getPerPromptDailyMentions",
		ctx,
		() => rawRead.getPerPromptDailyMentions(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getPerPromptDailyMentions(brand.brandId, from, to, tz, ids, model),
		canonArray(["prompt_id", "date"]),
	);
	await compare(
		"getPerPromptDailyCompetitorMentions",
		ctx,
		() => rawRead.getPerPromptDailyCompetitorMentions(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getPerPromptDailyCompetitorMentions(brand.brandId, from, to, tz, ids, model),
		canonArray(["prompt_id", "date", "competitor"]),
	);
	await compare(
		"getPerPromptCitationPages",
		ctx,
		() => rawRead.getPerPromptCitationPages(brand.brandId, from, to, tz, ids, model).then(foldPerPromptCitationPages),
		() =>
			rollupRead.getPerPromptCitationPages(brand.brandId, from, to, tz, ids, model).then(foldPerPromptCitationPages),
		canonArray(["prompt_id", "url"]),
	);
	await compare(
		"getBrandMentionRateByModel",
		ctx,
		() => rawRead.getBrandMentionRateByModel(brand.brandId, from, to, tz, ids, model),
		() => rollupRead.getBrandMentionRateByModel(brand.brandId, from, to, tz, ids, model),
		canonArray(["model"]),
	);
	await compare(
		"getBatchChartData",
		ctx,
		() => rawRead.getBatchChartData(brand.brandId, ids, from, to, tz, undefined, model),
		() => rollupRead.getBatchChartData(brand.brandId, ids, from, to, tz, undefined, model),
		canonArray(["prompt_id", "date"]),
	);

	// Single-prompt functions: sampled against the brand's first prompt.
	const promptId = ids[0];
	if (promptId) {
		await compare(
			"getPromptCitationUrlStats",
			ctx,
			() => rawRead.getPromptCitationUrlStats(promptId, from, to, tz).then(foldCitationUrlRows),
			() => rollupRead.getPromptCitationUrlStats(promptId, from, to, tz).then(foldCitationUrlRows),
			canonArray(["url"]),
		);
		await compare(
			"getPromptMentionSummary",
			ctx,
			() => rawRead.getPromptMentionSummary(promptId, from, to, tz),
			() => rollupRead.getPromptMentionSummary(promptId, from, to, tz),
			canonOne,
		);
		await compare(
			"getPromptTopCompetitorMentions",
			ctx,
			() => rawRead.getPromptTopCompetitorMentions(promptId, from, to, tz, 10),
			() => rollupRead.getPromptTopCompetitorMentions(promptId, from, to, tz, 10),
			canonArray(["competitor_name"]),
		);
	}
}

/** Every (lookback, timezone, model) combination for one brand — the model
 * filter is unset plus, when the brand has one, its first model; a brand with
 * no runs (so no first model) still gets the unset pass. */
async function compareBrand(brand: BrandCase): Promise<void> {
	console.log(
		`\nBrand ${brand.brandId} (${brand.promptIds.length} prompts, first model: ${brand.firstModel ?? "none"})`,
	);
	const models = brand.firstModel ? [undefined, brand.firstModel] : [undefined];
	for (const lookback of LOOKBACKS) {
		for (const tz of TIMEZONES) {
			const { fromDateStr, toDateStr } = getBoundedLookbackRange(lookback, tz);
			for (const model of models) {
				await compareWindow(brand, fromDateStr, toDateStr, tz, model);
			}
		}
	}
}

function printTimingSummary(): void {
	console.log("\n=== Timing (ms, avg raw / avg rollup) ===");
	const avg = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) / values.length);
	for (const [name, entry] of [...timings.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		console.log(
			`  ${name.padEnd(36)} ${String(avg(entry.rawMs)).padStart(5)} / ${String(avg(entry.rollupMs)).padStart(5)}`,
		);
	}
}

async function main() {
	console.log(`Comparing raw vs rollup analytics reads across the top ${BRAND_COUNT} brand(s) by run count.`);
	const brands = await topBrands(BRAND_COUNT);
	if (brands.length === 0) {
		console.log("No brands with runs in this database — nothing to compare.");
		return;
	}

	for (const brand of brands) await compareBrand(brand);

	printTimingSummary();
	console.log(mismatches === 0 ? "\nAll comparisons matched." : `\n${mismatches} mismatch(es) found.`);
	process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
