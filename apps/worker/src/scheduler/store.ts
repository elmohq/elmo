import { randomUUID } from "node:crypto";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import {
	type PromptExecutionContextSnapshot,
	promptExecutionRuns,
	promptExecutions,
	providerCallReservations,
	providerHealth,
} from "@workspace/lib/db/schema";
import type {
	StoredProviderPayload,
	StoredProviderResult,
	StoredRawProviderResponse,
} from "@workspace/lib/provider-payload";
import { decideExistingProviderReservation } from "@workspace/lib/provider-reservation";
import type { ModelConfig } from "@workspace/lib/providers";
import {
	DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT,
	nextPromptRunAt,
	PROVIDER_FATAL_COOLDOWN_MS,
	providerCircuitKey,
	transientProviderCooldownMs,
} from "@workspace/lib/scheduler";
import { eq, sql } from "drizzle-orm";

export type ExecutionRunFailureKind =
	| "provider_transient"
	| "provider_fatal"
	| "provider_task_failed"
	| "provider_ambiguous"
	| "provider_rejected"
	| "internal_before_provider"
	| "internal_after_provider"
	| "worker_lost_unknown"
	| "execution_window_expired"
	| "prompt_disabled";

export interface ScheduleClaim {
	promptId: string;
	nextRunAt: Date;
	runRequestedAt: Date | null;
	cadenceHours: number;
	enabledModels: string[] | null;
}

export interface ExecutionRunClaim {
	id: string;
	executionId: string;
	promptId: string;
	provider: string;
	circuitKey: string;
	model: string;
	version: string | null;
	webSearchEnabled: boolean;
	runIndex: number;
	externalTaskId: string | null;
	attemptCount: number;
	phase: "provider" | "processing";
	startedAt: Date;
	context: PromptExecutionContextSnapshot;
}

export type {
	StoredProviderPayload,
	StoredProviderResult,
	StoredRawProviderResponse,
} from "@workspace/lib/provider-payload";

export interface MaterializedExecution {
	executionId: string;
	runCount: number;
	trigger: "scheduled" | "manual";
}

export type ProviderReservationAttempt<TResult = unknown> =
	| { state: "reserved"; id: string; externalTaskId: null; attemptNumber: number; attemptCount: number }
	| { state: "resumed"; id: string; externalTaskId: string; attemptNumber: number; attemptCount: number }
	| { state: "cached"; id: string; result: TResult; released: boolean; attemptNumber: number; attemptCount: number }
	| { state: "capacity" }
	| { state: "budget"; limit: number }
	| { state: "circuit"; reopenAt: Date | null }
	| { state: "busy"; id: string; retryAt: Date }
	| { state: "ambiguous"; id: string }
	| { state: "terminal"; id: string; reason: string | null }
	| { state: "conflict"; id: string; requestMetadata?: unknown };

interface ProviderHealthRow {
	circuitState: "closed" | "open" | "half_open";
	consecutiveFailures: number;
	openedAt: Date | null;
	reopenAt: Date | null;
	probeRunId: string | null;
}

const SCHEDULE_LEASE_MS = 60_000;
const RUN_LEASE_MS = 45 * 60 * 1000;
const AMBIGUOUS_CALL_QUARANTINE_MS = 24 * 60 * 60 * 1000;
const RESERVATION_LEASE_MS = 15 * 60 * 1000;
const PROVIDER_TASK_DEADLINE_MS = 24 * 60 * 60 * 1000;
const PROCESSING_RETRY_LIMIT = 5;

function asDate(value: string | Date): Date {
	return value instanceof Date ? value : new Date(value);
}

function errorText(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
}

/** Ensure desired schedule rows exist and remove intent for disabled prompts. */
export async function reconcilePromptSchedules(now = new Date()): Promise<void> {
	const defaultCadenceHours = getDefaultDelayHours();
	await db.transaction(async (tx) => {
		await tx.execute(sql`
			INSERT INTO prompt_schedules (prompt_id, next_run_at, created_at, updated_at)
			SELECT p.id,
			       ${now} + make_interval(hours => CASE
			         WHEN b.delay_override_hours > 0 THEN b.delay_override_hours
			         ELSE ${defaultCadenceHours}
			       END),
			       ${now}, ${now}
			FROM prompts p
			JOIN brands b ON b.id = p.brand_id
			WHERE p.enabled = true
			  AND b.enabled = true
			ON CONFLICT (prompt_id) DO NOTHING
		`);

		await tx.execute(sql`
			DELETE FROM prompt_schedules ps
			USING prompts p, brands b
			WHERE ps.prompt_id = p.id
			  AND b.id = p.brand_id
			  AND (p.enabled = false OR b.enabled = false)
		`);
	});
}

/** Lease one due recurring/manual intent. No paid work exists at this point. */
export async function claimDueSchedule(workerId: string, now = new Date()): Promise<ScheduleClaim | null> {
	const leaseExpiresAt = new Date(now.getTime() + SCHEDULE_LEASE_MS);
	const defaultCadenceHours = getDefaultDelayHours();
	const result = await db.execute(sql`
		WITH candidate AS (
			SELECT ps.prompt_id
			FROM prompt_schedules ps
			JOIN prompts p ON p.id = ps.prompt_id
			JOIN brands b ON b.id = p.brand_id
			WHERE p.enabled = true
			  AND b.enabled = true
			  AND (ps.next_run_at <= ${now} OR ps.run_requested_at <= ${now})
			  AND (ps.lease_expires_at IS NULL OR ps.lease_expires_at <= ${now})
			  AND (ps.admission_paused_until IS NULL OR ps.admission_paused_until <= ${now})
			  AND NOT EXISTS (
				SELECT 1
				FROM prompt_executions pe
				WHERE pe.prompt_id = ps.prompt_id
				  AND pe.status IN ('pending', 'running')
			  )
			ORDER BY LEAST(ps.next_run_at, COALESCE(ps.run_requested_at, ps.next_run_at))
			FOR UPDATE OF ps SKIP LOCKED
			LIMIT 1
		), claimed AS (
			UPDATE prompt_schedules ps
			SET lease_owner = ${workerId}, lease_expires_at = ${leaseExpiresAt}, updated_at = ${now}
			FROM candidate c
			WHERE ps.prompt_id = c.prompt_id
			RETURNING ps.prompt_id, ps.next_run_at, ps.run_requested_at
		)
		SELECT c.prompt_id, c.next_run_at, c.run_requested_at,
		       CASE
		         WHEN b.delay_override_hours > 0 THEN b.delay_override_hours
		         ELSE ${defaultCadenceHours}
		       END AS cadence_hours,
		       b.enabled_models
		FROM claimed c
		JOIN prompts p ON p.id = c.prompt_id
		JOIN brands b ON b.id = p.brand_id
	`);

	const row = result.rows[0] as
		| {
				prompt_id: string;
				next_run_at: Date | string;
				run_requested_at: Date | string | null;
				cadence_hours: number | string;
				enabled_models: string[] | null;
		  }
		| undefined;
	if (!row) return null;

	return {
		promptId: row.prompt_id,
		nextRunAt: asDate(row.next_run_at),
		runRequestedAt: row.run_requested_at ? asDate(row.run_requested_at) : null,
		cadenceHours: Number(row.cadence_hours),
		enabledModels: row.enabled_models,
	};
}

