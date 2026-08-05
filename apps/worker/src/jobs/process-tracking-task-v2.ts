import { getProviderCostEstimate, parseProviderCostEstimates } from "@workspace/config/provider-costs";
import {
	createOrganizationEntitlementSourceStore,
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
import { withProviderStartEntitlementFence } from "./provider-start-fence";
import { getAttemptRecoveryDisposition, type ProviderAttemptState } from "./tracking-attempt-state";

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
	organizationId: string;
	brandId: string;
	promptId: string;
	occurrenceId: string;
	sampleIndex: number;
	attemptId: string;
	attemptNumber: number;
	usageBucketId: string;
	usageUnits: number;
	snapshot: TrackingPolicySnapshot;
}

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
		if (row.status === "running") {
			const currentAttemptResult = await tx.execute(sql`
				SELECT id, status, usage_bucket_id, usage_units, counts_toward_limit
				FROM tracking_provider_attempts
				WHERE task_id = ${taskId} AND attempt_number = ${Number(row.attempt_count)}
				FOR UPDATE
			`);
			const currentAttempt = currentAttemptResult.rows[0] as
				| {
						id: string;
						status: ProviderAttemptState;
						usage_bucket_id: string | null;
						usage_units: number;
						counts_toward_limit: boolean;
				  }
				| undefined;
			if (!currentAttempt) throw new Error(`Running tracking task ${taskId} has no current provider attempt`);
			const claimExpired = !row.claimed_at || now.getTime() - new Date(row.claimed_at).getTime() >= STALE_CLAIM_MS;
			const disposition = getAttemptRecoveryDisposition(currentAttempt.status, claimExpired);
			if (disposition === "retry-later") {
				throw new Error(`Tracking task ${taskId} still has an active worker claim`);
			}
			if (disposition === "terminal") {
				throw new Error(
					`Running tracking task ${taskId} points at terminal attempt ${row.attempt_count} (${currentAttempt.status})`,
				);
			}
			if (disposition === "release-reservation") {
				const released = await tx.execute(sql`
					UPDATE tracking_provider_attempts
					SET
						status = 'failed', counts_toward_limit = false, usage_units = 0,
						usage_bucket_id = NULL, quota_period_start = NULL, quota_period_end = NULL,
						cost_microusd = NULL,
						error_code = 'expired-worker-claim-before-provider',
						error_message = 'Worker execution ended before provider dispatch',
						completed_at = now(), updated_at = now()
					WHERE id = ${currentAttempt.id} AND status = 'reserved'
					RETURNING id
				`);
				if (released.rows.length !== 1) {
					throw new Error(`Lost reserved attempt ${currentAttempt.id} while recovering task ${taskId}`);
				}
				if (currentAttempt.counts_toward_limit && currentAttempt.usage_bucket_id) {
					await tx.execute(sql`
						UPDATE tracking_usage_buckets
						SET used_units = greatest(0, used_units - ${Number(currentAttempt.usage_units)}), updated_at = now()
						WHERE id = ${currentAttempt.usage_bucket_id}
					`);
				}
			} else {
				const retained = await tx.execute(sql`
					UPDATE tracking_provider_attempts
					SET
						status = 'failed', error_code = 'expired-worker-claim-after-provider',
						error_message = 'Worker execution ended after provider dispatch may have started',
						completed_at = now(), updated_at = now()
					WHERE id = ${currentAttempt.id} AND status = 'started'
					RETURNING id
				`);
				if (retained.rows.length !== 1) {
					throw new Error(`Lost started attempt ${currentAttempt.id} while recovering task ${taskId}`);
				}
			}
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
			store: createOrganizationEntitlementSourceStore(tx),
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

		const claimed = await tx.execute(sql`
			UPDATE tracking_tasks
			SET
				status = 'running', attempt_count = ${attemptNumber}, claimed_at = ${now},
				last_error = NULL, completed_at = NULL, prompt_run_id = NULL, updated_at = now()
			WHERE id = ${taskId} AND attempt_count = ${Number(row.attempt_count)}
			RETURNING id
		`);
		if (claimed.rows.length !== 1) throw new Error(`Lost task fence while reserving attempt ${attemptNumber}`);
		await refreshOccurrence(tx, row.occurrence_id);

		return {
			taskId,
			organizationId: row.organization_id,
			brandId: row.brand_id,
			promptId: row.prompt_id,
			occurrenceId: row.occurrence_id,
			sampleIndex: Number(row.sample_index),
			attemptId: attempt.id,
			attemptNumber,
			usageBucketId,
			usageUnits: 1,
			snapshot,
		};
	});
}

