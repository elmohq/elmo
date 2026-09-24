/**
 * The web app never generates a report: it serves the stored one and, once that
 * is stale, enqueues the worker's generate-opportunities job. The queue's
 * `exclusive` policy keyed by brand keeps it to one queued-or-running job per
 * brand, however many callers ask.
 */
import { db } from "@workspace/lib/db/db";
import {
	isReportFresh,
	latestOpportunitiesReport,
	type OpportunitiesReport,
	withoutRepeats,
} from "@workspace/lib/opportunities";
import { sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

const GENERATE_OPPORTUNITIES_QUEUE = "generate-opportunities";

/** How long a finished job's outcome stands before a page load may enqueue another. */
const RETRY_AFTER_MS = 60 * 60 * 1000;

export interface OpportunitiesResponse {
	report: OpportunitiesReport | null;
	reason: "insufficient-data" | "not-generated" | "generating" | null;
	lastEvaluatedAt: string | null;
	model: string | null;
}

type StoredReport = NonNullable<Awaited<ReturnType<typeof latestOpportunitiesReport>>>;

function serveStored(stored: StoredReport): OpportunitiesResponse {
	return {
		report: withoutRepeats(stored.report as OpportunitiesReport),
		reason: null,
		lastEvaluatedAt: stored.createdAt.toISOString(),
		model: stored.model,
	};
}

const nothingStored = (reason: OpportunitiesResponse["reason"]): OpportunitiesResponse => ({
	report: null,
	reason,
	lastEvaluatedAt: null,
	model: null,
});

interface JobRow {
	state: string;
	created_on: Date;
}

async function latestJob(brandId: string): Promise<JobRow | undefined> {
	const result = await db.execute(sql`
		SELECT state, created_on
		FROM pgboss.job
		WHERE name = ${GENERATE_OPPORTUNITIES_QUEUE} AND singleton_key = ${brandId}
		ORDER BY created_on DESC
		LIMIT 1
	`);
	return result.rows[0] as unknown as JobRow | undefined;
}

const IN_FLIGHT_STATES = new Set(["created", "active", "retry"]);

/** Never enqueues, so it's safe behind read-only surfaces (public API, MCP). */
export async function storedOpportunities(brandId: string): Promise<OpportunitiesResponse> {
	const latest = await latestOpportunitiesReport(brandId);
	return latest ? serveStored(latest) : nothingStored("not-generated");
}

export async function resolveOpportunities(brandId: string, timezone = "UTC"): Promise<OpportunitiesResponse> {
	const latest = await latestOpportunitiesReport(brandId);
	if (latest && isReportFresh(latest)) return serveStored(latest);

	const job = await latestJob(brandId);
	const settled =
		job && !IN_FLIGHT_STATES.has(job.state) && Date.now() - new Date(job.created_on).getTime() < RETRY_AFTER_MS
			? job
			: null;
	if (!settled) {
		const boss = await getBoss();
		await boss.send(GENERATE_OPPORTUNITIES_QUEUE, { brandId, timezone }, { singletonKey: brandId });
	}

	if (latest) return serveStored(latest);
	if (!settled) return nothingStored("generating");
	// A completed job that left no report is one that found too little to write about.
	if (settled.state === "completed") return nothingStored("insufficient-data");
	throw new Error("Failed to generate an opportunities report");
}