export async function releaseScheduleClaim(promptId: string, workerId: string): Promise<void> {
	await db.execute(sql`
		UPDATE prompt_schedules
		SET lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
		WHERE prompt_id = ${promptId} AND lease_owner = ${workerId}
	`);
}

/** Pause poison scheduling intent without dropping a pending manual request. */
export async function pauseScheduleAfterMaterializationError(
	promptId: string,
	workerId: string,
	error: unknown,
	now = new Date(),
): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE prompt_schedules
		SET lease_owner = NULL, lease_expires_at = NULL,
		    consecutive_failures = consecutive_failures + 1,
		    admission_paused_until = ${now} + make_interval(
		      hours => LEAST(168, 24 * power(2, LEAST(consecutive_failures, 3)))::int
		    ),
		    pause_reason = ${`Materialization failed before provider submission: ${errorText(error)}`.slice(0, 4000)},
		    updated_at = ${now}
		WHERE prompt_id = ${promptId} AND lease_owner = ${workerId}
		RETURNING prompt_id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost schedule lease while pausing prompt ${promptId}`);
}

/** Atomically create the full paid-work ledger and advance recurring intent. */
export async function materializeScheduleClaim(input: {
	claim: ScheduleClaim;
	workerId: string;
	targets: ModelConfig[];
	runsPerTarget: number;
	admittedAt?: Date;
}): Promise<MaterializedExecution | null> {
	const { claim, workerId, targets, runsPerTarget } = input;
	const admittedAt = input.admittedAt ?? new Date();
	const nextRunAt = nextPromptRunAt(admittedAt, claim.cadenceHours);
	const scheduledDue = claim.nextRunAt.getTime() <= admittedAt.getTime();
	const trigger = scheduledDue ? "scheduled" : "manual";
	const scheduledFor = scheduledDue ? claim.nextRunAt : (claim.runRequestedAt ?? admittedAt);
	const executionId = randomUUID();

	return db.transaction(async (tx) => {
		const lock = await tx.execute(sql`
			SELECT prompt_id
			FROM prompt_schedules
			WHERE prompt_id = ${claim.promptId}
			  AND lease_owner = ${workerId}
			  AND lease_expires_at > ${admittedAt}
			FOR UPDATE
		`);
		if (lock.rows.length === 0) return null;

		const contextResult = await tx.execute(sql`
			SELECT p.id AS prompt_id, p.value AS prompt_value,
			       b.id AS brand_id, b.name AS brand_name, b.website AS brand_website,
			       b.aliases AS brand_aliases, b.additional_domains AS brand_additional_domains
			FROM prompts p
			JOIN brands b ON b.id = p.brand_id
			WHERE p.id = ${claim.promptId} AND p.enabled = true AND b.enabled = true
			FOR SHARE OF p, b
		`);
		const contextRow = contextResult.rows[0] as
			| {
					prompt_id: string;
					prompt_value: string;
					brand_id: string;
					brand_name: string;
					brand_website: string;
					brand_aliases: string[];
					brand_additional_domains: string[];
			  }
			| undefined;
		if (!contextRow) {
			await tx.execute(sql`
				UPDATE prompt_schedules
				SET lease_owner = NULL, lease_expires_at = NULL, updated_at = ${admittedAt}
				WHERE prompt_id = ${claim.promptId} AND lease_owner = ${workerId}
			`);
			return null;
		}

		const competitorResult = await tx.execute(sql`
			SELECT id, name, aliases, domains
			FROM competitors
			WHERE brand_id = ${contextRow.brand_id}
			ORDER BY id
			FOR SHARE
		`);
		const context: PromptExecutionContextSnapshot = {
			prompt: { id: contextRow.prompt_id, value: contextRow.prompt_value },
			brand: {
				id: contextRow.brand_id,
				name: contextRow.brand_name,
				website: contextRow.brand_website,
				aliases: contextRow.brand_aliases,
				additionalDomains: contextRow.brand_additional_domains,
			},
			competitors: (
				competitorResult.rows as Array<{
					id: string;
					name: string;
					aliases: string[];
					domains: string[];
				}>
			).map((competitor) => ({
				id: competitor.id,
				name: competitor.name,
				aliases: competitor.aliases,
				domains: competitor.domains,
			})),
		};

		const [execution] = await tx
			.insert(promptExecutions)
			.values({
				id: executionId,
				promptId: claim.promptId,
				contextPayload: context,
				trigger,
				scheduledFor,
				notAfter: nextRunAt,
				status: targets.length === 0 ? "skipped" : "pending",
				totalRuns: targets.length * runsPerTarget,
				startedAt: admittedAt,
				completedAt: targets.length === 0 ? admittedAt : null,
			})
			.onConflictDoNothing()
			.returning({ id: promptExecutions.id });

		if (!execution) return null;

		const runRows = targets.flatMap((target, targetIndex) =>
			Array.from({ length: runsPerTarget }, (_, runIndex) => ({
				executionId,
				targetIndex,
				runIndex: runIndex + 1,
				provider: target.provider,
				circuitKey: providerCircuitKey({
					provider: target.provider,
					model: target.model,
					version: target.version,
					webSearch: target.webSearch,
				}),
				model: target.model,
				version: target.version,
				webSearchEnabled: target.webSearch,
			})),
		);
		if (runRows.length > 0) await tx.insert(promptExecutionRuns).values(runRows);

		await tx.execute(sql`
			UPDATE prompt_schedules
			SET next_run_at = CASE WHEN ${scheduledDue} THEN ${nextRunAt} ELSE next_run_at END,
			    run_requested_at = CASE
			      WHEN run_requested_at IS NOT DISTINCT FROM ${claim.runRequestedAt} THEN NULL
			      ELSE run_requested_at
			    END,
			    lease_owner = NULL,
			    lease_expires_at = NULL,
			    last_started_at = ${admittedAt},
			    last_completed_at = CASE WHEN ${runRows.length === 0} THEN ${admittedAt} ELSE last_completed_at END,
			    last_execution_status = CASE
			      WHEN ${runRows.length === 0} THEN 'skipped'::prompt_execution_status
			      ELSE last_execution_status
			    END,
			    updated_at = ${admittedAt}
			WHERE prompt_id = ${claim.promptId} AND lease_owner = ${workerId}
		`);

		return { executionId, runCount: runRows.length, trigger };
	});
}

/**
 * Claim stored-result processing first, then resumable tasks, then new paid
 * work. The advisory lock makes the provider capacity check fleet-wide.
 */
export async function claimExecutionRun(input: {
	workerId: string;
	providerMaxConcurrency: number;
	now?: Date;
}): Promise<ExecutionRunClaim | null> {
	const now = input.now ?? new Date();
	const leaseExpiresAt = new Date(now.getTime() + RUN_LEASE_MS);

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo_prompt_run_admission'))`);

		const processing = await tx.execute(sql`
			SELECT r.id
			FROM prompt_execution_runs r
			JOIN prompt_executions e ON e.id = r.execution_id
			WHERE r.status = 'processing'
			  AND (r.lease_expires_at IS NULL OR r.lease_expires_at <= ${now})
			  AND r.available_at <= ${now}
			ORDER BY e.scheduled_for, r.target_index, r.run_index
			FOR UPDATE OF r SKIP LOCKED
			LIMIT 1
		`);
		const processingId = (processing.rows[0] as { id: string } | undefined)?.id;
		if (processingId) {
			const result = await tx.execute(sql`
				UPDATE prompt_execution_runs r
				SET worker_id = ${input.workerId}, lease_expires_at = ${leaseExpiresAt},
				    processing_attempts = processing_attempts + 1, updated_at = ${now}
				FROM prompt_executions e
				WHERE r.id = ${processingId} AND e.id = r.execution_id
					RETURNING r.id, r.execution_id, e.prompt_id, r.provider, r.circuit_key, r.model, r.version,
				          r.web_search_enabled, r.run_index, r.external_task_id, r.attempt_count,
					          COALESCE(r.started_at, ${now}) AS started_at, e.context_payload
			`);
			return mapRunClaim(result.rows[0], "processing");
		}

		const resumable = await tx.execute(sql`
			SELECT r.id
			FROM prompt_execution_runs r
			JOIN prompt_executions e ON e.id = r.execution_id
			WHERE r.status = 'pending'
			  AND r.external_task_id IS NOT NULL
			  AND (r.worker_id IS NULL OR r.lease_expires_at <= ${now})
			  AND r.available_at <= ${now}
			  AND COALESCE(r.provider_submitted_at, r.started_at, r.created_at) + interval '24 hours' > ${now}
			ORDER BY e.scheduled_for, r.target_index, r.run_index
			FOR UPDATE OF r SKIP LOCKED
			LIMIT 1
		`);
		const resumableRow = resumable.rows[0] as { id: string } | undefined;
		if (resumableRow) {
			return claimProviderRun(tx, resumableRow.id, input.workerId, now, leaseExpiresAt);
		}

		const candidate = await tx.execute(sql`
			SELECT r.id, r.provider, r.circuit_key, COALESCE(h.circuit_state, 'closed') AS circuit_state
			FROM prompt_execution_runs r
			JOIN prompt_executions e ON e.id = r.execution_id
			JOIN prompts p ON p.id = e.prompt_id
			JOIN brands b ON b.id = p.brand_id
			LEFT JOIN provider_health h ON h.circuit_key = r.circuit_key
			WHERE r.status = 'pending'
			  AND r.external_task_id IS NULL
			  AND (r.worker_id IS NULL OR r.lease_expires_at <= ${now})
			  AND r.available_at <= ${now}
			  AND e.not_after > ${now}
			  AND p.enabled = true
			  AND b.enabled = true
			  AND (
			    h.circuit_key IS NULL
			    OR h.circuit_state = 'closed'
			    OR (h.circuit_state = 'open' AND h.reopen_at IS NOT NULL AND h.reopen_at <= ${now})
			  )
			  AND (
			    (SELECT COUNT(*)
			    FROM prompt_execution_runs active
			    WHERE active.provider = r.provider
			      AND (
			        active.status = 'running'
			        OR (active.status = 'pending' AND active.worker_id IS NOT NULL)
			        OR (active.status = 'pending' AND active.external_task_id IS NOT NULL)
			        OR (
			          active.status = 'pending'
			          AND active.failure_kind IN ('worker_lost_unknown', 'provider_ambiguous')
			        )
			      )) + (SELECT COUNT(*)
			        FROM provider_call_reservations reservation
				        WHERE reservation.provider = r.provider
				          AND reservation.released_at IS NULL
				          AND (
				            reservation.lease_expires_at > ${now}
				            OR reservation.external_task_id IS NOT NULL
				            OR (reservation.submission_started_at IS NOT NULL AND reservation.quarantine_until > ${now})
				          ))
			  ) < ${input.providerMaxConcurrency}
			ORDER BY e.scheduled_for, r.target_index, r.run_index
			FOR UPDATE OF r SKIP LOCKED
			LIMIT 1
		`);

		const row = candidate.rows[0] as
			| { id: string; provider: string; circuit_key: string; circuit_state: "closed" | "open" }
			| undefined;
		if (!row) return null;

		if (row.circuit_state === "open") {
			await tx
				.update(providerHealth)
				.set({ circuitState: "half_open", probeRunId: row.id, updatedAt: now })
				.where(eq(providerHealth.circuitKey, row.circuit_key));
		}

		return claimProviderRun(tx, row.id, input.workerId, now, leaseExpiresAt);
	});
}

