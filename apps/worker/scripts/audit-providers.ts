#!/usr/bin/env tsx

/**
 * Audits recorded provider-test history against what each target is declared to
 * return, and fails when they disagree. Reads only what the scheduled test
 * already recorded, so it calls no provider.
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
 * A single day rarely reaches the sample a "reported nothing" finding needs.
 * A break still surfaces within a couple of days, as its last result ages out.
 */
const DEFAULT_DAYS = 7;

interface RedisEntry {
	status?: "pass" | "fail";
	citations?: number;
	genuineWebQueries?: number;
	queriesInRawOutput?: boolean;
}

/** Keyed back to their target, since the dump encodes one as a filename. */
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

/** Entries predating these fields are dropped — defaulting them would invent violations. */
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
 * Targets we get nothing from and can't yet say why. Not failures, but the
 * backlog — so they stay visible rather than passing silently.
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

	// A provider carrying searches we never read is invisible from our output alone.
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