async function cancelBeforeProviderCall(reserved: ReservedTask, reason: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		const canceled = await tx.execute(sql`
			UPDATE tracking_provider_attempts attempt
			SET
				status = 'canceled', counts_toward_limit = false, usage_units = 0,
				usage_bucket_id = NULL, quota_period_start = NULL, quota_period_end = NULL,
				cost_microusd = NULL,
				error_code = 'ineligible-before-provider', error_message = ${reason},
				completed_at = now(), updated_at = now()
			WHERE attempt.id = ${reserved.attemptId}
				AND attempt.task_id = ${reserved.taskId}
				AND attempt.attempt_number = ${reserved.attemptNumber}
				AND attempt.status = 'reserved'
				AND EXISTS (
					SELECT 1 FROM tracking_tasks task
					WHERE task.id = ${reserved.taskId}
						AND task.status = 'running'
						AND task.attempt_count = ${reserved.attemptNumber}
				)
			RETURNING attempt.id
		`);
		if (canceled.rows.length === 0) return false;
		await tx.execute(sql`
			UPDATE tracking_usage_buckets
			SET used_units = greatest(0, used_units - ${reserved.usageUnits}), updated_at = now()
			WHERE id = ${reserved.usageBucketId}
		`);
		const task = await tx.execute(sql`
			UPDATE tracking_tasks
			SET status = 'skipped', last_error = ${reason}, completed_at = now(), updated_at = now()
			WHERE id = ${reserved.taskId}
				AND status = 'running'
				AND attempt_count = ${reserved.attemptNumber}
			RETURNING id
		`);
		if (task.rows.length !== 1) throw new Error(`Lost task fence while canceling attempt ${reserved.attemptId}`);
		await refreshOccurrence(tx, reserved.occurrenceId);
		return true;
	});
}

