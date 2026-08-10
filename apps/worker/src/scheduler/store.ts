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
import { decideExistingProviderReservation } from "@workspace/lib/provider-reservation";
import type { ModelConfig } from "@workspace/lib/providers";
import {
	nextPromptRunAt,
	PROVIDER_FAILURE_THRESHOLD,
	PROVIDER_FATAL_COOLDOWN_MS,
	transientProviderCooldownMs,
} from "@workspace/lib/scheduler";
import { eq, type SQL, sql } from "drizzle-orm";

export type ExecutionRunFailureKind = "provider_fatal" | "execution_window_expired" | "prompt_disabled";

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
	model: string;
	version: string | null;
	webSearchEnabled: boolean;
	targetIndex: number;
	runIndex: number;
	phase: "provider" | "processing";
	context: PromptExecutionContextSnapshot;
}

export type {
	StoredProviderPayload,
	StoredProviderResult,
} from "@workspace/lib/provider-payload";

export interface MaterializedExecution {
	executionId: string;
	runCount: number;
	trigger: "scheduled" | "manual";
}

export type ProviderReservationAttempt<TResult = unknown> =
	| { state: "ready"; id: string; externalTaskId: string | null; attemptCount: number }
	| { state: "cached"; id: string; result: TResult; released: boolean; attemptCount: number }
	| { state: "capacity" }
	| { state: "budget"; limit: number }
	| { state: "circuit"; reopenAt: Date | null }
	| { state: "busy"; id: string; retryAt: Date }
	| { state: "ambiguous"; id: string }
	| { state: "terminal"; id: string; reason: string | null }
	| { state: "conflict"; id: string };

export interface ProviderReservationIdentity {
	provider: string;
	circuitKey: string;
	requestFingerprint: string;
	requestMetadata: unknown;
}

interface ProviderHealthRow {
	circuitState: "closed" | "open" | "half_open";
	consecutiveFailures: number;
	openedAt: Date | null;
	reopenAt: Date | null;
	probeRunId: string | null;
}

type SchedulerTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class LostProviderReservationError extends Error {}

const SCHEDULE_LEASE_MS = 60_000;
const RUN_LEASE_MS = 45 * 60 * 1000;
const RESERVATION_LEASE_MS = 15 * 60 * 1000;
const PROVIDER_TASK_DEADLINE_MS = 24 * 60 * 60 * 1000;

function asDate(value: string | Date): Date {
	return value instanceof Date ? value : new Date(value);
}

function errorText(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
}

/** One definition of a provider slot in the sole paid-work ledger. */
function activeProviderCallCount(provider: string | SQL, now: Date, excludedReservationId?: string): SQL {
	const exclusion = excludedReservationId ? sql`AND reservation.id <> ${excludedReservationId}` : sql``;
	return sql`(
		SELECT COUNT(*) FROM provider_call_reservations reservation
		 WHERE reservation.provider = ${provider}
		   AND reservation.released_at IS NULL
		   AND reservation.result_payload IS NULL
		   ${exclusion}
		   AND (
		     reservation.lease_expires_at > ${now}
		     OR reservation.external_task_id IS NOT NULL
		     OR reservation.submission_started_at + interval '24 hours' > ${now}
		   )
	)`;
}

