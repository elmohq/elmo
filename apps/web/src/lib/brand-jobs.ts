/**
 * The web app enqueues the work and then polls the job's result *by brand* —
 * the brand id is the org id, so callers prove access to the brand and we
 * never hand a job's output to someone outside that org.
 *
 * Reading the result goes straight at pg-boss's `pgboss.job` table rather than
 * `getJobById`, because the client polls by brand (not by an opaque job id it
 * has to round-trip). The columns used here (`name`, `data`, `state`,
 * `output`, `created_on`) are stable across the pinned pg-boss v12 line.
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
 * `failureMessage` is shown to the user when a job ends in a failed/cancelled
 * state. The real error (provider messages, stack traces) is already captured
 * server-side by the worker's Sentry wrapper; we never forward it to the browser.
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

export async function cancelLatestBrandJob(queue: string, brandId: string): Promise<void> {
	const job = await latestBrandJob(queue, brandId);
	if (!job || !IN_FLIGHT_STATES.has(job.state)) return;
	const boss = await getBoss();
	try {
		await boss.cancel(queue, job.id);
	} catch {
		// Job may have completed between the read and the cancel — nothing to do.
	}
}