async function startProviderAttempt(reserved: ReservedTask, estimatedCostMicrousd: number): Promise<boolean> {
	return db.transaction(async (tx) => {
		return withProviderStartEntitlementFence({
			tx,
			organizationId: reserved.organizationId,
			resolveCurrentEligibility: async () => {
				const resolved = await resolveOrganizationEntitlements({
					mode: "cloud",
					organizationId: reserved.organizationId,
					now: new Date(),
					store: createOrganizationEntitlementSourceStore(tx),
				});
				return (
					resolveRuntimeTrackingPolicy({
						resolved,
						assignmentSource: reserved.snapshot.assignmentSource,
						targetKey: reserved.snapshot.targetKey,
						cadenceMinutes: reserved.snapshot.cadenceMinutes,
						samplesPerOccurrence: reserved.snapshot.samplesPerOccurrence,
					}) !== null
				);
			},
			authorize: async () => {
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
				AND t.attempt_count = ${reserved.attemptNumber}
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
			UPDATE tracking_provider_attempts attempt
			SET status = 'started', cost_microusd = ${estimatedCostMicrousd}, started_at = now(), updated_at = now()
			WHERE attempt.id = ${reserved.attemptId}
				AND attempt.task_id = ${reserved.taskId}
				AND attempt.attempt_number = ${reserved.attemptNumber}
				AND attempt.status = 'reserved'
				AND EXISTS (
					SELECT 1 FROM tracking_tasks task
					WHERE task.id = ${reserved.taskId}
						AND task.status = 'running'
						AND task.attempt_count = ${reserved.attemptNumber}
				)
			RETURNING attempt.id
				`);
				return started.rows.length === 1;
			},
		});
	});
}

async function completeTask(reserved: ReservedTask, evaluation: ModelIterationEvaluation): Promise<boolean> {
	return db.transaction(async (tx) => {
		const current = await tx.execute(sql`
			SELECT attempt.id
			FROM tracking_tasks task
			JOIN tracking_provider_attempts attempt
				ON attempt.task_id = task.id
				AND attempt.id = ${reserved.attemptId}
				AND attempt.attempt_number = ${reserved.attemptNumber}
			WHERE task.id = ${reserved.taskId}
				AND task.status = 'running'
				AND task.attempt_count = ${reserved.attemptNumber}
				AND attempt.status = 'started'
			FOR UPDATE OF task, attempt
		`);
		if (current.rows.length === 0) return false;
		// The task id is also the prompt-run id. Persistence and task completion
		// commit atomically, so a retry can never create a second successful result.
		const { promptRunId } = await persistModelIteration(evaluation, tx, reserved.taskId);
		const attempt = await tx.execute(sql`
			UPDATE tracking_provider_attempts
			SET
				status = 'succeeded',
				prompt_run_id = ${promptRunId},
				provider_request_id = ${evaluation.providerCall?.providerRequestId ?? null},
				input_tokens = ${evaluation.providerCall?.inputTokens ?? null},
				output_tokens = ${evaluation.providerCall?.outputTokens ?? null},
				web_search_requests = ${evaluation.providerCall?.webSearchRequests ?? null},
				completed_at = now(),
				updated_at = now()
			WHERE id = ${reserved.attemptId}
				AND task_id = ${reserved.taskId}
				AND attempt_number = ${reserved.attemptNumber}
				AND status = 'started'
			RETURNING id
		`);
		if (attempt.rows.length !== 1) throw new Error(`Lost attempt fence while completing ${reserved.attemptId}`);
		const task = await tx.execute(sql`
			UPDATE tracking_tasks
			SET status = 'succeeded', prompt_run_id = ${promptRunId}, completed_at = now(), last_error = NULL, updated_at = now()
			WHERE id = ${reserved.taskId}
				AND status = 'running'
				AND attempt_count = ${reserved.attemptNumber}
			RETURNING id
		`);
		if (task.rows.length !== 1) throw new Error(`Lost task fence while completing attempt ${reserved.attemptId}`);
		await refreshOccurrence(tx, reserved.occurrenceId);
		return true;
	});
}

async function failTask(reserved: ReservedTask, error: unknown): Promise<boolean> {
	const message = errorMessage(error);
	return db.transaction(async (tx) => {
		const currentResult = await tx.execute(sql`
			SELECT attempt.status, attempt.usage_bucket_id, attempt.usage_units, attempt.counts_toward_limit
			FROM tracking_tasks task
			JOIN tracking_provider_attempts attempt
				ON attempt.task_id = task.id
				AND attempt.id = ${reserved.attemptId}
				AND attempt.attempt_number = ${reserved.attemptNumber}
			WHERE task.id = ${reserved.taskId}
				AND task.status = 'running'
				AND task.attempt_count = ${reserved.attemptNumber}
				AND attempt.status IN ('reserved', 'started')
			FOR UPDATE OF task, attempt
		`);
		const current = currentResult.rows[0] as
			| {
					status: "reserved" | "started";
					usage_bucket_id: string | null;
					usage_units: number;
					counts_toward_limit: boolean;
			  }
			| undefined;
		if (!current) return false;

		const definitelyNotStarted = current.status === "reserved";
		const attempt = await tx.execute(sql`
			UPDATE tracking_provider_attempts
			SET
				status = 'failed',
				counts_toward_limit = CASE WHEN ${definitelyNotStarted} THEN false ELSE counts_toward_limit END,
				usage_units = CASE WHEN ${definitelyNotStarted} THEN 0 ELSE usage_units END,
				usage_bucket_id = CASE WHEN ${definitelyNotStarted} THEN NULL ELSE usage_bucket_id END,
				quota_period_start = CASE WHEN ${definitelyNotStarted} THEN NULL ELSE quota_period_start END,
				quota_period_end = CASE WHEN ${definitelyNotStarted} THEN NULL ELSE quota_period_end END,
				cost_microusd = CASE WHEN ${definitelyNotStarted} THEN NULL ELSE cost_microusd END,
				error_code = ${definitelyNotStarted ? "pre-provider-failure" : "provider-failure"},
				error_message = ${message}, completed_at = now(), updated_at = now()
			WHERE id = ${reserved.attemptId}
				AND task_id = ${reserved.taskId}
				AND attempt_number = ${reserved.attemptNumber}
				AND status = ${current.status}::tracking_attempt_status
			RETURNING id
		`);
		if (attempt.rows.length !== 1) throw new Error(`Lost attempt fence while failing ${reserved.attemptId}`);
		if (definitelyNotStarted && current.counts_toward_limit && current.usage_bucket_id) {
			await tx.execute(sql`
				UPDATE tracking_usage_buckets
				SET used_units = greatest(0, used_units - ${Number(current.usage_units)}), updated_at = now()
				WHERE id = ${current.usage_bucket_id}
			`);
		}
		const task = await tx.execute(sql`
			UPDATE tracking_tasks
			SET status = 'failed', last_error = ${message}, completed_at = now(), updated_at = now()
			WHERE id = ${reserved.taskId}
				AND status = 'running'
				AND attempt_count = ${reserved.attemptNumber}
			RETURNING id
		`);
		if (task.rows.length !== 1) throw new Error(`Lost task fence while failing attempt ${reserved.attemptId}`);
		await refreshOccurrence(tx, reserved.occurrenceId);
		return true;
	});
}

export async function processTrackingTaskV2Job(jobs: Job<ProcessTrackingTaskV2Data>[]): Promise<void> {
	if (process.env.DEPLOYMENT_MODE !== "cloud") return;
	const costEstimates = parseProviderCostEstimates(process.env.CLOUD_TRACKING_COST_ESTIMATES);
	for (const job of jobs) {
		if (job.data.version !== 2) throw new Error(`Unsupported tracking task payload version: ${job.data.version}`);
		const reserved = await reserveTask(job.data.taskId, new Date());
		if (!reserved) continue;

		try {
			const context = await getPromptContext(reserved.promptId);
			if (!context?.prompt.enabled || !context.brand.enabled || context.brand.id !== reserved.brandId) {
				await cancelBeforeProviderCall(reserved, "Prompt or brand became ineligible before provider dispatch");
				continue;
			}

			const config: ModelConfig = {
				targetKey: reserved.snapshot.targetKey,
				model: reserved.snapshot.model,
				provider: reserved.snapshot.provider,
				version: reserved.snapshot.modelVersion,
				webSearch: reserved.snapshot.webSearchEnabled,
			};
			const providerImpl = getProvider(config.provider);
			const estimatedCostMicrousd = getProviderCostEstimate(costEstimates, reserved.snapshot.targetKey);
			if (!(await startProviderAttempt(reserved, estimatedCostMicrousd))) {
				await cancelBeforeProviderCall(reserved, "Assignment became ineligible before provider dispatch");
				continue;
			}
			const evaluation = await evaluateModelIteration({
				promptId: reserved.promptId,
				promptValue: context.prompt.value,
				brand: context.brand,
				competitorsList: context.competitors,
				config,
				providerImpl,
				runIndex: reserved.sampleIndex + 1,
				providerMaxRetries: 0,
			});
			await completeTask(reserved, evaluation);
		} catch (error) {
			try {
				await failTask(reserved, error);
			} catch (persistenceError) {
				throw new AggregateError(
					[error, persistenceError],
					`Tracking task ${reserved.taskId} failed and its attempt state could not be persisted`,
				);
			}
			throw error;
		}
	}
}