async function claimProviderRun(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	runId: string,
	workerId: string,
	now: Date,
	leaseExpiresAt: Date,
): Promise<ExecutionRunClaim | null> {
	const result = await tx.execute(sql`
		UPDATE prompt_execution_runs r
		SET worker_id = ${workerId}, lease_expires_at = ${leaseExpiresAt},
		    attempt_count = attempt_count + 1, started_at = COALESCE(started_at, ${now}), updated_at = ${now}
		FROM prompt_executions e
		WHERE r.id = ${runId} AND e.id = r.execution_id AND r.status = 'pending'
		  AND (r.worker_id IS NULL OR r.lease_expires_at <= ${now})
		RETURNING r.id, r.execution_id, e.prompt_id, r.provider, r.circuit_key, r.model, r.version,
			          r.web_search_enabled, r.run_index, r.external_task_id, r.attempt_count,
			          COALESCE(r.started_at, ${now}) AS started_at, e.context_payload
	`);
	if (result.rows.length > 0) {
		await tx.execute(sql`
			UPDATE prompt_executions
			SET status = 'running', started_at = COALESCE(started_at, ${now}), updated_at = ${now}
			WHERE id = ${(result.rows[0] as { execution_id: string }).execution_id}
		`);
	}
	return mapRunClaim(result.rows[0], "provider");
}

/** Cross the paid-work boundary only after all local preparation has succeeded. */
export async function beginProviderSubmission(runId: string, workerId: string): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = 'running', updated_at = now()
		WHERE id = ${runId} AND status = 'pending' AND worker_id = ${workerId}
		  AND lease_expires_at > now()
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease before provider submission for run ${runId}`);
}

export async function releasePreparedRun(runId: string, workerId: string, now = new Date()): Promise<void> {
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET worker_id = NULL, lease_expires_at = NULL, available_at = ${now}, updated_at = ${now}
		WHERE id = ${runId} AND status = 'pending' AND worker_id = ${workerId}
	`);
}

function mapRunClaim(row: unknown, phase: "provider" | "processing"): ExecutionRunClaim | null {
	if (!row) return null;
	const value = row as {
		id: string;
		execution_id: string;
		prompt_id: string;
		provider: string;
		circuit_key: string;
		model: string;
		version: string | null;
		web_search_enabled: boolean;
		run_index: number;
		external_task_id: string | null;
		attempt_count: number;
		started_at: Date | string;
		context_payload: PromptExecutionContextSnapshot;
	};
	if (!value.context_payload) throw new Error(`Execution context snapshot is missing for run ${value.id}`);
	return {
		id: value.id,
		executionId: value.execution_id,
		promptId: value.prompt_id,
		provider: value.provider,
		circuitKey: value.circuit_key,
		model: value.model,
		version: value.version,
		webSearchEnabled: value.web_search_enabled,
		runIndex: value.run_index,
		externalTaskId: value.external_task_id,
		attemptCount: value.attempt_count,
		phase,
		startedAt: asDate(value.started_at),
		context: value.context_payload,
	};
}

