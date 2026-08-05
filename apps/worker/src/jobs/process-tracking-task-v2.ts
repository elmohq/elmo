import {
	createOrganizationBillingSnapshotStore,
	resolveOrganizationEntitlements,
} from "@workspace/lib/cloud/entitlements";
import {
	isTrackingPolicySnapshot,
	resolveRuntimeTrackingPolicy,
	type TrackingPolicySnapshot,
	utcDayWindow,
} from "@workspace/lib/cloud/tracking-policy";
import { db } from "@workspace/lib/db/db";
import { trackingProviderAttempts } from "@workspace/lib/db/schema";
import { getProvider, type ModelConfig } from "@workspace/lib/providers";
import { sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import {
	evaluateModelIteration,
	getPromptContext,
	type ModelIterationEvaluation,
	persistModelIteration,
} from "./process-prompt";

export interface ProcessTrackingTaskV2Data {
	version: 2;
	taskId: string;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface TaskRow {
	task_id: string;
	status: "pending" | "enqueued" | "running" | "succeeded" | "failed" | "canceled" | "skipped";
	attempt_count: number;
	claimed_at: Date | null;
	brand_id: string;
	prompt_id: string;
	occurrence_id: string;
	sample_index: number;
	target_key: string;
	policy_snapshot: unknown;
	organization_id: string;
	assignment_source: "brand_selection" | "premium" | "custom";
}

interface ReservedTask {
	taskId: string;
	brandId: string;
	promptId: string;
	occurrenceId: string;
	sampleIndex: number;
	attemptId: string;
	usageBucketId: string;
	usageUnits: number;
	snapshot: TrackingPolicySnapshot;
}

// Matches the queue's 15-minute expiry so the first pg-boss retry can recover
// a worker that died after reserving budget but before recording completion.
const STALE_CLAIM_MS = 15 * 60 * 1000;

function errorMessage(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
}

async function refreshOccurrence(tx: DbTransaction, occurrenceId: string): Promise<void> {
	await tx.execute(sql`
		WITH task_summary AS (
			SELECT
				count(*)::int AS total,
				count(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
				count(*) FILTER (WHERE status = 'failed')::int AS failed,
				count(*) FILTER (WHERE status = 'canceled')::int AS canceled,
				count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
				count(*) FILTER (WHERE status = 'running')::int AS running,
				count(*) FILTER (WHERE status IN ('pending', 'enqueued'))::int AS waiting
			FROM tracking_tasks
			WHERE occurrence_id = ${occurrenceId}
		), resolved AS (
			SELECT CASE
				WHEN running > 0 THEN 'running'::tracking_occurrence_status
				WHEN waiting > 0 THEN 'enqueued'::tracking_occurrence_status
				WHEN succeeded = total THEN 'succeeded'::tracking_occurrence_status
				WHEN succeeded > 0 THEN 'partial'::tracking_occurrence_status
				WHEN failed > 0 THEN 'failed'::tracking_occurrence_status
				WHEN canceled = total THEN 'canceled'::tracking_occurrence_status
				ELSE 'skipped'::tracking_occurrence_status
			END AS status
			FROM task_summary
		)
		UPDATE tracking_occurrences occurrence
		SET
			status = resolved.status,
			started_at = CASE WHEN resolved.status = 'running' THEN coalesce(occurrence.started_at, now()) ELSE occurrence.started_at END,
			completed_at = CASE WHEN resolved.status IN ('succeeded', 'partial', 'failed', 'canceled', 'skipped') THEN now() ELSE NULL END,
			updated_at = now()
		FROM resolved
		WHERE occurrence.id = ${occurrenceId}
	`);
}

async function finishWithoutProvider(
	tx: DbTransaction,
	taskId: string,
	occurrenceId: string,
	status: "canceled" | "skipped",
	reason: string,
): Promise<void> {
	await tx.execute(sql`
		UPDATE tracking_tasks
		SET status = ${status}::tracking_task_status, last_error = ${reason}, completed_at = now(), updated_at = now()
		WHERE id = ${taskId} AND status NOT IN ('succeeded', 'canceled', 'skipped')
	`);
	await refreshOccurrence(tx, occurrenceId);
}

async function reserveTask(taskId: string, now: Date): Promise<ReservedTask | null> {
	return db.transaction(async (tx) => {
		const result = await tx.execute(sql`
			SELECT
				t.id AS task_id,
				t.status,
				t.attempt_count,
				t.claimed_at,
				t.brand_id,
				t.prompt_id,
				t.occurrence_id,
				t.sample_index,
				t.target_key,
				o.policy_snapshot,
				b.organization_id,
				a.source AS assignment_source
			FROM tracking_tasks t
			JOIN tracking_occurrences o ON o.id = t.occurrence_id
			JOIN tracking_schedules s ON s.id = o.schedule_id
			JOIN prompt_target_assignments a ON a.id = s.prompt_target_assignment_id
			JOIN brand_scheduler_rollouts r ON r.brand_id = t.brand_id
			JOIN prompts p ON p.id = t.prompt_id AND p.brand_id = t.brand_id
			JOIN brands b ON b.id = t.brand_id
			LEFT JOIN brand_target_selections selection ON selection.id = a.brand_target_selection_id
			WHERE t.id = ${taskId}
				AND s.active = true
				AND a.enabled = true
				AND (a.source <> 'brand_selection' OR selection.enabled = true)
				AND p.enabled = true
				AND b.enabled = true
				AND r.mode = 'v2'
				AND r.generation = o.generation
				AND s.generation = o.generation
				AND s.policy_version = o.policy_version
			FOR UPDATE OF t
		`);
		const row = result.rows[0] as unknown as TaskRow | undefined;
		if (!row) {
			const occurrence = await tx.execute(sql`
				SELECT
					t.occurrence_id,
					(
						s.active = false OR s.generation <> o.generation OR s.policy_version <> o.policy_version
						OR r.mode IS DISTINCT FROM 'v2'::scheduler_rollout_mode OR r.generation IS DISTINCT FROM o.generation
					) AS stale_policy
				FROM tracking_tasks t
				JOIN tracking_occurrences o ON o.id = t.occurrence_id
				JOIN tracking_schedules s ON s.id = o.schedule_id
				LEFT JOIN brand_scheduler_rollouts r ON r.brand_id = t.brand_id
				WHERE t.id = ${taskId}
			`);
			const state = occurrence.rows[0] as { occurrence_id: string; stale_policy: boolean } | undefined;
			if (state) {
				await finishWithoutProvider(
					tx,
					taskId,
					state.occurrence_id,
					state.stale_policy ? "canceled" : "skipped",
					state.stale_policy ? "Schedule policy changed before execution" : "Task is no longer eligible",
				);
			}
			return null;
		}

		if (["succeeded", "canceled", "skipped"].includes(row.status)) return null;
		if (
			row.status === "running" &&
			row.claimed_at &&
			now.getTime() - new Date(row.claimed_at).getTime() < STALE_CLAIM_MS
		) {
			return null;
		}
		if (row.status === "running") {
			await tx.execute(sql`
				UPDATE tracking_provider_attempts
				SET
					status = 'failed', error_code = 'stale-worker-claim',
					error_message = 'Worker claim expired before task completion', completed_at = now(), updated_at = now()
				WHERE task_id = ${taskId} AND status IN ('reserved', 'started')
			`);
		}
		if (!isTrackingPolicySnapshot(row.policy_snapshot)) {
			await finishWithoutProvider(
				tx,
				taskId,
				row.occurrence_id,
				"skipped",
				"Occurrence has an invalid policy snapshot",
			);
			return null;
		}
		const snapshot = row.policy_snapshot;
		if (
			snapshot.organizationId !== row.organization_id ||
			snapshot.targetKey !== row.target_key ||
			snapshot.assignmentSource !== row.assignment_source
		) {
			await finishWithoutProvider(
				tx,
				taskId,
				row.occurrence_id,
				"skipped",
				"Occurrence policy identity does not match current assignment",
			);
			return null;
		}

		const resolved = await resolveOrganizationEntitlements({
			mode: "cloud",
			organizationId: row.organization_id,
			now,
			store: createOrganizationBillingSnapshotStore(tx),
		});
		const runtimePolicy = resolveRuntimeTrackingPolicy({
			resolved,
			assignmentSource: snapshot.assignmentSource,
			targetKey: snapshot.targetKey,
			cadenceMinutes: snapshot.cadenceMinutes,
			samplesPerOccurrence: snapshot.samplesPerOccurrence,
		});
		if (!runtimePolicy) {
			await finishWithoutProvider(
				tx,
				taskId,
				row.occurrence_id,
				"skipped",
				"Current entitlements no longer permit this occurrence",
			);
			return null;
		}

		const { periodStart, periodEnd } = utcDayWindow(now);
		const bucketResult = await tx.execute(sql`
			WITH upserted AS (
				INSERT INTO tracking_usage_buckets (
					organization_id, usage_class, quota_key, period_start, period_end, limit_units, used_units
				) VALUES (
					${row.organization_id}, ${runtimePolicy.usageClass}::tracking_usage_class, ${runtimePolicy.quotaKey},
					${periodStart}, ${periodEnd}, ${runtimePolicy.limitUnits}, 0
				)
				ON CONFLICT (organization_id, usage_class, quota_key, period_start)
				DO UPDATE SET
					limit_units = greatest(tracking_usage_buckets.used_units, excluded.limit_units),
					period_end = excluded.period_end,
					updated_at = now()
				RETURNING id
			)
			UPDATE tracking_usage_buckets bucket
			SET used_units = bucket.used_units + 1, updated_at = now()
			FROM upserted
			WHERE bucket.id = upserted.id AND bucket.used_units + 1 <= bucket.limit_units
			RETURNING bucket.id
		`);
		const usageBucketId = (bucketResult.rows[0] as { id: string } | undefined)?.id;
		if (!usageBucketId) {
			await finishWithoutProvider(
				tx,
				taskId,
				row.occurrence_id,
				"skipped",
				`Daily ${runtimePolicy.usageClass} tracking budget exhausted`,
			);
			return null;
		}

		const attemptNumber = Number(row.attempt_count) + 1;
		const [attempt] = await tx
			.insert(trackingProviderAttempts)
			.values({
				taskId,
				organizationId: row.organization_id,
				brandId: row.brand_id,
				promptId: row.prompt_id,
				targetKey: row.target_key,
				usageClass: runtimePolicy.usageClass,
				usageBucketId,
				attemptNumber,
				provider: snapshot.provider,
				model: snapshot.model,
				modelVersion: snapshot.modelVersion,
				webSearchEnabled: snapshot.webSearchEnabled,
				usageUnits: 1,
				countsTowardLimit: true,
				quotaPeriodStart: periodStart,
				quotaPeriodEnd: periodEnd,
			})
			.returning({ id: trackingProviderAttempts.id });

		await tx.execute(sql`
			UPDATE tracking_tasks
			SET status = 'running', attempt_count = ${attemptNumber}, claimed_at = ${now}, last_error = NULL, updated_at = now()
			WHERE id = ${taskId}
		`);
		await refreshOccurrence(tx, row.occurrence_id);

		return {
			taskId,
			brandId: row.brand_id,
			promptId: row.prompt_id,
			occurrenceId: row.occurrence_id,
			sampleIndex: Number(row.sample_index),
			attemptId: attempt.id,
			usageBucketId,
			usageUnits: 1,
			snapshot,
		};
	});
}

async function cancelBeforeProviderCall(reserved: ReservedTask, reason: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`
			WITH canceled AS (
				UPDATE tracking_provider_attempts
				SET
					status = 'canceled', counts_toward_limit = false, usage_units = 0,
					usage_bucket_id = NULL, quota_period_start = NULL, quota_period_end = NULL,
					error_message = ${reason}, completed_at = now(), updated_at = now()
				WHERE id = ${reserved.attemptId} AND status = 'reserved'
				RETURNING 1
			)
			UPDATE tracking_usage_buckets
			SET used_units = greatest(0, used_units - ${reserved.usageUnits}), updated_at = now()
			WHERE id = ${reserved.usageBucketId} AND EXISTS (SELECT 1 FROM canceled)
		`);
		await tx.execute(sql`
			UPDATE tracking_tasks
			SET status = 'skipped', last_error = ${reason}, completed_at = now(), updated_at = now()
			WHERE id = ${reserved.taskId}
		`);
		await refreshOccurrence(tx, reserved.occurrenceId);
	});
}

