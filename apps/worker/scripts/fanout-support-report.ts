#!/usr/bin/env tsx

/**
 * Compares the fan-out support table against what the scheduled provider tests
 * recorded in Upstash, and suggests a status for every web-search target.
 *
 * Usage:
 *   pnpm tsx --env-file=apps/www/.env apps/worker/scripts/fanout-support-report.ts
 */

import { getFanoutSupport } from "@workspace/config/fanout-support";
import { parseScrapeTargets, STATUS_TARGETS } from "@workspace/config/scrape-targets";

interface StatusEntry {
	ts: string;
	status: "pass" | "fail";
	webQueries?: number;
	realWebQueries?: number;
}

const QUIET_DAYS = 7;
const QUIET_PASSES = 10;

async function entries(target: string): Promise<StatusEntry[]> {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
	const res = await fetch(`${url}/zrange/${encodeURIComponent(`provider-status:${target}`)}/0/-1`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const { result } = (await res.json()) as { result: string[] };
	return result.map((item) => JSON.parse(item));
}

// Older entries only carry `webQueries`, where the "unavailable" placeholder
// counts as one, so only a count above one proves real queries.
function realQueries(entry: StatusEntry): number | null {
	if (entry.realWebQueries !== undefined) return entry.realWebQueries;
	return (entry.webQueries ?? 0) > 1 ? entry.webQueries! : null;
}

function suggest(history: StatusEntry[]): string {
	const passed = history.filter((e) => e.status === "pass");
	const real = passed.filter((e) => (realQueries(e) ?? 0) > 0);
	const exact = passed.filter((e) => e.realWebQueries !== undefined);
	if (real.length === 0) return exact.length > 0 ? "never" : "unknown";
	const last = real[real.length - 1].ts;
	const quietDays = (Date.now() - new Date(last).getTime()) / 86_400_000;
	if (quietDays < QUIET_DAYS) return "supported";
	// A target whose test keeps failing hasn't shown it stopped returning queries.
	const passesSince = passed.filter((e) => e.ts > last).length;
	return passesSince >= QUIET_PASSES ? `discontinued ${last.slice(0, 10)}` : "unknown";
}

async function main() {
	const targets = parseScrapeTargets(STATUS_TARGETS.join(",")).filter((t) => t.webSearch);
	const rows = await Promise.all(
		targets.map(async (config) => {
			const target = `${config.model}:${config.provider}${config.version ? `:${config.version}` : ""}:online`;
			const history = await entries(target);
			const configured = getFanoutSupport(config);
			const current = configured.status === "discontinued" ? `discontinued ${configured.since}` : configured.status;
			return { target, runs: history.length, current, suggested: suggest(history) };
		}),
	);
	for (const row of rows) {
		const flag = row.current === row.suggested || row.suggested === "unknown" ? " " : "!";
		console.log(
			`${flag} ${row.target.padEnd(52)} ${String(row.runs).padStart(4)} runs  table: ${row.current.padEnd(24)} tests: ${row.suggested}`,
		);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