export async function checkpointExternalTask(runId: string, workerId: string, taskId: string): Promise<void> {
	const result = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET external_task_id = COALESCE(external_task_id, ${taskId}),
		    provider_submitted_at = COALESCE(provider_submitted_at, now()), updated_at = now()
		WHERE id = ${runId} AND status = 'running' AND worker_id = ${workerId}
		RETURNING external_task_id
	`);
	if (result.rows.length === 0) throw new Error(`Lost lease while checkpointing provider task for run ${runId}`);
	const stored = (result.rows[0] as { external_task_id: string }).external_task_id;
	if (stored !== taskId) throw new Error(`Provider task mismatch for run ${runId}`);
}

export async function checkpointProviderResult(
	runId: string,
	workerId: string,
	result: StoredProviderResult,
): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = 'processing', result_payload = ${JSON.stringify(result)}::json,
		    worker_id = NULL, lease_expires_at = NULL, failure_kind = NULL,
		    error_message = NULL, updated_at = now()
		WHERE id = ${runId} AND status IN ('running', 'processing') AND worker_id = ${workerId}
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease while checkpointing provider result for run ${runId}`);
}

/** Persist the paid response before any fallible provider-specific parsing. */
export async function checkpointProviderRawResponse(
	runId: string,
	workerId: string,
	response: { rawOutput: unknown; modelVersion?: string },
): Promise<void> {
	const payload: StoredRawProviderResponse = { rawResponseOnly: true, ...response };
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = 'processing', result_payload = ${JSON.stringify(payload)}::json,
		    failure_kind = NULL, error_message = NULL, updated_at = now()
		WHERE id = ${runId} AND status = 'running' AND worker_id = ${workerId}
		RETURNING id
	`);
	if (updated.rows.length === 0)
		throw new Error(`Lost lease while checkpointing raw provider response for run ${runId}`);
}

export async function releaseRawResponseForProcessing(runId: string, workerId: string): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET worker_id = NULL, lease_expires_at = NULL, available_at = now(), updated_at = now()
		WHERE id = ${runId} AND status = 'processing' AND worker_id = ${workerId}
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease while releasing raw provider response for run ${runId}`);
}

/** Record one provider-payload failure without counting every local replay. */
export async function recordRawResponseValidationFailure(
	runId: string,
	workerId: string,
	error: unknown,
): Promise<boolean> {
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET failure_kind = 'provider_transient', error_message = ${errorText(error)}, updated_at = now()
		WHERE id = ${runId} AND status = 'processing' AND worker_id = ${workerId}
		  AND failure_kind IS NULL
		RETURNING id
	`);
	return updated.rows.length > 0;
}

export async function deferProviderTask(
	runId: string,
	workerId: string,
	retryAfterMs: number,
	message: string,
): Promise<void> {
	const availableAt = new Date(Date.now() + Math.max(1000, retryAfterMs));
	await db.transaction(async (tx) => {
		const [deferred] = await tx
			.update(promptExecutionRuns)
			.set({
				status: "pending",
				availableAt,
				workerId: null,
				leaseExpiresAt: null,
				errorMessage: message.slice(0, 4000),
				updatedAt: new Date(),
			})
			.where(sql`${promptExecutionRuns.id} = ${runId}
				AND ${promptExecutionRuns.status} = 'running'
				AND ${promptExecutionRuns.workerId} = ${workerId}
				AND ${promptExecutionRuns.externalTaskId} IS NOT NULL`)
			.returning({ id: promptExecutionRuns.id });
		if (!deferred) throw new Error(`Lost lease while deferring provider task for run ${runId}`);
	});
}

/**
 * A request may have reached a synchronous provider even though no response or
 * resumable task id reached us. Keep the execution and one provider slot
 * occupied for a conservative safety window instead of purchasing a replacement.
 */
export async function quarantineAmbiguousProviderCall(runId: string, workerId: string, error: unknown): Promise<void> {
	const quarantineUntil = new Date(Date.now() + AMBIGUOUS_CALL_QUARANTINE_MS);
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = 'pending', available_at = ${quarantineUntil},
		    failure_kind = 'provider_ambiguous', error_message = ${errorText(error)},
		    worker_id = NULL, lease_expires_at = NULL, updated_at = now()
		WHERE id = ${runId} AND status = 'running' AND worker_id = ${workerId}
		  AND external_task_id IS NULL
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease while quarantining provider call for run ${runId}`);
}

/** A half-open probe that never reached the provider must not wedge the circuit. */
export async function releaseProviderProbe(circuitKey: string, runId: string, retryAfterMs = 30_000): Promise<void> {
	await db.execute(sql`
		UPDATE provider_health
		SET circuit_state = 'open', reopen_at = ${new Date(Date.now() + retryAfterMs)},
		    probe_run_id = NULL, updated_at = now()
		WHERE circuit_key = ${circuitKey} AND circuit_state = 'half_open' AND probe_run_id = ${runId}
	`);
}

export async function failExecutionRun(input: {
	runId: string;
	workerId: string;
	kind: ExecutionRunFailureKind;
	error: unknown;
	status?: "failed" | "abandoned" | "skipped";
}): Promise<void> {
	const status = input.status ?? "failed";
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = ${status}::prompt_execution_run_status,
		    failure_kind = ${input.kind}, error_message = ${errorText(input.error)},
		    worker_id = NULL, lease_expires_at = NULL, completed_at = now(), updated_at = now()
		WHERE id = ${input.runId} AND worker_id = ${input.workerId}
		  AND status IN ('pending', 'running', 'processing')
	`);
}

export async function heartbeatExecutionRun(runId: string, workerId: string, now = new Date()): Promise<void> {
	const leaseExpiresAt = new Date(now.getTime() + RUN_LEASE_MS);
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET lease_expires_at = ${leaseExpiresAt}, updated_at = ${now}
		WHERE id = ${runId} AND worker_id = ${workerId}
		  AND status IN ('pending', 'running', 'processing')
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease while heartbeating run ${runId}`);
}

export async function getStoredProviderResult(runId: string, workerId: string): Promise<StoredProviderPayload> {
	const result = await db.execute(sql`
		SELECT result_payload
		FROM prompt_execution_runs
		WHERE id = ${runId} AND status = 'processing' AND worker_id = ${workerId}
	`);
	const payload = (result.rows[0] as { result_payload: StoredProviderPayload | null } | undefined)?.result_payload;
	if (!payload) throw new Error(`Stored provider result is missing for run ${runId}`);
	return payload;
}

export async function processingAttemptCount(runId: string): Promise<number> {
	const result = await db.execute(sql`
		SELECT processing_attempts FROM prompt_execution_runs WHERE id = ${runId}
	`);
	return Number((result.rows[0] as { processing_attempts: number } | undefined)?.processing_attempts ?? 0);
}

