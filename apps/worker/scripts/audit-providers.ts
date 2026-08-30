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
 */

import { Redis } from "@upstash/redis";
import { STATUS_TARGET_EXPECTATIONS, STATUS_TARGETS } from "@workspace/config/scrape-targets";
import {
	AUDIT_MIN_RUNS,
	type AuditInput,
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

function parseDays(): number {
	const index = process.argv.indexOf("--days");
	if (index === -1) return DEFAULT_DAYS;
	const days = Number(process.argv[index + 1]);
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
	report(violations, STATUS_TARGETS.length, days);
	process.exit(violations.length > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