/** Ensure every enabled prompt has durable scheduling intent. */
export async function reconcilePromptSchedules(now = new Date()): Promise<void> {
	const defaultCadenceHours = getDefaultDelayHours();
	await db.execute(sql`
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
					  AND pe.status = 'running'
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

		await tx.insert(promptExecutions).values({
			id: executionId,
			promptId: claim.promptId,
			contextPayload: context,
			trigger,
			scheduledFor,
			notAfter: nextRunAt,
			status: targets.length === 0 ? "skipped" : "running",
			totalRuns: targets.length * runsPerTarget,
			startedAt: admittedAt,
			completedAt: targets.length === 0 ? admittedAt : null,
		});

		const runRows = targets.flatMap((target, targetIndex) =>
			Array.from({ length: runsPerTarget }, (_, runIndex) => ({
				executionId,
				targetIndex,
				runIndex: runIndex + 1,
				provider: target.provider,
				model: target.model,
				version: target.version,
				webSearchEnabled: target.webSearch,
			})),
		);
		if (runRows.length > 0) {
			await tx.insert(promptExecutionRuns).values(runRows);
		}

		await tx.execute(sql`
			UPDATE prompt_schedules
			SET next_run_at = CASE WHEN ${scheduledDue} THEN ${nextRunAt} ELSE next_run_at END,
			    run_requested_at = CASE
			      WHEN run_requested_at IS NOT DISTINCT FROM ${claim.runRequestedAt} THEN NULL
			      ELSE run_requested_at
			    END,
			    lease_owner = NULL,
			    lease_expires_at = NULL,
			    updated_at = ${admittedAt}
			WHERE prompt_id = ${claim.promptId} AND lease_owner = ${workerId}
		`);

		return { executionId, runCount: runRows.length, trigger };
	});
}

/** Lease one business run. Provider admission happens later in the single reservation ledger. */
export async function claimExecutionRun(input: { workerId: string; now?: Date }): Promise<ExecutionRunClaim | null> {
	const now = input.now ?? new Date();
	const leaseExpiresAt = new Date(now.getTime() + RUN_LEASE_MS);
	const result = await db.execute(sql`
		WITH candidate AS MATERIALIZED (
			SELECT r.id, r.status
			FROM prompt_execution_runs r
			JOIN prompt_executions e ON e.id = r.execution_id
			WHERE r.status IN ('pending', 'processing')
			  AND r.available_at <= ${now}
			  AND (r.worker_id IS NULL OR r.lease_expires_at <= ${now})
			  AND (
			    r.status = 'processing'
			    OR EXISTS (
			      SELECT 1
			      FROM provider_call_reservations reservation
			      WHERE reservation.owner_type = 'prompt-run'
			        AND reservation.owner_id = r.id::text
			        AND reservation.work_key = 'provider'
			        AND reservation.submission_started_at IS NOT NULL
			    )
			    OR (
			      e.not_after > ${now}
			      AND EXISTS (
			        SELECT 1
			        FROM prompts p
			        JOIN brands b ON b.id = p.brand_id
			        WHERE p.id = e.prompt_id AND p.enabled = true AND b.enabled = true
			      )
			    )
			  )
			ORDER BY CASE
			           WHEN r.status = 'processing' THEN 0
			           WHEN EXISTS (
			             SELECT 1 FROM provider_call_reservations reservation
			             WHERE reservation.owner_type = 'prompt-run'
			               AND reservation.owner_id = r.id::text
			               AND reservation.work_key = 'provider'
			               AND reservation.submission_started_at IS NOT NULL
			           ) THEN 1
			           ELSE 2
			         END,
			         e.scheduled_for, r.target_index, r.run_index
			FOR UPDATE OF r SKIP LOCKED
			LIMIT 1
		), claimed AS (
			UPDATE prompt_execution_runs r
			SET worker_id = ${input.workerId},
			    lease_expires_at = ${leaseExpiresAt},
			    started_at = COALESCE(started_at, ${now}),
			    updated_at = ${now}
			FROM candidate, prompt_executions e
			WHERE r.id = candidate.id AND e.id = r.execution_id
			RETURNING r.id, r.execution_id, e.prompt_id, r.provider, r.model, r.version,
			          r.web_search_enabled, r.target_index, r.run_index,
			          e.context_payload, candidate.status AS previous_status
		)
		SELECT * FROM claimed
	`);
	const row = result.rows[0] as ({ previous_status: "pending" | "processing" } & Record<string, unknown>) | undefined;
	return mapRunClaim(row, row?.previous_status === "processing" ? "processing" : "provider");
}

/** Validate current product intent before the reservation may cross its paid boundary. */
export async function beginExecutionRun(runId: string, workerId: string): Promise<boolean> {
	const result = await db.execute(sql`
		WITH candidate AS MATERIALIZED (
			SELECT r.id, e.not_after,
			       (
			         e.not_after > now() AND EXISTS (
			         SELECT 1
			         FROM prompts p
			         JOIN brands b ON b.id = p.brand_id
			         WHERE p.id = e.prompt_id AND p.enabled = true AND b.enabled = true
			         )
			       ) OR EXISTS (
			         SELECT 1
			         FROM provider_call_reservations reservation
			         WHERE reservation.owner_type = 'prompt-run'
			           AND reservation.owner_id = r.id::text
			           AND reservation.work_key = 'provider'
			           AND reservation.submission_started_at IS NOT NULL
			       ) AS may_submit
			FROM prompt_execution_runs r
			JOIN prompt_executions e ON e.id = r.execution_id
			WHERE r.id = ${runId} AND r.status = 'pending' AND r.worker_id = ${workerId}
			  AND r.lease_expires_at > now()
			FOR UPDATE OF r
		), updated AS (
			UPDATE prompt_execution_runs r
			SET status = CASE
			      WHEN candidate.may_submit THEN 'running'::prompt_execution_run_status
			      ELSE 'skipped'::prompt_execution_run_status
			    END,
			    failure_kind = CASE
			      WHEN candidate.may_submit THEN r.failure_kind
			      WHEN candidate.not_after <= now() THEN 'execution_window_expired'
			      ELSE 'prompt_disabled'
			    END,
			    error_message = CASE
			      WHEN candidate.may_submit THEN r.error_message
			      WHEN candidate.not_after <= now() THEN 'Execution window ended before provider submission'
			      ELSE 'Prompt or brand was deleted or disabled before provider submission'
			    END,
			    worker_id = CASE WHEN candidate.may_submit THEN r.worker_id ELSE NULL END,
			    lease_expires_at = CASE WHEN candidate.may_submit THEN r.lease_expires_at ELSE NULL END,
			    completed_at = CASE WHEN candidate.may_submit THEN r.completed_at ELSE now() END,
			    updated_at = now()
			FROM candidate
			WHERE r.id = candidate.id
			RETURNING r.status
		), released AS (
			UPDATE provider_call_reservations reservation
			SET released_at = now(),
			    release_reason = 'prompt run cancelled before provider submission',
			    released_by = 'scheduler',
			    lease_expires_at = NULL,
			    updated_at = now()
			FROM updated
			WHERE updated.status = 'skipped'
			  AND reservation.owner_type = 'prompt-run'
			  AND reservation.owner_id = ${runId}::text
			  AND reservation.work_key = 'provider'
			  AND reservation.released_at IS NULL
			  AND reservation.submission_started_at IS NULL
			  AND (reservation.lease_expires_at IS NULL OR reservation.lease_expires_at <= now())
			RETURNING reservation.id, reservation.circuit_key
		), cleared_probes AS (
			UPDATE provider_health health
			SET circuit_state = 'open', reopen_at = now(), probe_run_id = NULL, updated_at = now()
			FROM released
			WHERE health.circuit_state = 'half_open' AND health.probe_run_id = released.id
			RETURNING health.circuit_key
		)
		SELECT status,
		       (SELECT COUNT(*) FROM released) AS released_count,
		       (SELECT COUNT(*) FROM cleared_probes) AS cleared_probe_count
		FROM updated
	`);
	const status = (result.rows[0] as { status: "running" | "skipped" } | undefined)?.status;
	if (!status) throw new Error(`Lost lease before executing prompt run ${runId}`);
	return status === "running";
}

export async function releasePreparedRun(runId: string, workerId: string, now = new Date()): Promise<void> {
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET worker_id = NULL, lease_expires_at = NULL, available_at = ${now}, updated_at = ${now}
		WHERE id = ${runId} AND status IN ('pending', 'processing') AND worker_id = ${workerId}
	`);
}