export function hasExhaustedProcessingRetries(attempts: number): boolean {
	return attempts >= PROCESSING_RETRY_LIMIT;
}

export async function retryStoredResult(runId: string, workerId: string, error: unknown): Promise<void> {
	const attempts = await processingAttemptCount(runId);
	if (hasExhaustedProcessingRetries(attempts)) {
		await failExecutionRun({
			runId,
			workerId,
			kind: "internal_after_provider",
			error,
		});
		return;
	}
	const delayMs = Math.min(2 ** Math.max(0, attempts - 1) * 5000, 5 * 60 * 1000);
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET worker_id = NULL, lease_expires_at = NULL,
		    available_at = ${new Date(Date.now() + delayMs)}, error_message = ${errorText(error)}, updated_at = now()
		WHERE id = ${runId} AND status = 'processing' AND worker_id = ${workerId}
	`);
}

export async function markProviderSuccess(circuitKey: string, runId: string): Promise<void> {
	const now = new Date();
	await db.execute(sql`
		INSERT INTO provider_health (circuit_key, circuit_state, consecutive_failures, updated_at)
		VALUES (${circuitKey}, 'closed', 0, ${now})
		ON CONFLICT (circuit_key) DO UPDATE
		SET circuit_state = CASE
		      WHEN provider_health.circuit_state = 'closed' THEN 'closed'::provider_circuit_state
		      WHEN provider_health.circuit_state = 'half_open' AND provider_health.probe_run_id = ${runId}
		        THEN 'closed'::provider_circuit_state
		      ELSE provider_health.circuit_state
		    END,
		    consecutive_failures = CASE
		      WHEN provider_health.circuit_state = 'closed'
		        OR (provider_health.circuit_state = 'half_open' AND provider_health.probe_run_id = ${runId})
		      THEN 0 ELSE provider_health.consecutive_failures END,
		    opened_at = CASE
		      WHEN provider_health.circuit_state = 'closed'
		        OR (provider_health.circuit_state = 'half_open' AND provider_health.probe_run_id = ${runId})
		      THEN NULL ELSE provider_health.opened_at END,
		    reopen_at = CASE
		      WHEN provider_health.circuit_state = 'closed'
		        OR (provider_health.circuit_state = 'half_open' AND provider_health.probe_run_id = ${runId})
		      THEN NULL ELSE provider_health.reopen_at END,
		    probe_run_id = CASE
		      WHEN provider_health.circuit_state = 'closed'
		        OR (provider_health.circuit_state = 'half_open' AND provider_health.probe_run_id = ${runId})
		      THEN NULL ELSE provider_health.probe_run_id END,
		    updated_at = ${now}
	`);
}

export async function markProviderFailure(input: {
	circuitKey: string;
	runId: string;
	kind: "transient" | "fatal";
	error: unknown;
}): Promise<{ state: "closed" | "open" | "half_open"; reopenAt: Date | null }> {
	const now = new Date();
	return db.transaction(async (tx) => {
		await tx.insert(providerHealth).values({ circuitKey: input.circuitKey }).onConflictDoNothing();
		const [health] = await tx
			.select()
			.from(providerHealth)
			.where(eq(providerHealth.circuitKey, input.circuitKey))
			.for("update");
		const current = health as ProviderHealthRow;

		if (current.circuitState === "open") {
			return { state: current.circuitState, reopenAt: current.reopenAt };
		}

		const failures = current.consecutiveFailures + 1;
		const cooldownMs =
			input.kind === "fatal"
				? PROVIDER_FATAL_COOLDOWN_MS
				: current.circuitState === "half_open"
					? (transientProviderCooldownMs(Math.max(failures, 5)) ?? 5 * 60 * 1000)
					: transientProviderCooldownMs(failures);
		const shouldOpen = cooldownMs !== null;
		const reopenAt = shouldOpen ? new Date(now.getTime() + cooldownMs) : null;

		await tx
			.update(providerHealth)
			.set({
				circuitState: shouldOpen ? "open" : "closed",
				consecutiveFailures: failures,
				openedAt: shouldOpen ? now : null,
				reopenAt,
				probeRunId: null,
				lastFailureKind: input.kind,
				lastError: errorText(input.error),
				lastFailureAt: now,
				updatedAt: now,
			})
			.where(eq(providerHealth.circuitKey, input.circuitKey));

		return { state: shouldOpen ? "open" : "closed", reopenAt };
	});
}

/** Reserve one fleet-wide provider slot for paid work outside prompt tracking. */
export async function reserveProviderCall(input: {
	provider: string;
	circuitKey: string;
	ownerType: string;
	ownerId: string;
	workKey?: string;
	requestFingerprint?: string;
	requestMetadata?: unknown;
	workerId: string;
	providerMaxConcurrency: number;
	maxAttempts?: number;
	ownerMaxCalls?: number;
	budgetScope?: "owner" | "work";
	exclusiveOwner?: boolean;
	now?: Date;
}): Promise<ProviderReservationAttempt> {
	const now = input.now ?? new Date();
	const id = randomUUID();
	const leaseExpiresAt = new Date(now.getTime() + RESERVATION_LEASE_MS);
	const maxAttempts = input.maxAttempts ?? DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT;
	if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new Error("maxAttempts must be a positive integer");
	if (input.ownerMaxCalls !== undefined && (!Number.isSafeInteger(input.ownerMaxCalls) || input.ownerMaxCalls < 0)) {
		throw new Error("ownerMaxCalls must be a non-negative integer");
	}
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo_prompt_run_admission'))`);

		let attemptNumber = 1;
		let preparedReservation: { id: string; attemptNumber: number; attemptCount: number } | undefined;
		if (input.workKey) {
			const existingResult = await tx.execute(sql`
				SELECT id, provider, request_fingerprint, request_metadata, worker_id, lease_expires_at,
				       submission_started_at, external_task_id, task_deadline_at, result_payload, released_at, release_reason,
				       retry_allowed, attempt_number, attempt_count
				FROM provider_call_reservations
				WHERE owner_type = ${input.ownerType}
				  AND owner_id = ${input.ownerId}
				  AND work_key = ${input.workKey}
				ORDER BY attempt_number DESC
				LIMIT 1
				FOR UPDATE
			`);
			const existing = existingResult.rows[0] as
				| {
						id: string;
						provider: string;
						request_fingerprint: string | null;
						request_metadata: unknown | null;
						worker_id: string;
						lease_expires_at: Date | string | null;
						submission_started_at: Date | string | null;
						external_task_id: string | null;
						task_deadline_at: Date | string | null;
						result_payload: unknown | null;
						released_at: Date | string | null;
						release_reason: string | null;
						retry_allowed: boolean;
						attempt_number: number;
						attempt_count: number;
				  }
				| undefined;

			if (existing) {
				const decision = decideExistingProviderReservation({
					existing: {
						id: existing.id,
						provider: existing.provider,
						requestFingerprint: existing.request_fingerprint,
						workerId: existing.worker_id,
						leaseExpiresAt: existing.lease_expires_at ? asDate(existing.lease_expires_at) : null,
						submissionStartedAt: existing.submission_started_at ? asDate(existing.submission_started_at) : null,
						externalTaskId: existing.external_task_id,
						taskDeadlineAt: existing.task_deadline_at ? asDate(existing.task_deadline_at) : null,
						result: existing.result_payload,
						releasedAt: existing.released_at ? asDate(existing.released_at) : null,
						releaseReason: existing.release_reason,
						retryAllowed: existing.retry_allowed,
					},
					provider: input.provider,
					requestFingerprint: input.requestFingerprint,
					workerId: input.workerId,
					now,
				});

				if (decision.state === "cached") {
					await tx.execute(sql`
						UPDATE provider_call_reservations
						SET worker_id = ${input.workerId}, lease_expires_at = ${leaseExpiresAt}, updated_at = ${now}
						WHERE id = ${existing.id}
					`);
					return { ...decision, attemptNumber: existing.attempt_number, attemptCount: existing.attempt_count };
				}
				if (decision.state === "prepared") {
					preparedReservation = {
						id: existing.id,
						attemptNumber: existing.attempt_number,
						attemptCount: existing.attempt_count + 1,
					};
					attemptNumber = existing.attempt_number;
				} else if (decision.state === "expired") {
					await tx.execute(sql`
						UPDATE provider_call_reservations
						SET released_at = ${now}, release_reason = 'provider task deadline exceeded',
						    released_by = 'scheduler', retry_allowed = false,
						    lease_expires_at = NULL, updated_at = ${now}
						WHERE id = ${existing.id} AND released_at IS NULL
					`);
					return { state: "terminal", id: existing.id, reason: "provider task deadline exceeded" };
				} else if (decision.state === "resume") {
					await tx.execute(sql`
						UPDATE provider_call_reservations
						SET worker_id = ${input.workerId}, lease_expires_at = ${leaseExpiresAt},
						    quarantine_until = GREATEST(quarantine_until, ${new Date(now.getTime() + AMBIGUOUS_CALL_QUARANTINE_MS)}),
						    attempt_count = attempt_count + 1, updated_at = ${now}
						WHERE id = ${existing.id} AND released_at IS NULL
					`);
					return {
						state: "resumed",
						id: decision.id,
						externalTaskId: decision.externalTaskId,
						attemptNumber: existing.attempt_number,
						attemptCount: existing.attempt_count + 1,
					};
				} else if (decision.state === "terminal" && existing.retry_allowed && existing.attempt_number < maxAttempts) {
					attemptNumber = existing.attempt_number + 1;
				} else if (decision.state === "conflict") {
					return { ...decision, requestMetadata: existing.request_metadata ?? undefined };
				} else {
					return decision;
				}
			}
		}

		if (input.exclusiveOwner) {
			const conflicting = await tx.execute(sql`
				SELECT id,
				       GREATEST(
				         COALESCE(lease_expires_at, ${now}),
				         CASE WHEN submission_started_at IS NOT NULL THEN quarantine_until ELSE ${now} END
				       ) AS retry_at
				FROM provider_call_reservations
				WHERE owner_type = ${input.ownerType}
				  AND owner_id = ${input.ownerId}
				  AND work_key IS DISTINCT FROM ${input.workKey}
				  AND released_at IS NULL
				  AND (
				    lease_expires_at > ${now}
				    OR external_task_id IS NOT NULL
				    OR (submission_started_at IS NOT NULL AND quarantine_until > ${now})
				  )
				ORDER BY retry_at DESC
				LIMIT 1
				FOR UPDATE
			`);
			const conflict = conflicting.rows[0] as { id: string; retry_at: Date | string } | undefined;
			if (conflict) return { state: "busy", id: conflict.id, retryAt: asDate(conflict.retry_at) };
		}

		if (input.ownerMaxCalls !== undefined && !preparedReservation) {
			const usedResult =
				input.budgetScope === "work"
					? await tx.execute(sql`
						SELECT COUNT(*)::int AS used
						FROM provider_call_reservations
						WHERE owner_type = ${input.ownerType} AND owner_id = ${input.ownerId}
						  AND work_key = ${input.workKey}
					`)
					: await tx.execute(sql`
						SELECT COUNT(*)::int AS used
						FROM provider_call_reservations
						WHERE owner_type = ${input.ownerType} AND owner_id = ${input.ownerId}
					`);
			const used = Number((usedResult.rows[0] as { used: number } | undefined)?.used ?? 0);
			if (used >= input.ownerMaxCalls) return { state: "budget", limit: input.ownerMaxCalls };
		}

		const [health] = await tx.select().from(providerHealth).where(eq(providerHealth.circuitKey, input.circuitKey));
		if (
			health?.circuitState === "half_open" &&
			(!preparedReservation || health.probeRunId !== preparedReservation.id)
		) {
			return { state: "circuit", reopenAt: health.reopenAt };
		}
		if (health?.circuitState === "open" && (!health.reopenAt || health.reopenAt > now)) {
			return { state: "circuit", reopenAt: health.reopenAt };
		}

		const admissionId = preparedReservation?.id ?? id;
		const countResult = await tx.execute(sql`
			SELECT (
			  (SELECT COUNT(*) FROM prompt_execution_runs r
			   WHERE r.provider = ${input.provider}
			     AND (
			       r.status = 'running'
			       OR (r.status = 'pending' AND r.worker_id IS NOT NULL)
			       OR (r.status = 'pending' AND r.external_task_id IS NOT NULL)
			       OR (r.status = 'pending' AND r.failure_kind IN ('worker_lost_unknown', 'provider_ambiguous'))
			     ))
			  +
			  (SELECT COUNT(*) FROM provider_call_reservations reservation
			   WHERE reservation.provider = ${input.provider}
			     AND reservation.id <> ${admissionId}
			     AND reservation.released_at IS NULL
			     AND (
			       reservation.lease_expires_at > ${now}
			       OR reservation.external_task_id IS NOT NULL
			       OR (reservation.submission_started_at IS NOT NULL AND reservation.quarantine_until > ${now})
			     ))
			)::int AS active
		`);
		const active = Number((countResult.rows[0] as { active: number } | undefined)?.active ?? 0);
		if (active >= input.providerMaxConcurrency) return { state: "capacity" };

		if (health?.circuitState === "open") {
			await tx
				.update(providerHealth)
				.set({ circuitState: "half_open", probeRunId: admissionId, updatedAt: now })
				.where(eq(providerHealth.circuitKey, input.circuitKey));
		}

		if (preparedReservation) {
			await tx.execute(sql`
				UPDATE provider_call_reservations
				SET worker_id = ${input.workerId}, lease_expires_at = ${leaseExpiresAt},
				    attempt_count = attempt_count + 1, updated_at = ${now}
				WHERE id = ${preparedReservation.id} AND released_at IS NULL AND submission_started_at IS NULL
			`);
			return {
				state: "reserved",
				id: preparedReservation.id,
				externalTaskId: null,
				attemptNumber: preparedReservation.attemptNumber,
				attemptCount: preparedReservation.attemptCount,
			};
		}

		await tx.insert(providerCallReservations).values({
			id,
			provider: input.provider,
			ownerType: input.ownerType,
			ownerId: input.ownerId,
			workKey: input.workKey,
			attemptNumber,
			requestFingerprint: input.requestFingerprint,
			requestMetadata: input.requestMetadata,
			workerId: input.workerId,
			leaseExpiresAt,
			attemptCount: 1,
			quarantineUntil: now,
		});
		return { state: "reserved", id, externalTaskId: null, attemptNumber, attemptCount: 1 };
	});
}