async function startProviderAttempt(reserved: ReservedTask): Promise<boolean> {
	return db.transaction(async (tx) => {
		const eligibility = await tx.execute(sql`
			SELECT 1
			FROM tracking_tasks t
			JOIN tracking_occurrences o ON o.id = t.occurrence_id
			JOIN tracking_schedules s ON s.id = o.schedule_id
			JOIN prompt_target_assignments a ON a.id = s.prompt_target_assignment_id
			JOIN brand_scheduler_rollouts r ON r.brand_id = t.brand_id
			JOIN prompts p ON p.id = t.prompt_id AND p.brand_id = t.brand_id
			JOIN brands b ON b.id = t.brand_id
			LEFT JOIN brand_target_selections selection ON selection.id = a.brand_target_selection_id
			WHERE t.id = ${reserved.taskId}
				AND t.status = 'running'
				AND s.active = true
				AND a.enabled = true
				AND (a.source <> 'brand_selection' OR selection.enabled = true)
				AND p.enabled = true
				AND b.enabled = true
				AND r.mode = 'v2'
				AND r.generation = o.generation
				AND s.generation = o.generation
				AND s.policy_version = o.policy_version
		`);
		if (eligibility.rows.length === 0) return false;
		const started = await tx.execute(sql`
			UPDATE tracking_provider_attempts
			SET status = 'started', started_at = now(), updated_at = now()
			WHERE id = ${reserved.attemptId} AND status = 'reserved'
			RETURNING id
		`);
		return started.rows.length === 1;
	});
}