function mapRunClaim(row: unknown, phase: "provider" | "processing"): ExecutionRunClaim | null {
	if (!row) return null;
	const value = row as {
		id: string;
		execution_id: string;
		prompt_id: string;
		provider: string;
		model: string;
		version: string | null;
		web_search_enabled: boolean;
		target_index: number;
		run_index: number;
		context_payload: PromptExecutionContextSnapshot;
	};
	if (!value.context_payload) throw new Error(`Execution context snapshot is missing for run ${value.id}`);
	return {
		id: value.id,
		executionId: value.execution_id,
		promptId: value.prompt_id,
		provider: value.provider,
		model: value.model,
		version: value.version,
		webSearchEnabled: value.web_search_enabled,
		targetIndex: value.target_index,
		runIndex: value.run_index,
		phase,
		context: value.context_payload,
	};
}

/** The normalized provider result is cached in the reservation; only local persistence remains. */
export async function markExecutionRunProcessing(runId: string, workerId: string): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = 'processing', failure_kind = NULL,
		    error_message = NULL, updated_at = now()
		WHERE id = ${runId} AND status = 'running' AND worker_id = ${workerId}
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease while preparing stored result for run ${runId}`);
}

export async function deferExecutionRun(runId: string, workerId: string, retryAt: Date, error: unknown): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = CASE
		      WHEN status = 'running' THEN 'pending'::prompt_execution_run_status
		      ELSE status
		    END,
		    available_at = ${retryAt}, error_message = ${errorText(error)},
		    worker_id = NULL, lease_expires_at = NULL, updated_at = now()
		WHERE id = ${runId} AND status IN ('pending', 'running', 'processing') AND worker_id = ${workerId}
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease while deferring prompt run ${runId}`);
}

