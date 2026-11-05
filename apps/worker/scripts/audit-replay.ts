#!/usr/bin/env tsx
import { normalizeUrl } from "@workspace/lib/citations/domain-categories";
/**
 * Read-only: what replaying stored runs would do, before an extractor or matcher
 * change replays them for real. For each run it re-extracts the stored payload and
 * re-matches mentions under the brand's current config, then counts, per provider,
 * where that would lose or change what the run has today. Payloads stored by older
 * code can lack what that code read, and this is where that shows up.
 *
 * Reprocess already refuses to replace something with nothing; this shows how
 * often that will happen and where replay would change history instead.
 *
 * Mentions are re-judged the way the worker would, with Jev: that's a paid call per run (very
 * roughly $0.0002), so set TYPESAFE_API_KEY (or OPENROUTER_API_KEY), keep --limit small, or pass
 * --skip-mentions to audit extraction only.
 *
 * Usage (never loads .env; point it at a database you mean to read):
 *   cd apps/worker
 *   DATABASE_URL=postgres://... TYPESAFE_API_KEY=... pnpm exec tsx scripts/audit-replay.ts [--brand=<id>] [--since=2026-01-01] [--limit=500] [--skip-mentions]
 */
import { db } from "@workspace/lib/db/db";
import { loadRawOutputs, selectRuns } from "@workspace/lib/db/runs";
import { brands, citations, competitors, promptRuns } from "@workspace/lib/db/schema";
import { type MentionConfig, mentionConfigFrom } from "@workspace/lib/mentions";
import { extractorFor, extractRun } from "@workspace/lib/text-extraction";
import { and, asc, eq, gt, gte, inArray } from "drizzle-orm";
import { mentionAnalyzer } from "../src/mention-judge/analyze";

if (!process.env.DATABASE_URL) {
	console.error("Set DATABASE_URL explicitly; this script never reads .env.");
	process.exit(1);
}

const args = new Map(
	process.argv.slice(2).map((arg) => {
		const [key, value = ""] = arg.replace(/^--/, "").split("=");
		return [key, value];
	}),
);
const brandFilter = args.get("brand");
const since = args.get("since");
const limit = Number(args.get("limit") ?? 500);
const skipMentions = args.has("skip-mentions");
const BATCH = 500;

type Finding =
	| "text lost"
	| "text changed"
	| "text filled"
	| "citations lost"
	| "citations changed"
	| "mentions lost (no text)"
	| "mentions changed";

interface Tally {
	runs: number;
	findings: Map<Finding, { count: number; examples: string[] }>;
}

const tallies = new Map<string, Tally>();

function record(provider: string, finding: Finding | null, runId: string): void {
	const tally = tallies.get(provider) ?? { runs: 0, findings: new Map() };
	tallies.set(provider, tally);
	if (finding === null) {
		tally.runs++;
		return;
	}
	const entry = tally.findings.get(finding) ?? { count: 0, examples: [] };
	entry.count++;
	if (entry.examples.length < 3) entry.examples.push(runId);
	tally.findings.set(finding, entry);
}

const configs = new Map<string, MentionConfig>();
async function configFor(brandId: string): Promise<MentionConfig> {
	const cached = configs.get(brandId);
	if (cached) return cached;
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
	const brandCompetitors = await db.select().from(competitors).where(eq(competitors.brandId, brandId));
	const config = mentionConfigFrom(brand, brandCompetitors);
	configs.set(brandId, config);
	return config;
}

async function storedCitationUrls(runIds: string[]): Promise<Map<string, Set<string>>> {
	const rows = await db
		.select({ runId: citations.promptRunId, url: citations.url })
		.from(citations)
		.where(inArray(citations.promptRunId, runIds));
	const byRun = new Map<string, Set<string>>();
	for (const row of rows) {
		const urls = byRun.get(row.runId) ?? new Set();
		urls.add(normalizeUrl(row.url));
		byRun.set(row.runId, urls);
	}
	return byRun;
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

type AuditedRun = Awaited<ReturnType<typeof runsPage>>[number];

function compareText(stored: string | null, replayed: string | null): Finding | null {
	if (stored !== null && replayed === null) return "text lost";
	if (stored === null && replayed !== null) return "text filled";
	return stored === replayed ? null : "text changed";
}

function compareCitations(stored: Set<string>, replayed: Set<string>): Finding | null {
	if (stored.size > 0 && replayed.size === 0) return "citations lost";
	return sameSet(stored, replayed) ? null : "citations changed";
}

async function compareMentions(run: AuditedRun, text: string | null): Promise<Finding | null> {
	const hasMentions = run.brandMentioned || run.competitorsMentioned.length > 0;
	if (text === null && hasMentions) return "mentions lost (no text)";
	if (skipMentions) return null;
	const replayed = await mentionAnalyzer().analyze(text, await configFor(run.brandId));
	const same =
		replayed.brandMentioned === run.brandMentioned &&
		sameSet(new Set(replayed.competitorsMentioned), new Set(run.competitorsMentioned));
	return same ? null : "mentions changed";
}

async function auditRun(run: AuditedRun, raw: unknown, storedUrls: Set<string>): Promise<void> {
	const provider = extractorFor(run);
	record(provider, null, run.id);
	const extracted = extractRun(raw, provider);
	const replayedUrls = new Set(extracted.citations.map((c) => normalizeUrl(c.url)));
	const findings = [
		compareText(run.textContent, extracted.textContent),
		compareCitations(storedUrls, replayedUrls),
		await compareMentions(run, extracted.textContent ?? run.textContent),
	];
	for (const finding of findings) if (finding) record(provider, finding, run.id);
}

function runsPage(after: string | null) {
	return selectRuns(db)
		.where(
			and(
				brandFilter ? eq(promptRuns.brandId, brandFilter) : undefined,
				since ? gte(promptRuns.createdAt, new Date(since)) : undefined,
				after ? gt(promptRuns.id, after) : undefined,
			),
		)
		.orderBy(asc(promptRuns.id))
		.limit(BATCH);
}

async function auditBatch(after: string | null): Promise<string | null> {
	const runs = await runsPage(after);
	if (runs.length === 0) return null;

	const ids = runs.map((run) => run.id);
	const [raw, cited] = await Promise.all([loadRawOutputs(db, ids), storedCitationUrls(ids)]);

	for (const run of runs) await auditRun(run, raw.get(run.id), cited.get(run.id) ?? new Set());
	return runs[runs.length - 1].id;
}

async function main(): Promise<void> {
	let audited = 0;
	let cursor: string | null = null;
	while (audited < limit) {
		cursor = await auditBatch(cursor);
		if (!cursor) break;
		audited += BATCH;
		process.stderr.write(`\raudited ~${audited} runs`);
	}
	process.stderr.write("\n");

	for (const [provider, tally] of [...tallies.entries()].sort()) {
		console.log(`\n${provider}: ${tally.runs} runs`);
		if (tally.findings.size === 0) console.log("  replays cleanly");
		for (const [finding, { count, examples }] of tally.findings) {
			const share = ((count / tally.runs) * 100).toFixed(1);
			console.log(`  ${finding.padEnd(24)} ${String(count).padStart(7)} (${share}%)  e.g. ${examples.join(", ")}`);
		}
	}
	console.log(
		"\n'lost' rows are kept as they are by reprocess; 'changed' rows would be rewritten. Read examples with the run detail page before bumping a version.",
	);
	await db.$client.end();
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
