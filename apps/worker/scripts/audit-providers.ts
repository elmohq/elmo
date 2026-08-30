#!/usr/bin/env tsx

/**
 * Audits the recorded provider-test history against what each target is
 * declared to return, and fails when they disagree.
 *
 * Reads only what the scheduled provider test already pushed to Redis, so it
 * calls no provider and costs no inference. Run it on its own schedule, well
 * after a test run has landed.
 *
 * Usage:
 *   pnpm tsx apps/worker/scripts/audit-providers.ts
 *   pnpm tsx apps/worker/scripts/audit-providers.ts --days 7
 *   pnpm tsx apps/worker/scripts/audit-providers.ts --payloads ./dumps
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { STATUS_TARGET_EXPECTATIONS, STATUS_TARGETS } from "@workspace/config/scrape-targets";
import {
	AUDIT_MIN_RUNS,
	type AuditInput,
	auditPayload,
	auditTargets,
	type ProviderRunRecord,
	type Violation,
} from "@workspace/lib/provider-audit";

/**
 * The provider test runs four times a day, so a single day rarely reaches the
 * sample a "reported nothing" finding needs. A week is what Redis retains and
 * what makes silence conclusive; a total break still surfaces within a couple
 * of days, as its last real result ages out.
 */
const DEFAULT_DAYS = 7;

interface RedisEntry {
	status?: "pass" | "fail";
	citations?: number;
	genuineWebQueries?: number;
	queriesInRawOutput?: boolean;
}

/**
 * Payloads written by `test-provider.ts --dump`, keyed back to their target.
 * The dump encodes a target as a filename, so the mapping is rebuilt from the
 * target list rather than by parsing names back apart.
 */
function loadPayloads(dir: string): Map<string, unknown> {
	const byFilename = new Map(STATUS_TARGETS.map((t) => [`${t.replace(/[/:]/g, "-")}.json`, t]));
	const payloads = new Map<string, unknown>();
	for (const filename of readdirSync(dir)) {
		const target = byFilename.get(filename);
		if (!target) continue;
		payloads.set(target, JSON.parse(readFileSync(join(dir, filename), "utf8")));
	}
	return payloads;
}

function parseFlag(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function parseDays(): number {
	const raw = parseFlag("--days");
	if (raw === undefined) return DEFAULT_DAYS;
	const days = Number(raw);
	if (!Number.isFinite(days) || days <= 0) throw new Error("--days must be a positive number");
	return days;
}

function createRedis(): Redis {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
	return new Redis({ url, token });
}

/** Same key and window the status page reads, so both see one history. */
async function fetchEntries(redis: Redis, target: string, sinceMs: number): Promise<RedisEntry[]> {
	const raw = await redis.zrange<unknown[]>(`provider-status:${target}`, sinceMs, "+inf", { byScore: true });
	return raw.map((item) => (typeof item === "string" ? JSON.parse(item) : item) as RedisEntry);
}

/**
 * Entries predating the richer fields are dropped rather than defaulted: a
 * missing `genuineWebQueries` would read as "reported nothing" and invent a
 * violation out of a schema change.
 */
function toRecords(entries: RedisEntry[]): ProviderRunRecord[] {
	return entries
		.filter((e) => e.status !== undefined && e.genuineWebQueries !== undefined)
		.map((e) => ({
			status: e.status as "pass" | "fail",
			citations: e.citations ?? 0,
			genuineWebQueries: e.genuineWebQueries ?? 0,
			queriesInRawOutput: e.queriesInRawOutput ?? true,
		}));
}

function report(violations: Violation[], targetCount: number, days: number): void {
	if (violations.length === 0) {
		console.log(`All ${targetCount} monitored targets matched their expectations over the last ${days} day(s).`);
		return;
	}

	console.error(`\n${violations.length} target(s) diverged from expectation over the last ${days} day(s):\n`);
	for (const v of violations) {
		// Which side is more likely wrong is the first thing anyone reading this
		// needs, so it leads rather than sitting in a footnote.
		const blame = v.expectationVerified ? "code" : "expectation is a guess";
		console.error(`  ${v.target}`);
		console.error(`    [${v.kind}] ${v.message}`);
		console.error(`    likely wrong: ${blame}`);
	}
	console.error(
		`\nEither the provider changed and its extractor needs updating, or STATUS_TARGET_EXPECTATIONS is wrong.\n` +
			`Absence findings need ${AUDIT_MIN_RUNS}+ passing runs; presence findings need only one.`,
	);
}

/**
 * Targets we get nothing from and cannot yet say why. Not failures — nobody can
 * act on a finding that might equally be the provider or our own extractor — but
 * they are the backlog, so they stay visible rather than passing silently.
 */
function reportOpenQuestions(inputs: AuditInput[]): void {
	const open = inputs.filter((i) => i.expectation.webQueries === "unknown").map((i) => i.target);
	if (open.length === 0) return;
	console.log(`\n${open.length} target(s) report no web queries for reasons not yet established:`);
	for (const target of open) console.log(`  ${target}`);
	console.log(
		"Capture one payload each (test-provider.ts --dump <dir>) and set webQueries to yes or no in\n" +
			"STATUS_TARGET_EXPECTATIONS. Until then a broken extractor here is indistinguishable from a\n" +
			"provider that exposes nothing.",
	);
}

async function main() {
	const days = parseDays();
	const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

	const redis = createRedis();
	const inputs: AuditInput[] = await Promise.all(
		STATUS_TARGETS.map(async (target) => ({
			target,
			expectation: STATUS_TARGET_EXPECTATIONS[target],
			records: toRecords(await fetchEntries(redis, target, sinceMs)),
		})),
	);

	const violations = auditTargets(inputs);

	// Checking the payloads themselves is what turns an open question into an
	// answer: a provider carrying searches we never read is a defect no amount of
	// watching our own output would surface.
	const payloadDir = parseFlag("--payloads");
	if (payloadDir && existsSync(payloadDir)) {
		const payloads = loadPayloads(payloadDir);
		console.log(`Scanning ${payloads.size} payload(s) for searches we are not extracting.`);
		for (const [target, payload] of payloads) {
			const latest = inputs.find((i) => i.target === target)?.records.at(-1);
			violations.push(...auditPayload(target, payload, latest?.genuineWebQueries ?? 0));
		}
	} else if (payloadDir) {
		console.warn(`No payloads at ${payloadDir} — skipping the payload scan.`);
	}

	report(violations, STATUS_TARGETS.length, days);
	reportOpenQuestions(inputs);
	process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
