#!/usr/bin/env tsx

/**
 * Re-runs prompts whose stored fan-out is nothing but the `unavailable`
 * sentinel, so the Query Fan-out page has real data without waiting for the
 * next scheduled cycle.
 *
 * This is a re-run, not a repair: `raw_output` for the API providers is rebuilt
 * from the parsed response (answer text plus citation annotations) and never
 * held the search queries, so there is nothing in the database to re-extract.
 * Each run therefore writes a NEW prompt run at the current timestamp; existing
 * rows are left alone rather than backdated with queries that didn't run then.
 *
 * Only the target that reported `unavailable` is re-run, so a prompt tracked
 * across several targets is charged for one call, not the whole fan-out.
 *
 * Reports what it would do and stops unless `--execute` is passed, because the
 * run costs provider calls against whatever DATABASE_URL the env file resolves
 * to — check that it is the deployment you mean before adding the flag.
 *
 * Usage:
 *   pnpm tsx --env-file=../web/.env scripts/backfill-fanout-queries.ts
 *   pnpm tsx --env-file=../web/.env scripts/backfill-fanout-queries.ts --limit 50 --execute
 */

import { WEB_QUERIES_UNAVAILABLE } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, citations, competitors, promptRuns, prompts, usageEvents } from "@workspace/lib/db/schema";
import { analyzeMentions } from "@workspace/lib/mentions";
import { getProvider } from "@workspace/lib/providers";
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { eq, sql } from "drizzle-orm";

const USAGE = `Usage: pnpm tsx --env-file=../web/.env scripts/backfill-fanout-queries.ts [flags]

  --provider <id>   Provider to re-run (default: openai-api)
  --brand <id>      Restrict to one brand
  --since <days>    Only prompts whose sentinel rows land in the last N days (default: 30)
  --limit <n>       Stop after N prompts — the spend bound
  --concurrency <n> Parallel provider calls (default: 4)
  --execute         Actually run and save; without it nothing is called or written`;

interface Args {
	provider: string;
	brand?: string;
	since: number;
	limit?: number;
	concurrency: number;
	execute: boolean;
}

const VALUE_FLAGS = ["--provider", "--brand", "--since", "--limit", "--concurrency"];