async function completeTask(reserved: ReservedTask, evaluation: ModelIterationEvaluation): Promise<void> {
	await db.transaction(async (tx) => {
		// The task id is also the prompt-run id. Persistence and task completion
		// commit atomically, so a retry can never create a second successful result.
		const { promptRunId } = await persistModelIteration(evaluation, tx, reserved.taskId);
		await tx.execute(sql`
			UPDATE tracking_provider_attempts
			SET status = 'succeeded', prompt_run_id = ${promptRunId}, completed_at = now(), updated_at = now()
			WHERE id = ${reserved.attemptId} AND status = 'started'
		`);
		await tx.execute(sql`
			UPDATE tracking_tasks
			SET status = 'succeeded', prompt_run_id = ${promptRunId}, completed_at = now(), last_error = NULL, updated_at = now()
			WHERE id = ${reserved.taskId}
		`);
		await refreshOccurrence(tx, reserved.occurrenceId);
	});
}

async function failTask(reserved: ReservedTask, error: unknown): Promise<void> {
	const message = errorMessage(error);
	await db.transaction(async (tx) => {
		await tx.execute(sql`
			UPDATE tracking_provider_attempts
			SET status = 'failed', error_message = ${message}, completed_at = now(), updated_at = now()
			WHERE id = ${reserved.attemptId} AND status IN ('reserved', 'started')
		`);
		await tx.execute(sql`
			UPDATE tracking_tasks
			SET status = 'failed', last_error = ${message}, completed_at = now(), updated_at = now()
			WHERE id = ${reserved.taskId}
		`);
		await refreshOccurrence(tx, reserved.occurrenceId);
	});
}

