/**
 * Background jobs that belong to a brand: the onboarding analysis and prompt
 * suggestions. The web app enqueues one, then polls the latest job *by brand*
 * — the caller has already proved access to the brand, so a job's output never
 * reaches anyone outside the org that requested it.
 *
 * Reads go straight at pg-boss's `pgboss.job` table rather than `getJobById`
 * because the client polls by brand, not by an opaque job id it would have to
 * round-trip. The columns used (`name`, `data`, `state`, `output`,
 * `created_on`) are stable across the pinned pg-boss v12 line.
 */

import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import { getBoss } from "@/lib/boss-client";

export const IN_FLIGHT_STATES = new Set(["created", "active", "retry"]);

export interface BrandJob {
	id: string;
	state: string;
	data: Record<string, unknown> | null;
	output: unknown;
}

export type BrandJobStatus<T> =
	| { status: "pending" }
	| { status: "done"; output: T }
	| { status: "failed"; error: string };

/** The most recent job on `queue` for a brand, regardless of state. */
export async function latestBrandJob(queue: string, brandId: string): Promise<BrandJob | undefined> {
	const result = await db.execute(sql`
		SELECT id, state, data, output
		FROM pgboss.job
		WHERE name = ${queue} AND data->>'brandId' = ${brandId}
		ORDER BY created_on DESC
		LIMIT 1
	`);
	return result.rows[0] as unknown as BrandJob | undefined;
}

/**
 * Where the brand's latest job on `queue` stands. `failureMessage` is what the
 * browser sees when it fails: the worker's real error is already in Sentry and
 * may carry provider details we don't forward.
 */
export async function readBrandJob<T>(
	queue: string,
	brandId: string,
	failureMessage: string,
): Promise<BrandJobStatus<T>> {
	const job = await latestBrandJob(queue, brandId);

	// No job yet — the enqueue may not be visible, or the worker hasn't picked
	// it up. Either way the client should keep polling.
	if (!job) return { status: "pending" };
	if (job.state === "completed") return { status: "done", output: job.output as T };
	if (job.state === "failed" || job.state === "cancelled") {
		console.error(`[${queue}] job ended without a result`, { brandId, jobId: job.id, state: job.state });
		return { status: "failed", error: failureMessage };
	}
	return { status: "pending" };
}

/** Best-effort cancel, so the worker doesn't keep going on a result nobody is waiting for. */
export async function cancelLatestBrandJob(queue: string, brandId: string): Promise<void> {
	const job = await latestBrandJob(queue, brandId);
	if (!job || !IN_FLIGHT_STATES.has(job.state)) return;
	const boss = await getBoss();
	try {
		await boss.cancel(queue, job.id);
	} catch {
		// It may have finished between the read and the cancel.
	}
}