/** Cross the durable prepared/submitted boundary immediately before network I/O. */
export async function beginProviderCallReservation(id: string, workerId: string): Promise<void> {
	const now = new Date();
	const updated = await db.execute(sql`
		UPDATE provider_call_reservations
		SET submission_started_at = COALESCE(submission_started_at, ${now}),
		    quarantine_until = GREATEST(quarantine_until, ${new Date(now.getTime() + AMBIGUOUS_CALL_QUARANTINE_MS)}),
		    lease_expires_at = ${new Date(now.getTime() + RESERVATION_LEASE_MS)}, updated_at = ${now}
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		  AND lease_expires_at > ${now}
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost provider reservation ${id} before submission`);
}

export async function checkpointProviderReservationTask(id: string, workerId: string, taskId: string): Promise<void> {
	const result = await db.execute(sql`
		UPDATE provider_call_reservations
		SET external_task_id = COALESCE(external_task_id, ${taskId}),
		    task_deadline_at = COALESCE(task_deadline_at, ${new Date(Date.now() + PROVIDER_TASK_DEADLINE_MS)}),
		    lease_expires_at = now() + interval '15 minutes',
		    quarantine_until = GREATEST(quarantine_until, now() + interval '24 hours'), updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		RETURNING external_task_id
	`);
	const stored = (result.rows[0] as { external_task_id: string } | undefined)?.external_task_id;
	if (!stored) throw new Error(`Lost provider reservation ${id} while checkpointing task`);
	if (stored !== taskId) throw new Error(`Provider reservation task mismatch for ${id}`);
}

