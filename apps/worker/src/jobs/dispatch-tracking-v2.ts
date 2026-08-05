import {
	CLOUD_TRACKING_DISPATCH_QUEUE,
	CLOUD_TRACKING_POLICY_SNAPSHOT_VERSION,
	CLOUD_TRACKING_TASK_QUEUE,
	nextFutureDueAt,
	stableTrackingId,
	type TrackingPolicySnapshot,
} from "@workspace/lib/cloud/tracking-policy";
import { db } from "@workspace/lib/db/db";
import { trackingOccurrences, trackingSchedules, trackingTasks } from "@workspace/lib/db/schema";
import { getTrackingTargetKey, parseScrapeTargets } from "@workspace/lib/providers";
import { sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";

export interface DispatchTrackingV2Data {
	source: "scheduled" | "manual";
}

interface DueScheduleRow {
	schedule_id: string;
	brand_id: string;
	prompt_id: string;
	target_key: string;
	cadence_minutes: number;
	samples_per_occurrence: number;
	next_due_at: Date;
	generation: number;
	policy_version: number;
	organization_id: string;
	assignment_source: "brand_selection" | "premium" | "custom";
}

const MATERIALIZE_BATCH_SIZE = 200;
const ENQUEUE_BATCH_SIZE = 500;

async function materializeDueSchedules(now: Date): Promise<number> {
	const configs = new Map(
		parseScrapeTargets(process.env.SCRAPE_TARGETS).map((config) => [getTrackingTargetKey(config), config]),
	);

	return db.transaction(async (tx) => {
		const result = await tx.execute(sql`
			SELECT
				s.id AS schedule_id,
				s.brand_id,
				s.prompt_id,
				s.target_key,
				s.cadence_minutes,
				s.samples_per_occurrence,
				s.next_due_at,
				s.generation,
				s.policy_version,
				b.organization_id,
				a.source AS assignment_source
			FROM tracking_schedules s
			JOIN brand_scheduler_rollouts r ON r.brand_id = s.brand_id
			JOIN prompt_target_assignments a ON a.id = s.prompt_target_assignment_id
			JOIN prompts p ON p.id = s.prompt_id AND p.brand_id = s.brand_id
			JOIN brands b ON b.id = s.brand_id
			LEFT JOIN brand_target_selections selection ON selection.id = a.brand_target_selection_id
			WHERE s.active = true
				AND s.next_due_at <= ${now}
				AND r.mode = 'v2'
				AND r.generation = s.generation
				AND a.enabled = true
				AND (a.source <> 'brand_selection' OR selection.enabled = true)
				AND p.enabled = true
				AND b.enabled = true
			ORDER BY s.next_due_at, s.id
			FOR UPDATE OF s SKIP LOCKED
			LIMIT ${MATERIALIZE_BATCH_SIZE}
		`);

		let materialized = 0;
		for (const row of result.rows as unknown as DueScheduleRow[]) {
			const config = configs.get(row.target_key);
			if (!config) {
				console.error(`[tracking-v2] schedule ${row.schedule_id} references unknown target ${row.target_key}`);
				continue;
			}

			const dueAt = new Date(row.next_due_at);
			const occurrenceId = stableTrackingId("occurrence", row.schedule_id, dueAt.toISOString());
			const snapshot: TrackingPolicySnapshot = {
				version: CLOUD_TRACKING_POLICY_SNAPSHOT_VERSION,
				organizationId: row.organization_id,
				targetKey: row.target_key,
				provider: config.provider,
				model: config.model,
				...(config.version ? { modelVersion: config.version } : {}),
				webSearchEnabled: config.webSearch,
				cadenceMinutes: row.cadence_minutes,
				samplesPerOccurrence: row.samples_per_occurrence,
				assignmentSource: row.assignment_source,
			};

			await tx
				.insert(trackingOccurrences)
				.values({
					id: occurrenceId,
					brandId: row.brand_id,
					promptId: row.prompt_id,
					targetKey: row.target_key,
					scheduleId: row.schedule_id,
					dueAt,
					generation: row.generation,
					policyVersion: row.policy_version,
					policySnapshot: { ...snapshot },
					expectedTaskCount: row.samples_per_occurrence,
				})
				.onConflictDoNothing({ target: [trackingOccurrences.scheduleId, trackingOccurrences.dueAt] });

			for (let sampleIndex = 0; sampleIndex < row.samples_per_occurrence; sampleIndex++) {
				await tx
					.insert(trackingTasks)
					.values({
						id: stableTrackingId("task", occurrenceId, sampleIndex),
						brandId: row.brand_id,
						promptId: row.prompt_id,
						occurrenceId,
						sampleIndex,
						targetKey: row.target_key,
						availableAt: dueAt,
					})
					.onConflictDoNothing({ target: [trackingTasks.occurrenceId, trackingTasks.sampleIndex] });
			}

			await tx
				.update(trackingSchedules)
				.set({
					nextDueAt: nextFutureDueAt(dueAt, row.cadence_minutes, now),
					lastMaterializedAt: now,
				})
				.where(sql`${trackingSchedules.id} = ${row.schedule_id}`);
			materialized++;
		}
		return materialized;
	});
}

async function enqueuePendingTasks(): Promise<number> {
	// A policy edit fences already-materialized work. Persist the cancellation so
	// stale pending rows cannot remain in the outbox forever.
	await db.execute(sql`
		WITH stale AS (
			UPDATE tracking_tasks task
			SET status = 'canceled', last_error = 'Schedule policy changed before enqueue', completed_at = now(), updated_at = now()
			FROM tracking_occurrences occurrence
			JOIN tracking_schedules schedule ON schedule.id = occurrence.schedule_id
			WHERE task.occurrence_id = occurrence.id
				AND task.status = 'pending'
				AND (
					schedule.active = false
					OR schedule.generation <> occurrence.generation
					OR schedule.policy_version <> occurrence.policy_version
					OR NOT EXISTS (
						SELECT 1 FROM brand_scheduler_rollouts rollout
						WHERE rollout.brand_id = task.brand_id
							AND rollout.mode = 'v2'
							AND rollout.generation = occurrence.generation
					)
				)
			RETURNING task.occurrence_id
		)
		UPDATE tracking_occurrences occurrence
		SET status = 'canceled', completed_at = now(), updated_at = now()
		WHERE occurrence.id IN (SELECT occurrence_id FROM stale)
			AND NOT EXISTS (
				SELECT 1 FROM tracking_tasks task
				WHERE task.occurrence_id = occurrence.id AND task.status <> 'canceled'
			)
	`);

	const result = await db.execute(sql`
		SELECT t.id, t.occurrence_id
		FROM tracking_tasks t
		JOIN tracking_occurrences o ON o.id = t.occurrence_id
		JOIN tracking_schedules s ON s.id = o.schedule_id
		JOIN brand_scheduler_rollouts r ON r.brand_id = t.brand_id
		WHERE t.status = 'pending'
			AND t.available_at <= now()
			AND r.mode = 'v2'
			AND r.generation = o.generation
			AND s.generation = o.generation
			AND s.policy_version = o.policy_version
		ORDER BY t.available_at, t.id
		LIMIT ${ENQUEUE_BATCH_SIZE}
	`);

	let enqueued = 0;
	for (const row of result.rows as Array<{ id: string; occurrence_id: string }>) {
		// The pg-boss job id is the durable tracking task id. A dispatcher crash
		// between send and projection update can retry without creating a second job.
		await boss.send(CLOUD_TRACKING_TASK_QUEUE, { version: 2, taskId: row.id } satisfies ProcessTrackingTaskV2Data, {
			id: row.id,
		});
		await db.transaction(async (tx) => {
			await tx.execute(sql`
				UPDATE tracking_tasks
				SET status = 'enqueued', queue_name = ${CLOUD_TRACKING_TASK_QUEUE}, pg_boss_job_id = ${row.id}, updated_at = now()
				WHERE id = ${row.id} AND status = 'pending'
			`);
			await tx.execute(sql`
				UPDATE tracking_occurrences
				SET status = 'enqueued', updated_at = now()
				WHERE id = ${row.occurrence_id} AND status = 'pending'
			`);
		});
		enqueued++;
	}
	return enqueued;
}

// Kept here to make the outbox payload contract visible without importing the
// executor (which would create a job-module cycle).
interface ProcessTrackingTaskV2Data {
	version: 2;
	taskId: string;
}

export async function dispatchTrackingV2Job(_jobs: Job<DispatchTrackingV2Data>[]): Promise<void> {
	if (process.env.DEPLOYMENT_MODE !== "cloud") return;
	const now = new Date();
	const materialized = await materializeDueSchedules(now);
	const enqueued = await enqueuePendingTasks();
	if (materialized > 0 || enqueued > 0) {
		console.log(`[tracking-v2] materialized ${materialized} occurrence(s), enqueued ${enqueued} task(s)`);
	}
}

export { CLOUD_TRACKING_DISPATCH_QUEUE };