function positive(raw: string | undefined, flag: string, fallback: number): number;
function positive(raw: string | undefined, flag: string, fallback?: undefined): number | undefined;
function positive(raw: string | undefined, flag: string, fallback?: number): number | undefined {
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} must be a positive number`);
	return value;
}

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	const values = new Map<string, string>();
	const seen = new Set<string>();

	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		if (flag === "--help" || flag === "-h") {
			console.log(USAGE);
			process.exit(0);
		}
		if (VALUE_FLAGS.includes(flag)) {
			const value = argv[++i];
			if (value === undefined) throw new Error(`${flag} needs a value`);
			values.set(flag, value);
		} else if (flag === "--execute") {
			seen.add(flag);
		} else {
			throw new Error(`Unknown argument: ${flag}\n\n${USAGE}`);
		}
	}

	return {
		provider: values.get("--provider") ?? "openai-api",
		brand: values.get("--brand"),
		since: positive(values.get("--since"), "--since", 30),
		limit: positive(values.get("--limit"), "--limit"),
		concurrency: positive(values.get("--concurrency"), "--concurrency", 4),
		execute: seen.has("--execute"),
	};
}

interface Target {
	promptId: string;
	promptValue: string;
	brandId: string;
	model: string;
	version: string;
	/** Sentinel rows this target accounts for — reported, not rewritten. */
	staleRuns: number;
}

/**
 * One row per (prompt, model, version) that only ever reported the sentinel.
 *
 * Conditional aggregation over a single pass of the provider's slice, rather
 * than an anti-join against `prompt_runs` per candidate: the correlated form
 * re-scans the table for every row it considers and times out on a real
 * deployment's history.
 *
 * `genuine_runs = 0` is what makes this a backfill rather than a re-run of
 * everything — a target that has produced a real query inside the window is
 * already working, so it is skipped even though older rows still hold the
 * sentinel.
 */
async function findTargets(args: Args): Promise<Target[]> {
	const brandFilter = args.brand ? sql`AND pr.brand_id = ${args.brand}` : sql``;
	const rows = await db.execute<{
		prompt_id: string;
		prompt_value: string;
		brand_id: string;
		model: string;
		version: string;
		stale_runs: number;
	}>(sql`
		WITH candidates AS (
			SELECT
				pr.prompt_id,
				pr.brand_id,
				pr.model,
				pr.version,
				count(*) FILTER (WHERE pr.web_queries = ARRAY[${WEB_QUERIES_UNAVAILABLE}]::text[])::int AS stale_runs,
				count(*) FILTER (WHERE EXISTS (
					SELECT 1 FROM unnest(pr.web_queries) AS wq
					WHERE length(btrim(wq)) > 0 AND lower(btrim(wq)) <> ${WEB_QUERIES_UNAVAILABLE}
				))::int AS genuine_runs
			FROM prompt_runs AS pr
			WHERE pr.provider = ${args.provider}
				AND pr.web_search_enabled
				AND pr.created_at >= now() - make_interval(days => ${args.since})
				${brandFilter}
			GROUP BY pr.prompt_id, pr.brand_id, pr.model, pr.version
		)
		SELECT c.prompt_id, p.value AS prompt_value, c.brand_id, c.model, c.version, c.stale_runs
		FROM candidates AS c
		JOIN prompts AS p ON p.id = c.prompt_id AND p.enabled
		WHERE c.stale_runs > 0 AND c.genuine_runs = 0
		ORDER BY c.stale_runs DESC
		${args.limit ? sql`LIMIT ${args.limit}` : sql``}
	`);

	return rows.rows.map((r) => ({
		promptId: r.prompt_id,
		promptValue: r.prompt_value,
		brandId: r.brand_id,
		model: r.model,
		version: r.version,
		staleRuns: r.stale_runs,
	}));
}

/** Brand and competitor rows for mention analysis, fetched once per brand. */
async function loadBrandContexts(brandIds: string[]) {
	const contexts = new Map<
		string,
		{ brand: typeof brands.$inferSelect; competitors: (typeof competitors.$inferSelect)[] }
	>();
	for (const brandId of brandIds) {
		const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
		if (!brand) continue;
		const competitorList = await db.select().from(competitors).where(eq(competitors.brandId, brandId));
		contexts.set(brandId, { brand, competitors: competitorList });
	}
	return contexts;
}

async function runTarget(
	target: Target,
	args: Args,
	context: { brand: typeof brands.$inferSelect; competitors: (typeof competitors.$inferSelect)[] },
): Promise<string[]> {
	const provider = getProvider(args.provider);
	if (!provider) throw new Error(`Unknown provider: ${args.provider}`);

	const result = await provider.run(target.model, target.promptValue, {
		webSearch: true,
		version: target.version,
	});

	const textContent = typeof result.textContent === "string" ? result.textContent : "";
	const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, context.brand, context.competitors);

	const [saved] = await db
		.insert(promptRuns)
		.values({
			promptId: target.promptId,
			brandId: target.brandId,
			model: target.model,
			provider: args.provider,
			version: result.modelVersion ?? target.version,
			webSearchEnabled: true,
			rawOutput: result.rawOutput,
			webQueries: result.webQueries,
			brandMentioned,
			competitorsMentioned,
		})
		.returning({ id: promptRuns.id, createdAt: promptRuns.createdAt });

	if (result.citations.length > 0) {
		await db.insert(citations).values(
			result.citations.map((c) => ({
				promptRunId: saved.id,
				promptId: target.promptId,
				brandId: target.brandId,
				model: target.model,
				url: c.url,
				domain: c.domain,
				title: c.title || null,
				citationIndex: c.citationIndex,
				createdAt: saved.createdAt,
			})),
		);
	}

	// Same attribution a scheduled run records — these calls are billable too.
	const cost = estimateRunCostUsd(args.provider, true);
	await db.insert(usageEvents).values({
		organizationId: context.brand.organizationId,
		brandId: target.brandId,
		promptId: target.promptId,
		eventType: "prompt_run",
		provider: args.provider,
		model: target.model,
		webSearchEnabled: true,
		units: 1,
		estimatedCostUsd: cost === null ? null : cost.toFixed(6),
	});

	return result.webQueries;
}

/** Runs `work` over `items` with at most `concurrency` in flight. */
async function mapWithConcurrency<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>): Promise<void> {
	let next = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (next < items.length) {
			await work(items[next++]);
		}
	});
	await Promise.all(workers);
}

async function main() {
	const args = parseArgs();
	const targets = await findTargets(args);

	if (targets.length === 0) {
		console.log(
			`No ${args.provider} targets are stuck on "${WEB_QUERIES_UNAVAILABLE}" in the last ${args.since} days.`,
		);
		return;
	}

	const perCall = estimateRunCostUsd(args.provider, true);
	const staleRuns = targets.reduce((sum, t) => sum + t.staleRuns, 0);
	console.log(
		`${targets.length} target(s) covering ${staleRuns} sentinel run(s); ` +
			`estimated cost ${perCall === null ? "unknown" : `$${(perCall * targets.length).toFixed(2)}`}`,
	);

	if (!args.execute) {
		for (const t of targets) {
			console.log(`  ${t.model}:${args.provider}:${t.version}  (${t.staleRuns} stale)  ${t.promptValue}`);
		}
		console.log("\nNothing called, nothing written. Re-run with --execute to backfill.");
		return;
	}

	const contexts = await loadBrandContexts([...new Set(targets.map((t) => t.brandId))]);
	let succeeded = 0;
	let withQueries = 0;
	let failed = 0;

	await mapWithConcurrency(targets, args.concurrency, async (target) => {
		const context = contexts.get(target.brandId);
		if (!context) {
			console.error(`  skip ${target.promptId}: brand ${target.brandId} not found`);
			failed++;
			return;
		}
		try {
			const queries = await runTarget(target, args, context);
			succeeded++;
			const genuine = queries.filter((q) => q.trim().toLowerCase() !== WEB_QUERIES_UNAVAILABLE);
			if (genuine.length > 0) withQueries++;
			console.log(`  ok ${target.model} — ${genuine.length} quer${genuine.length === 1 ? "y" : "ies"}`);
		} catch (error) {
			failed++;
			console.error(
				`  fail ${target.model} "${target.promptValue}": ${error instanceof Error ? error.message : error}`,
			);
		}
	});

	console.log(`\n${succeeded} run(s) saved, ${withQueries} with real fan-out queries, ${failed} failed.`);
	if (succeeded > 0 && withQueries === 0) {
		console.log(
			`Every run still reported "${WEB_QUERIES_UNAVAILABLE}" — the provider is not exposing its queries for this surface.`,
		);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