export async function failExecutionRun(input: {
	runId: string;
	workerId: string;
	kind: ExecutionRunFailureKind;
	error: unknown;
	status?: "failed" | "skipped";
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

/** Back off local failures without completing the execution or admitting fresh paid work. */
export async function deferExecutionRunAfterLocalError(runId: string, workerId: string, error: unknown): Promise<void> {
	const now = new Date();
	const updated = await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = CASE
		      WHEN status = 'running' THEN 'pending'::prompt_execution_run_status
		      ELSE status
		    END,
		    local_attempts = local_attempts + 1,
		    worker_id = NULL,
		    lease_expires_at = NULL,
		    available_at = ${now} + make_interval(
		      secs => LEAST(3600, (5 * power(2, LEAST(local_attempts, 10)))::int)
		    ),
		    error_message = ${errorText(error)},
		    updated_at = ${now}
		WHERE id = ${runId} AND status IN ('pending', 'running', 'processing') AND worker_id = ${workerId}
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost lease while deferring local failure for run ${runId}`);
}

function providerSuccessStatement(circuitKey: string, runId: string, now: Date): SQL {
	return sql`
		INSERT INTO provider_health (circuit_key, circuit_state, consecutive_failures, updated_at)
		VALUES (${circuitKey}, 'closed', 0, ${now})
		ON CONFLICT (circuit_key) DO UPDATE
		SET circuit_state = 'closed',
		    consecutive_failures = 0,
		    opened_at = NULL,
		    reopen_at = NULL,
		    probe_run_id = NULL,
		    updated_at = ${now}
		WHERE provider_health.circuit_state = 'closed'
		   OR (provider_health.circuit_state = 'half_open' AND provider_health.probe_run_id = ${runId})
	`;
}

interface ProviderFailureInput {
	circuitKey: string;
	runId: string;
	kind: "transient" | "fatal";
	error: unknown;
}

async function updateProviderFailure(tx: SchedulerTransaction, input: ProviderFailureInput, now: Date): Promise<void> {
	await tx.insert(providerHealth).values({ circuitKey: input.circuitKey }).onConflictDoNothing();
	const [health] = await tx
		.select()
		.from(providerHealth)
		.where(eq(providerHealth.circuitKey, input.circuitKey))
		.for("update");
	const current = health as ProviderHealthRow;

	if (current.circuitState === "open") {
		if (input.kind !== "fatal") return;
		const fatalReopenAt = new Date(now.getTime() + PROVIDER_FATAL_COOLDOWN_MS);
		const reopenAt = current.reopenAt ? new Date(Math.max(current.reopenAt.getTime(), fatalReopenAt.getTime())) : null;
		await tx
			.update(providerHealth)
			.set({
				consecutiveFailures: current.consecutiveFailures + 1,
				openedAt: current.openedAt ?? now,
				reopenAt,
				probeRunId: null,
				lastFailureKind: "fatal",
				lastError: errorText(input.error),
				lastFailureAt: now,
				updatedAt: now,
			})
			.where(eq(providerHealth.circuitKey, input.circuitKey));
		return;
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
}

async function openProviderCircuitAfterTaskDeadline(
	tx: SchedulerTransaction,
	circuitKey: string,
	now: Date,
): Promise<void> {
	await tx.execute(sql`
		INSERT INTO provider_health (
			circuit_key, circuit_state, consecutive_failures, opened_at, reopen_at,
			last_failure_kind, last_error, last_failure_at, updated_at
		)
		VALUES (
			${circuitKey}, 'open', ${PROVIDER_FAILURE_THRESHOLD}, ${now}, ${now} + interval '5 minutes',
			'transient', 'Accepted provider task exceeded its 24-hour deadline', ${now}, ${now}
		)
		ON CONFLICT (circuit_key) DO UPDATE
		SET circuit_state = 'open',
		    consecutive_failures = GREATEST(
		      provider_health.consecutive_failures + 1,
		      ${PROVIDER_FAILURE_THRESHOLD}
		    ),
		    opened_at = COALESCE(provider_health.opened_at, ${now}),
		    reopen_at = GREATEST(
		      COALESCE(provider_health.reopen_at, ${now} + interval '5 minutes'),
		      ${now} + interval '5 minutes'
		    ),
		    probe_run_id = NULL,
		    last_failure_kind = 'transient',
		    last_error = 'Accepted provider task exceeded its 24-hour deadline',
		    last_failure_at = ${now},
		    updated_at = ${now}
	`);
}

/** Read immutable request identity before resolving a provider route on restart. */
export async function getProviderCallReservationIdentity(input: {
	ownerType: string;
	ownerId: string;
	workKey: string;
}): Promise<ProviderReservationIdentity | null> {
	const result = await db.execute(sql`
		SELECT provider, circuit_key, request_fingerprint, request_metadata
		FROM provider_call_reservations
		WHERE owner_type = ${input.ownerType}
		  AND owner_id = ${input.ownerId}
		  AND work_key = ${input.workKey}
	`);
	const row = result.rows[0] as
		| {
				provider: string;
				circuit_key: string;
				request_fingerprint: string;
				request_metadata: unknown;
		  }
		| undefined;
	if (!row) return null;
	return {
		provider: row.provider,
		circuitKey: row.circuit_key,
		requestFingerprint: row.request_fingerprint,
		requestMetadata: row.request_metadata,
	};
}

/** Reserve one fleet-wide provider slot for any paid work. */
export async function reserveProviderCall(input: {
	provider: string;
	circuitKey: string;
	ownerType: string;
	ownerId: string;
	workKey: string;
	requestFingerprint: string;
	requestMetadata: unknown;
	workerId: string;
	providerMaxConcurrency: number;
	ownerMaxCalls?: number;
	exclusiveOwner?: boolean;
	now?: Date;
}): Promise<ProviderReservationAttempt> {
	const now = input.now ?? new Date();
	const id = randomUUID();
	const leaseExpiresAt = new Date(now.getTime() + RESERVATION_LEASE_MS);
	if (input.ownerMaxCalls !== undefined && (!Number.isSafeInteger(input.ownerMaxCalls) || input.ownerMaxCalls < 0)) {
		throw new Error("ownerMaxCalls must be a non-negative integer");
	}
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo_provider_admission'))`);

		let preparedReservation: { id: string; attemptCount: number } | undefined;
		const existingResult = await tx.execute(sql`
				SELECT id, provider, circuit_key, request_fingerprint, worker_id, lease_expires_at,
				       submission_started_at, external_task_id, task_deadline_at, result_payload, released_at, release_reason,
				       attempt_count
				FROM provider_call_reservations
				WHERE owner_type = ${input.ownerType}
				  AND owner_id = ${input.ownerId}
				  AND work_key = ${input.workKey}
				FOR UPDATE
			`);
		const existing = existingResult.rows[0] as
			| {
					id: string;
					provider: string;
					circuit_key: string;
					request_fingerprint: string;
					worker_id: string;
					lease_expires_at: Date | string | null;
					submission_started_at: Date | string | null;
					external_task_id: string | null;
					task_deadline_at: Date | string | null;
					result_payload: unknown | null;
					released_at: Date | string | null;
					release_reason: string | null;
					attempt_count: number;
			  }
			| undefined;

		if (existing) {
			if (existing.circuit_key !== input.circuitKey) {
				return { state: "conflict", id: existing.id };
			}
			const decision = decideExistingProviderReservation({
				existing: {
					id: existing.id,
					provider: existing.provider,
					requestFingerprint: existing.request_fingerprint,
					leaseExpiresAt: existing.lease_expires_at ? asDate(existing.lease_expires_at) : null,
					submissionStartedAt: existing.submission_started_at ? asDate(existing.submission_started_at) : null,
					externalTaskId: existing.external_task_id,
					taskDeadlineAt: existing.task_deadline_at ? asDate(existing.task_deadline_at) : null,
					result: existing.result_payload,
					releasedAt: existing.released_at ? asDate(existing.released_at) : null,
					releaseReason: existing.release_reason,
				},
				provider: input.provider,
				requestFingerprint: input.requestFingerprint,
				now,
			});

			if (decision.state === "cached") {
				if (!decision.released) {
					await tx.execute(sql`
						UPDATE provider_call_reservations
						SET worker_id = ${input.workerId}, lease_expires_at = ${leaseExpiresAt}, updated_at = ${now}
						WHERE id = ${existing.id}
					`);
				}
				return { ...decision, attemptCount: existing.attempt_count };
			}
			if (decision.state === "prepared") {
				preparedReservation = {
					id: existing.id,
					attemptCount: existing.attempt_count + 1,
				};
			} else if (decision.state === "expired") {
				await openProviderCircuitAfterTaskDeadline(tx, input.circuitKey, now);
				await tx.execute(sql`
						UPDATE provider_call_reservations
						SET released_at = ${now}, release_reason = 'provider task deadline exceeded',
						    released_by = 'scheduler',
						    lease_expires_at = NULL, updated_at = ${now}
						WHERE id = ${existing.id} AND released_at IS NULL
					`);
				return { state: "terminal", id: existing.id, reason: "provider task deadline exceeded" };
			} else if (decision.state === "resume") {
				await tx.execute(sql`
						UPDATE provider_call_reservations
						SET worker_id = ${input.workerId}, lease_expires_at = ${leaseExpiresAt},
						    attempt_count = attempt_count + 1, updated_at = ${now}
						WHERE id = ${existing.id} AND released_at IS NULL
					`);
				return {
					state: "ready",
					id: decision.id,
					externalTaskId: decision.externalTaskId,
					attemptCount: existing.attempt_count + 1,
				};
			} else {
				return decision;
			}
		}

		if (input.exclusiveOwner) {
			const conflicting = await tx.execute(sql`
				SELECT id,
				       GREATEST(
				         COALESCE(lease_expires_at, ${now}),
				         CASE
				           WHEN external_task_id IS NOT NULL
				             THEN COALESCE(task_deadline_at, submission_started_at + interval '24 hours')
				           WHEN submission_started_at IS NOT NULL
				             THEN submission_started_at + interval '24 hours'
				           ELSE ${now}
				         END
				       ) AS retry_at
				FROM provider_call_reservations
				WHERE owner_type = ${input.ownerType}
				  AND owner_id = ${input.ownerId}
				  AND work_key IS DISTINCT FROM ${input.workKey}
				  AND released_at IS NULL
				  AND result_payload IS NULL
				  AND (
				    lease_expires_at > ${now}
				    OR external_task_id IS NOT NULL
				    OR submission_started_at + interval '24 hours' > ${now}
				  )
				ORDER BY retry_at DESC
				LIMIT 1
				FOR UPDATE
			`);
			const conflict = conflicting.rows[0] as { id: string; retry_at: Date | string } | undefined;
			if (conflict) return { state: "busy", id: conflict.id, retryAt: asDate(conflict.retry_at) };
		}

		if (!preparedReservation && input.ownerMaxCalls !== undefined) {
			const usedResult = await tx.execute(sql`
						SELECT COUNT(*)::int AS used
						FROM provider_call_reservations
						WHERE owner_type = ${input.ownerType} AND owner_id = ${input.ownerId}
					`);
			const used = Number((usedResult.rows[0] as { used: number } | undefined)?.used ?? 0);
			if (used >= input.ownerMaxCalls) return { state: "budget", limit: input.ownerMaxCalls };
		}

		await tx.insert(providerHealth).values({ circuitKey: input.circuitKey }).onConflictDoNothing();
		const [health] = await tx
			.select()
			.from(providerHealth)
			.where(eq(providerHealth.circuitKey, input.circuitKey))
			.for("update");
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
			SELECT ${activeProviderCallCount(input.provider, now, admissionId)}::int AS active
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
				state: "ready",
				id: preparedReservation.id,
				externalTaskId: null,
				attemptCount: preparedReservation.attemptCount,
			};
		}

		await tx.insert(providerCallReservations).values({
			id,
			provider: input.provider,
			circuitKey: input.circuitKey,
			ownerType: input.ownerType,
			ownerId: input.ownerId,
			workKey: input.workKey,
			requestFingerprint: input.requestFingerprint,
			requestMetadata: input.requestMetadata,
			workerId: input.workerId,
			leaseExpiresAt,
			attemptCount: 1,
		});
		return { state: "ready", id, externalTaskId: null, attemptCount: 1 };
	});
}