export async function heartbeatProviderCallReservation(id: string, workerId: string): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE provider_call_reservations
		SET lease_expires_at = now() + interval '15 minutes',
		    quarantine_until = GREATEST(quarantine_until, now() + interval '24 hours'), updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost provider reservation ${id}`);
}

export async function checkpointProviderReservationResult(
	id: string,
	workerId: string,
	result: unknown,
): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE provider_call_reservations
		SET result_payload = ${JSON.stringify(result)}::json,
		    lease_expires_at = now() + interval '15 minutes', updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost provider reservation ${id} while checkpointing result`);
}

export async function recordProviderReservationError(id: string, workerId: string, error: unknown): Promise<void> {
	await db.execute(sql`
		UPDATE provider_call_reservations
		SET last_error = ${errorText(error)}, updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
	`);
}

export async function releaseProviderCallReservation(
	id: string,
	workerId: string,
	reason = "completed",
	options: { retryAllowed?: boolean } = {},
): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE provider_call_reservations
		SET released_at = now(), release_reason = ${reason}, released_by = ${workerId},
		    retry_allowed = ${options.retryAllowed ?? false}, lease_expires_at = NULL, updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		RETURNING id
	`);
	if (updated.rows.length > 0) return;
	const current = await db.execute(sql`
		SELECT released_at FROM provider_call_reservations WHERE id = ${id}
	`);
	if ((current.rows[0] as { released_at: Date | string | null } | undefined)?.released_at) return;
	throw new Error(`Lost provider reservation ${id} while releasing it`);
}

/** Recover only transitions that cannot purchase the same work twice. */
export async function recoverExpiredWork(now = new Date()): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`
			UPDATE prompt_execution_runs
			SET worker_id = NULL, lease_expires_at = NULL, available_at = ${now}, updated_at = ${now}
			WHERE status = 'pending' AND worker_id IS NOT NULL AND lease_expires_at <= ${now}
		`);
		await tx.execute(sql`
			UPDATE prompt_execution_runs
			SET worker_id = NULL, lease_expires_at = NULL, updated_at = ${now}
			WHERE status = 'processing' AND lease_expires_at <= ${now}
		`);
		await tx.execute(sql`
			UPDATE prompt_execution_runs
			SET status = 'pending', available_at = ${now}, worker_id = NULL,
			    lease_expires_at = NULL, updated_at = ${now}
			WHERE status = 'running' AND lease_expires_at <= ${now}
			  AND external_task_id IS NOT NULL
		`);
		await tx.execute(sql`
			UPDATE prompt_execution_runs r
			SET status = 'abandoned', failure_kind = 'provider_task_failed',
			    error_message = 'Accepted provider task exceeded the execution deadline',
			    worker_id = NULL, lease_expires_at = NULL, completed_at = ${now}, updated_at = ${now}
			FROM prompt_executions e
			WHERE e.id = r.execution_id
			  AND r.status = 'pending' AND r.external_task_id IS NOT NULL
			  AND (r.worker_id IS NULL OR r.lease_expires_at <= ${now})
			  AND COALESCE(r.provider_submitted_at, r.started_at, r.created_at) + interval '24 hours' <= ${now}
		`);
		await tx.execute(sql`
			UPDATE prompt_execution_runs
			SET status = 'pending',
			    available_at = ${new Date(now.getTime() + AMBIGUOUS_CALL_QUARANTINE_MS)},
			    failure_kind = 'worker_lost_unknown',
			    error_message = 'Worker lease expired without a durable provider task id; not replaying ambiguous paid work',
			    worker_id = NULL, lease_expires_at = NULL, updated_at = ${now}
			WHERE status = 'running' AND lease_expires_at <= ${now}
			  AND external_task_id IS NULL
		`);
		await tx.execute(sql`
			UPDATE prompt_execution_runs r
			SET status = 'abandoned', completed_at = ${now}, updated_at = ${now}
			FROM prompt_executions e
			WHERE e.id = r.execution_id AND r.available_at <= ${now}
			  AND r.status = 'pending'
			  AND r.failure_kind IN ('worker_lost_unknown', 'provider_ambiguous')
		`);
		await tx.execute(sql`
			UPDATE prompt_execution_runs r
			SET status = 'skipped', failure_kind = 'execution_window_expired',
			    error_message = 'Execution window ended before this run could be admitted',
			    worker_id = NULL, lease_expires_at = NULL, completed_at = ${now}, updated_at = ${now}
			FROM prompt_executions e
			WHERE e.id = r.execution_id AND e.not_after <= ${now}
			  AND r.status = 'pending' AND r.external_task_id IS NULL
			  AND r.worker_id IS NULL
			  AND (r.failure_kind IS NULL OR r.failure_kind NOT IN ('worker_lost_unknown', 'provider_ambiguous'))
		`);
		await tx.execute(sql`
			UPDATE prompt_execution_runs r
			SET status = 'skipped', failure_kind = 'prompt_disabled',
			    error_message = 'Prompt or brand was deleted or disabled before provider submission',
			    completed_at = ${now}, updated_at = ${now}
			FROM prompt_executions e
			WHERE e.id = r.execution_id AND r.status = 'pending' AND r.external_task_id IS NULL
			  AND r.worker_id IS NULL
			  AND (r.failure_kind IS NULL OR r.failure_kind NOT IN ('worker_lost_unknown', 'provider_ambiguous'))
			  AND NOT EXISTS (
			    SELECT 1
			    FROM prompts p
			    JOIN brands b ON b.id = p.brand_id
			    WHERE p.id = e.prompt_id AND p.enabled = true AND b.enabled = true
			  )
		`);
		await tx.execute(sql`
			UPDATE provider_call_reservations
			SET released_at = ${now}, release_reason = 'provider task deadline exceeded',
			    released_by = 'scheduler', retry_allowed = false,
			    lease_expires_at = NULL, updated_at = ${now}
			WHERE released_at IS NULL AND external_task_id IS NOT NULL
			  AND task_deadline_at IS NOT NULL AND task_deadline_at <= ${now}
		`);
		await tx.execute(sql`
			UPDATE provider_health h
			SET circuit_state = 'closed', consecutive_failures = 0, opened_at = NULL,
			    reopen_at = NULL, probe_run_id = NULL, updated_at = ${now}
			FROM prompt_execution_runs r
			WHERE h.circuit_state = 'half_open' AND r.id = h.probe_run_id
			  AND (
			    r.status = 'succeeded'
			    OR (
			      r.status = 'processing'
			      AND COALESCE(r.result_payload->>'rawResponseOnly', 'false') <> 'true'
			    )
			  )
		`);
		await tx.execute(sql`
			UPDATE provider_health h
			SET circuit_state = 'closed', consecutive_failures = 0, opened_at = NULL,
			    reopen_at = NULL, probe_run_id = NULL, updated_at = ${now}
			FROM provider_call_reservations reservation
			WHERE h.circuit_state = 'half_open' AND reservation.id = h.probe_run_id
			  AND reservation.result_payload IS NOT NULL
			  AND COALESCE(reservation.result_payload->>'rawResponseOnly', 'false') <> 'true'
		`);
		await tx.execute(sql`
			UPDATE provider_health h
			SET circuit_state = 'open', reopen_at = ${now}, probe_run_id = NULL, updated_at = ${now}
			WHERE h.circuit_state = 'half_open'
			  AND NOT EXISTS (
			    SELECT 1 FROM prompt_execution_runs r
			    WHERE r.id = h.probe_run_id
			      AND (
			        (r.status = 'pending' AND r.external_task_id IS NOT NULL)
			        OR (r.status IN ('pending', 'running') AND r.worker_id IS NOT NULL AND r.lease_expires_at > ${now})
			      )
			  )
			  AND NOT EXISTS (
			    SELECT 1 FROM provider_call_reservations reservation
			    WHERE reservation.id = h.probe_run_id AND reservation.released_at IS NULL
			      AND (
			        reservation.lease_expires_at > ${now}
			        OR reservation.external_task_id IS NOT NULL
			        OR (reservation.submission_started_at IS NOT NULL AND reservation.quarantine_until > ${now})
			      )
			  )
		`);
	});
	await finalizeReadyExecutions(now);
}

export async function releaseResumableWork(workerId: string, now = new Date()): Promise<void> {
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET worker_id = NULL, lease_expires_at = NULL, available_at = ${now}, updated_at = ${now}
		WHERE worker_id = ${workerId} AND status = 'pending'
	`);
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = 'pending', available_at = ${now}, worker_id = NULL,
		    lease_expires_at = NULL, updated_at = ${now}
		WHERE worker_id = ${workerId} AND status = 'running' AND external_task_id IS NOT NULL
	`);
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET worker_id = NULL, lease_expires_at = NULL, updated_at = ${now}
		WHERE worker_id = ${workerId} AND status = 'processing'
	`);
}