export async function processTrackingTaskV2Job(jobs: Job<ProcessTrackingTaskV2Data>[]): Promise<void> {
	if (process.env.DEPLOYMENT_MODE !== "cloud") return;
	for (const job of jobs) {
		if (job.data.version !== 2) throw new Error(`Unsupported tracking task payload version: ${job.data.version}`);
		const reserved = await reserveTask(job.data.taskId, new Date());
		if (!reserved) continue;

		const context = await getPromptContext(reserved.promptId);
		if (!context?.prompt.enabled || !context.brand.enabled || context.brand.id !== reserved.brandId) {
			await cancelBeforeProviderCall(reserved, "Prompt or brand became ineligible before provider dispatch");
			continue;
		}
		if (!(await startProviderAttempt(reserved))) {
			await cancelBeforeProviderCall(reserved, "Assignment became ineligible before provider dispatch");
			continue;
		}

		const config: ModelConfig = {
			targetKey: reserved.snapshot.targetKey,
			model: reserved.snapshot.model,
			provider: reserved.snapshot.provider,
			version: reserved.snapshot.modelVersion,
			webSearch: reserved.snapshot.webSearchEnabled,
		};
		try {
			const providerImpl = getProvider(config.provider);
			const evaluation = await evaluateModelIteration({
				promptId: reserved.promptId,
				promptValue: context.prompt.value,
				brand: context.brand,
				competitorsList: context.competitors,
				config,
				providerImpl,
				runIndex: reserved.sampleIndex + 1,
			});
			await completeTask(reserved, evaluation);
		} catch (error) {
			await failTask(reserved, error);
			throw error;
		}
	}
}