/** Cross the durable prepared/submitted boundary immediately before network I/O. */
export async function beginProviderCallReservation(id: string, workerId: string): Promise<void> {
	const now = new Date();
	const updated = await db.execute(sql`
		UPDATE provider_call_reservations
		SET submission_started_at = COALESCE(submission_started_at, ${now}),
		    lease_expires_at = ${new Date(now.getTime() + RESERVATION_LEASE_MS)}, updated_at = ${now}
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		  AND lease_expires_at > ${now}
		  AND (submission_started_at IS NULL OR external_task_id IS NOT NULL)
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost provider reservation ${id} before submission`);
}

export async function checkpointProviderReservationTask(id: string, workerId: string, taskId: string): Promise<void> {
	const result = await db.execute(sql`
		UPDATE provider_call_reservations
		SET external_task_id = COALESCE(external_task_id, ${taskId}),
		    task_deadline_at = COALESCE(task_deadline_at, ${new Date(Date.now() + PROVIDER_TASK_DEADLINE_MS)}),
		    lease_expires_at = now() + interval '15 minutes', updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		RETURNING external_task_id
	`);
	const stored = (result.rows[0] as { external_task_id: string } | undefined)?.external_task_id;
	if (!stored) throw new Error(`Lost provider reservation ${id} while checkpointing task`);
	if (stored !== taskId) throw new Error(`Provider reservation task mismatch for ${id}`);
}