export async function finalizeReadyExecutions(now = new Date()): Promise<void> {
	await db.transaction(async (tx) => {
		const completed = await tx.execute(sql`
			WITH aggregate AS (
				SELECT e.id,
				       COUNT(r.id)::int AS total,
				       COUNT(*) FILTER (WHERE r.status = 'succeeded')::int AS succeeded,
				       COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed,
				       COUNT(*) FILTER (WHERE r.status = 'skipped')::int AS skipped,
				       COUNT(*) FILTER (WHERE r.status = 'abandoned')::int AS abandoned,
				       LEFT(STRING_AGG(DISTINCT r.error_message, '; ') FILTER (WHERE r.error_message IS NOT NULL), 4000)
				         AS errors
				FROM prompt_executions e
				LEFT JOIN prompt_execution_runs r ON r.execution_id = e.id
				WHERE e.status IN ('pending', 'running')
				GROUP BY e.id
				HAVING COUNT(*) FILTER (WHERE r.status IN ('pending', 'running', 'processing')) = 0
			), finalized AS (
				UPDATE prompt_executions e
				SET status = CASE
				      WHEN a.total = 0 OR a.skipped = a.total THEN 'skipped'::prompt_execution_status
				      WHEN a.succeeded = a.total THEN 'succeeded'::prompt_execution_status
				      WHEN a.succeeded > 0 THEN 'partial'::prompt_execution_status
				      WHEN a.abandoned > 0 AND a.failed = 0 THEN 'abandoned'::prompt_execution_status
				      ELSE 'failed'::prompt_execution_status
				    END,
				    total_runs = a.total, succeeded_runs = a.succeeded, failed_runs = a.failed,
				    skipped_runs = a.skipped, abandoned_runs = a.abandoned,
				    error_summary = a.errors, completed_at = ${now}, updated_at = ${now}
				    , context_payload = CASE
				        WHEN EXISTS (SELECT 1 FROM prompts p WHERE p.id = e.prompt_id) THEN e.context_payload
				        ELSE NULL
				      END
				FROM aggregate a
				WHERE e.id = a.id AND e.status IN ('pending', 'running')
				RETURNING e.prompt_id, e.status
			)
			SELECT prompt_id, status FROM finalized
		`);

		for (const row of completed.rows as Array<{ prompt_id: string; status: string }>) {
			const failed = row.status === "failed" || row.status === "abandoned";
			const cleared = row.status === "succeeded" || row.status === "partial";
			await tx.execute(sql`
				UPDATE prompt_schedules
				SET last_completed_at = ${now},
				    last_execution_status = ${row.status}::prompt_execution_status,
				    consecutive_failures = CASE
				      WHEN ${failed} THEN consecutive_failures + 1
				      WHEN ${cleared} THEN 0
				      ELSE consecutive_failures
				    END,
				    admission_paused_until = CASE
				      WHEN ${failed} THEN ${now} + make_interval(
				        hours => LEAST(168, 24 * power(2, LEAST(consecutive_failures, 3)))::int
				      )
				      WHEN ${cleared} THEN NULL
				      ELSE admission_paused_until
				    END,
				    pause_reason = CASE
				      WHEN ${failed} THEN 'Execution produced no persisted result; automatic spend backoff is active'
				      WHEN ${cleared} THEN NULL
				      ELSE pause_reason
				    END,
				    updated_at = ${now}
				WHERE prompt_id = ${row.prompt_id}
			`);
		}
	});
}