/** Yield an accepted task so a future job can resume the same provider ID. */
export async function deferProviderCallReservation(id: string, workerId: string, error: unknown): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE provider_call_reservations
		SET lease_expires_at = NULL, last_error = ${errorText(error)}, updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		  AND external_task_id IS NOT NULL AND result_payload IS NULL
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost provider reservation ${id} while deferring its accepted task`);
}

/** Atomically yield a resumable provider task and record its transport failure. */
export async function deferFailedProviderTaskReservation(input: {
	id: string;
	workerId: string;
	circuitKey: string;
	kind: "transient" | "fatal";
	error: unknown;
}): Promise<void> {
	const lastError = errorText(input.error);
	return retryDurableReservationTransition(() =>
		db.transaction(async (tx) => {
			const currentResult = await tx.execute(sql`
				SELECT worker_id, circuit_key, lease_expires_at, external_task_id,
				       result_payload, released_at, last_error
				FROM provider_call_reservations
				WHERE id = ${input.id}
				FOR UPDATE
			`);
			const current = currentResult.rows[0] as
				| {
						worker_id: string;
						circuit_key: string;
						lease_expires_at: Date | string | null;
						external_task_id: string | null;
						result_payload: unknown | null;
						released_at: Date | string | null;
						last_error: string | null;
				  }
				| undefined;
			if (
				!current ||
				current.circuit_key !== input.circuitKey ||
				current.released_at !== null ||
				current.external_task_id === null ||
				current.result_payload !== null
			) {
				throw new LostProviderReservationError(`Lost provider reservation ${input.id} while deferring its task`);
			}
			if (current.lease_expires_at === null && current.last_error === lastError) {
				return;
			}
			if (current.worker_id !== input.workerId) {
				throw new LostProviderReservationError(`Lost provider reservation ${input.id} while deferring its task`);
			}

			const now = new Date();
			await tx.execute(sql`
				UPDATE provider_call_reservations
				SET lease_expires_at = NULL, last_error = ${lastError}, updated_at = ${now}
				WHERE id = ${input.id} AND worker_id = ${input.workerId} AND released_at IS NULL
			`);
			await updateProviderFailure(tx, { ...input, runId: input.id }, now);
		}),
	);
}

/** Give back local preparation before any provider submission. */
export async function yieldPreparedProviderCallReservation(
	id: string,
	workerId: string,
	reason: string,
): Promise<void> {
	const updated = await db.execute(sql`
		UPDATE provider_call_reservations
		SET lease_expires_at = NULL, last_error = ${reason.slice(0, 4000)}, updated_at = now()
		WHERE id = ${id} AND worker_id = ${workerId} AND released_at IS NULL
		  AND submission_started_at IS NULL AND result_payload IS NULL
		RETURNING id
	`);
	if (updated.rows.length === 0) throw new Error(`Lost prepared provider reservation ${id} while yielding it`);
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

async function retryDurableReservationTransition<T>(operation: () => Promise<T>): Promise<T> {
	const delays = [1000, 2000, 5000, 10_000, 30_000];
	for (let attempt = 0; ; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (error instanceof LostProviderReservationError) throw error;
			const delay = delays[attempt];
			if (delay === undefined) throw error;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

/** Atomically retain a paid result, release its slot, and close its circuit probe. */
export async function completeProviderCallReservation(input: {
	id: string;
	workerId: string;
	circuitKey: string;
	result: unknown;
}): Promise<void> {
	await retryDurableReservationTransition(() =>
		db.transaction(async (tx) => {
			const now = new Date();
			const completed = await tx.execute(sql`
					UPDATE provider_call_reservations
					SET result_payload = CASE
					      WHEN released_at IS NULL THEN ${JSON.stringify(input.result)}::json
					      ELSE result_payload
					    END,
					    released_at = COALESCE(released_at, ${now}),
					    release_reason = 'completed',
					    released_by = COALESCE(released_by, ${input.workerId}),
					    lease_expires_at = NULL,
					    updated_at = ${now}
					WHERE id = ${input.id}
					  AND circuit_key = ${input.circuitKey}
					  AND (
					    (released_at IS NULL AND worker_id = ${input.workerId})
					    OR (
					      released_at IS NOT NULL AND release_reason = 'completed'
					      AND released_by = ${input.workerId}
					    )
					  )
					RETURNING id
				`);
			if (completed.rows.length === 0) {
				throw new LostProviderReservationError(`Lost provider reservation ${input.id} while completing it`);
			}
			await tx.execute(providerSuccessStatement(input.circuitKey, input.id, now));
		}),
	);
}

/** Atomically record a known-settled failure, release its slot, and update route health. */
export async function settleProviderCallFailure(input: {
	id: string;
	workerId: string;
	circuitKey: string;
	kind: "transient" | "fatal" | "local";
	error: unknown;
	reason: string;
}): Promise<void> {
	const lastError = errorText(input.error);
	return retryDurableReservationTransition(() =>
		db.transaction(async (tx) => {
			const currentResult = await tx.execute(sql`
				SELECT worker_id, circuit_key, released_at, release_reason, released_by, last_error
				FROM provider_call_reservations
				WHERE id = ${input.id}
				FOR UPDATE
			`);
			const current = currentResult.rows[0] as
				| {
						worker_id: string;
						circuit_key: string;
						released_at: Date | string | null;
						release_reason: string | null;
						released_by: string | null;
						last_error: string | null;
				  }
				| undefined;
			if (!current || current.circuit_key !== input.circuitKey) {
				throw new LostProviderReservationError(`Lost provider reservation ${input.id} while settling failure`);
			}
			if (current.released_at !== null) {
				if (
					current.release_reason === input.reason &&
					current.released_by === input.workerId &&
					current.last_error === lastError
				) {
					return;
				}
				throw new LostProviderReservationError(`Provider reservation ${input.id} was settled differently`);
			}
			if (current.worker_id !== input.workerId) {
				throw new LostProviderReservationError(`Lost provider reservation ${input.id} while settling failure`);
			}

			const now = new Date();
			await tx.execute(sql`
				UPDATE provider_call_reservations
				SET last_error = ${lastError}, released_at = ${now}, release_reason = ${input.reason},
				    released_by = ${input.workerId},
				    lease_expires_at = NULL, updated_at = ${now}
				WHERE id = ${input.id} AND worker_id = ${input.workerId} AND released_at IS NULL
			`);
			if (input.kind === "local") {
				await tx.execute(sql`
					UPDATE provider_health
					SET circuit_state = 'open', reopen_at = ${new Date(now.getTime() + 30_000)},
					    probe_run_id = NULL, updated_at = ${now}
					WHERE circuit_key = ${input.circuitKey}
						  AND circuit_state = 'half_open' AND probe_run_id = ${input.id}
					`);
				return;
			}
			await updateProviderFailure(
				tx,
				{
					circuitKey: input.circuitKey,
					runId: input.id,
					kind: input.kind,
					error: input.error,
				},
				now,
			);
		}),
	);
}

/**
 * Atomically quarantine a submission whose acceptance is unknown and record
 * the route failure. The reservation stays unreleased so its logical unit can
 * never be purchased again and continues to hold capacity for the safety
 * window derived from submission_started_at.
 */
export async function quarantineProviderCallReservation(input: {
	id: string;
	workerId: string;
	circuitKey: string;
	kind: "transient" | "fatal";
	error: unknown;
}): Promise<void> {
	const lastError = errorText(input.error);
	return retryDurableReservationTransition(() =>
		db.transaction(async (tx) => {
			const currentResult = await tx.execute(sql`
				SELECT worker_id, circuit_key, lease_expires_at, submission_started_at,
				       external_task_id, result_payload, released_at, last_error
				FROM provider_call_reservations
				WHERE id = ${input.id}
				FOR UPDATE
			`);
			const current = currentResult.rows[0] as
				| {
						worker_id: string;
						circuit_key: string;
						lease_expires_at: Date | string | null;
						submission_started_at: Date | string | null;
						external_task_id: string | null;
						result_payload: unknown | null;
						released_at: Date | string | null;
						last_error: string | null;
				  }
				| undefined;
			if (
				!current ||
				current.circuit_key !== input.circuitKey ||
				current.released_at !== null ||
				current.submission_started_at === null ||
				current.external_task_id !== null ||
				current.result_payload !== null
			) {
				throw new LostProviderReservationError(`Lost provider reservation ${input.id} while quarantining it`);
			}
			// An acknowledgement can be lost after COMMIT. Recognize the durable
			// transition so retrying this helper does not count the same failure twice.
			if (current.lease_expires_at === null && current.last_error === lastError) {
				return;
			}
			if (current.worker_id !== input.workerId) {
				throw new LostProviderReservationError(`Lost provider reservation ${input.id} while quarantining it`);
			}

			const now = new Date();
			await tx.execute(sql`
				UPDATE provider_call_reservations
				SET last_error = ${lastError}, lease_expires_at = NULL, updated_at = ${now}
				WHERE id = ${input.id} AND worker_id = ${input.workerId} AND released_at IS NULL
			`);
			await updateProviderFailure(
				tx,
				{
					circuitKey: input.circuitKey,
					runId: input.id,
					kind: input.kind,
					error: input.error,
				},
				now,
			);
		}),
	);
}

/** Recover only transitions that cannot purchase the same work twice. */
export async function recoverExpiredWork(now = new Date()): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`
			UPDATE prompt_execution_runs
			SET status = CASE
			      WHEN status = 'running' THEN 'pending'::prompt_execution_run_status
			      ELSE status
			    END,
			    available_at = CASE
			      WHEN status IN ('pending', 'running') THEN ${now}
			      ELSE available_at
			    END,
			    worker_id = NULL,
			    lease_expires_at = NULL,
			    updated_at = ${now}
			WHERE lease_expires_at <= ${now}
			  AND status IN ('pending', 'running', 'processing')
		`);
		await tx.execute(sql`
			UPDATE provider_call_reservations
			SET released_at = ${now}, release_reason = 'legacy cutover quarantine expired',
			    released_by = 'scheduler', lease_expires_at = NULL, updated_at = ${now}
			WHERE provider = 'legacy-unknown' AND circuit_key = 'legacy-unknown'
			  AND owner_type = 'analyze-brand' AND work_key = 'legacy-cutover'
			  AND released_at IS NULL AND submission_started_at + interval '24 hours' <= ${now}
		`);
		const expiredRoutes = await tx.execute(sql`
			SELECT DISTINCT reservation.circuit_key
			FROM provider_call_reservations reservation
			WHERE reservation.released_at IS NULL AND reservation.external_task_id IS NOT NULL
			  AND reservation.result_payload IS NULL
			  AND reservation.task_deadline_at IS NOT NULL AND reservation.task_deadline_at <= ${now}
			  AND (reservation.lease_expires_at IS NULL OR reservation.lease_expires_at <= ${now})
			ORDER BY reservation.circuit_key
		`);
		for (const route of expiredRoutes.rows as Array<{ circuit_key: string }>) {
			await openProviderCircuitAfterTaskDeadline(tx, route.circuit_key, now);
		}
		await tx.execute(sql`
			WITH skipped AS (
			UPDATE prompt_execution_runs r
			SET status = 'skipped',
			    failure_kind = CASE
			      WHEN e.not_after <= ${now} THEN 'execution_window_expired'
			      ELSE 'prompt_disabled'
			    END,
			    error_message = CASE
			      WHEN e.not_after <= ${now} THEN 'Execution window ended before this run could be admitted'
			      ELSE 'Prompt or brand was deleted or disabled before provider submission'
			    END,
			    worker_id = NULL, lease_expires_at = NULL, completed_at = ${now}, updated_at = ${now}
			FROM prompt_executions e
			WHERE e.id = r.execution_id AND r.status = 'pending'
			  AND r.worker_id IS NULL
			  AND NOT EXISTS (
			    SELECT 1
			    FROM provider_call_reservations reservation
			    WHERE reservation.owner_type = 'prompt-run'
			      AND reservation.owner_id = r.id::text
			      AND reservation.work_key = 'provider'
			      AND reservation.submission_started_at IS NOT NULL
			  )
			  AND NOT EXISTS (
			    SELECT 1
			    FROM provider_call_reservations reservation
			    WHERE reservation.owner_type = 'prompt-run'
			      AND reservation.owner_id = r.id::text
			      AND reservation.work_key = 'provider'
			      AND reservation.released_at IS NULL
			      AND reservation.lease_expires_at > ${now}
			  )
			  AND (
			    e.not_after <= ${now}
			    OR NOT EXISTS (
			      SELECT 1
			      FROM prompts p
			      JOIN brands b ON b.id = p.brand_id
			      WHERE p.id = e.prompt_id AND p.enabled = true AND b.enabled = true
			    )
			  )
			RETURNING r.id
			)
			SELECT COUNT(*) AS skipped_count FROM skipped
		`);
		await tx.execute(sql`
			WITH released AS (
				UPDATE provider_call_reservations reservation
				SET released_at = ${now},
				    release_reason = 'prompt run ended before provider submission',
				    released_by = 'scheduler',
				    lease_expires_at = NULL,
				    updated_at = ${now}
				FROM prompt_execution_runs owner
				WHERE reservation.owner_type = 'prompt-run'
				  AND reservation.owner_id = owner.id::text
				  AND reservation.work_key = 'provider'
				  AND reservation.released_at IS NULL
				  AND reservation.submission_started_at IS NULL
				  AND reservation.result_payload IS NULL
				  AND (reservation.lease_expires_at IS NULL OR reservation.lease_expires_at <= ${now})
				  AND owner.status IN ('succeeded', 'failed', 'skipped')
				RETURNING reservation.id, reservation.circuit_key
			), cleared_probes AS (
				UPDATE provider_health health
				SET circuit_state = 'open', reopen_at = ${now}, probe_run_id = NULL, updated_at = ${now}
				FROM released
				WHERE health.circuit_state = 'half_open' AND health.probe_run_id = released.id
				RETURNING health.circuit_key
			)
			SELECT (SELECT COUNT(*) FROM released) AS released_count,
			       (SELECT COUNT(*) FROM cleared_probes) AS cleared_probe_count
		`);
		await tx.execute(sql`
			UPDATE provider_call_reservations
			SET released_at = ${now}, release_reason = 'provider task deadline exceeded',
			    released_by = 'scheduler',
			    lease_expires_at = NULL, updated_at = ${now}
				WHERE released_at IS NULL AND external_task_id IS NOT NULL
				  AND result_payload IS NULL
				  AND task_deadline_at IS NOT NULL AND task_deadline_at <= ${now}
				  AND (lease_expires_at IS NULL OR lease_expires_at <= ${now})
			`);
		await tx.execute(sql`
			UPDATE provider_health h
			SET circuit_state = 'closed', consecutive_failures = 0, opened_at = NULL,
			    reopen_at = NULL, probe_run_id = NULL, updated_at = ${now}
			FROM (
			  SELECT reservation.id
			  FROM provider_call_reservations reservation
			  WHERE reservation.result_payload IS NOT NULL
			    AND COALESCE(reservation.result_payload->>'rawResponseOnly', 'false') <> 'true'
			) successful
			WHERE h.circuit_state = 'half_open' AND successful.id = h.probe_run_id
		`);
		await tx.execute(sql`
			UPDATE provider_health h
			SET circuit_state = 'open', reopen_at = ${now}, probe_run_id = NULL, updated_at = ${now}
			WHERE h.circuit_state = 'half_open'
			  AND NOT EXISTS (
			    SELECT 1 FROM provider_call_reservations reservation
			    WHERE reservation.id = h.probe_run_id AND reservation.released_at IS NULL
			      AND (
			        (
			          COALESCE(reservation.result_payload->>'rawResponseOnly', 'false') = 'true'
			          AND reservation.lease_expires_at > ${now}
			        )
			        OR (
			          reservation.result_payload IS NULL
			          AND (
			            reservation.lease_expires_at > ${now}
			            OR reservation.external_task_id IS NOT NULL
			            OR reservation.submission_started_at + interval '24 hours' > ${now}
			          )
			        )
			      )
			  )
		`);
	});
	await finalizeReadyExecutions(null, now);
}

export async function releaseResumableWork(workerId: string, now = new Date()): Promise<void> {
	await db.execute(sql`
		UPDATE prompt_execution_runs
		SET status = CASE
		      WHEN status = 'running' THEN 'pending'::prompt_execution_run_status
		      ELSE status
		    END,
		    available_at = CASE
		      WHEN status IN ('pending', 'running') THEN ${now}
		      ELSE available_at
		    END,
		    worker_id = NULL,
		    lease_expires_at = NULL,
		    updated_at = ${now}
			WHERE worker_id = ${workerId}
			  AND status IN ('pending', 'running', 'processing')
	`);
}

export async function finalizeReadyExecutions(executionId: string | null = null, now = new Date()): Promise<void> {
	await db.execute(sql`
		WITH aggregate AS (
				SELECT e.id,
				       COUNT(r.id)::int AS total,
				       COUNT(*) FILTER (WHERE r.status = 'succeeded')::int AS succeeded,
				       COUNT(*) FILTER (WHERE r.status = 'failed')::int AS failed,
				       COUNT(*) FILTER (WHERE r.status = 'skipped')::int AS skipped,
				       LEFT(STRING_AGG(DISTINCT r.error_message, '; ') FILTER (WHERE r.error_message IS NOT NULL), 4000)
				         AS errors
				FROM prompt_executions e
				LEFT JOIN prompt_execution_runs r ON r.execution_id = e.id
				WHERE e.status = 'running'
				  AND (${executionId}::uuid IS NULL OR e.id = ${executionId})
				GROUP BY e.id
				HAVING COUNT(*) FILTER (WHERE r.status IN ('pending', 'running', 'processing')) = 0
		), finalized AS (
				UPDATE prompt_executions e
				SET status = CASE
				      WHEN a.total = 0 OR a.skipped = a.total THEN 'skipped'::prompt_execution_status
				      WHEN a.succeeded = a.total THEN 'succeeded'::prompt_execution_status
				      WHEN a.succeeded > 0 THEN 'partial'::prompt_execution_status
				      ELSE 'failed'::prompt_execution_status
				    END,
				    total_runs = a.total, succeeded_runs = a.succeeded, failed_runs = a.failed,
				    skipped_runs = a.skipped,
				    error_summary = a.errors, completed_at = ${now}, updated_at = ${now},
				    context_payload = CASE
				        WHEN EXISTS (SELECT 1 FROM prompts p WHERE p.id = e.prompt_id) THEN e.context_payload
				        ELSE NULL
				      END
				FROM aggregate a
				WHERE e.id = a.id AND e.status = 'running'
				RETURNING e.prompt_id, e.status
		), schedules AS (
			UPDATE prompt_schedules schedule
			SET consecutive_failures = CASE
			      WHEN finalized.status = 'failed' THEN schedule.consecutive_failures + 1
			      WHEN finalized.status IN ('succeeded', 'partial') THEN 0
			      ELSE schedule.consecutive_failures
			    END,
			    admission_paused_until = CASE
			      WHEN finalized.status = 'failed' THEN ${now} + make_interval(
			        hours => LEAST(168, 24 * power(2, LEAST(schedule.consecutive_failures, 3)))::int
			      )
			      WHEN finalized.status IN ('succeeded', 'partial') THEN NULL
			      ELSE schedule.admission_paused_until
			    END,
			    pause_reason = CASE
			      WHEN finalized.status = 'failed'
			        THEN 'Execution produced no persisted result; automatic spend backoff is active'
			      WHEN finalized.status IN ('succeeded', 'partial') THEN NULL
			      ELSE schedule.pause_reason
			    END,
			    updated_at = ${now}
			FROM finalized
			WHERE schedule.prompt_id = finalized.prompt_id
			RETURNING schedule.prompt_id
		)
		SELECT COUNT(*) FROM schedules
	`);
}
