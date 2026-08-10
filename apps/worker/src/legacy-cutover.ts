import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import {
	ANALYZE_BRAND_GENERATION_DEADLINE_MS,
	ANALYZE_BRAND_QUEUE,
	ANALYZE_BRAND_QUEUE_OPTIONS,
	REPORT_GENERATION_DEADLINE_MS,
	REPORT_QUEUE,
	REPORT_QUEUE_OPTIONS,
} from "@workspace/lib/scheduler";
import { sql } from "drizzle-orm";
import boss from "./boss";

const LEGACY_CONFIRMATION = "CONFIRM_LEGACY_PAID_WORKERS_STOPPED";

export async function closeLegacyPaidAdmission(): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`
			INSERT INTO worker_scheduler_control (id) VALUES ('global') ON CONFLICT (id) DO NOTHING
		`);
		await tx.execute(sql`
			SELECT id FROM worker_scheduler_control WHERE id = 'global' FOR UPDATE
		`);
		const trigger = await tx.execute(sql`
			SELECT to_regclass('pgboss.job') IS NOT NULL AS table_exists,
			       EXISTS (
			  SELECT 1
			  FROM pg_trigger
			  WHERE tgname = 'reject_legacy_paid_admission'
			    AND tgrelid = to_regclass('pgboss.job')
			    AND NOT tgisinternal
			) AS installed
		`);
		const state = trigger.rows[0] as { table_exists: boolean; installed: boolean } | undefined;
		if (state?.table_exists && !state.installed) {
			await tx.execute(sql`
				CREATE TRIGGER reject_legacy_paid_admission
				BEFORE INSERT OR UPDATE ON pgboss.job
				FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_paid_admission()
			`);
		}
		await tx.execute(sql`
			UPDATE worker_scheduler_control
			SET admission_closed_at = COALESCE(admission_closed_at, now())
			WHERE id = 'global'
		`);
	});
}

async function retireLegacySchedules(): Promise<void> {
	for (const schedule of await boss.getSchedules("process-prompt")) {
		await boss.unschedule(schedule.name, schedule.key ?? undefined);
	}
	await boss.unschedule("schedule-maintenance");
}

async function handOffLegacyPaidWork(): Promise<"already-complete" | "fresh-install" | "migrated"> {
	const now = new Date();
	const defaultCadenceHours = getDefaultDelayHours();

	return db.transaction(async (tx) => {
		const control = await tx.execute(sql`
			SELECT cutover_completed_at
			FROM worker_scheduler_control
			WHERE id = 'global'
			FOR UPDATE
		`);
		if ((control.rows[0] as { cutover_completed_at: Date | string | null } | undefined)?.cutover_completed_at) {
			return "already-complete";
		}

		const legacyQueues = await tx.execute(sql`
			SELECT EXISTS (
			  SELECT 1 FROM pgboss.queue
			  WHERE name IN ('process-prompt', 'generate-report', 'analyze-brand')
			) AS exists
		`);
		const upgrading = Boolean((legacyQueues.rows[0] as { exists: boolean } | undefined)?.exists);
		if (upgrading && process.env[LEGACY_CONFIRMATION] !== "1") {
			throw new Error(
				"Legacy paid queues were found. Stop every worker running the pre-cutover release, then restart one " +
					`worker with ${LEGACY_CONFIRMATION}=1. Never set it while an old provider callback may still be running.`,
			);
		}

		if (upgrading) {
			// A cadence shorter than the ambiguity quarantine must not admit a
			// replacement while an uncheckpointed legacy call may still settle.
			await tx.execute(sql`
				WITH legacy_prompts AS (
					SELECT DISTINCT data->>'promptId' AS prompt_id
					FROM pgboss.job
					WHERE name = 'process-prompt' AND data->>'promptId' IS NOT NULL
				), resume_at AS (
					SELECT p.id AS prompt_id,
					       ${now} + make_interval(hours => GREATEST(24, CASE
					         WHEN b.delay_override_hours > 0 THEN b.delay_override_hours
					         ELSE ${defaultCadenceHours}
					       END)) AS value
					FROM legacy_prompts legacy
					JOIN prompts p ON p.id::text = legacy.prompt_id
					JOIN brands b ON b.id = p.brand_id
				)
				INSERT INTO prompt_schedules (
					prompt_id, next_run_at, admission_paused_until,
					pause_reason, created_at, updated_at
				)
				SELECT prompt_id,
				       value,
				       value,
				       'Waiting through legacy paid-work ambiguity quarantine',
				       ${now}, ${now}
				FROM resume_at
				ON CONFLICT (prompt_id) DO UPDATE
				SET next_run_at = EXCLUDED.next_run_at,
				    lease_owner = NULL,
				    lease_expires_at = NULL,
				    admission_paused_until = EXCLUDED.admission_paused_until,
				    pause_reason = EXCLUDED.pause_reason,
				    updated_at = EXCLUDED.updated_at
			`);

			// A stopped legacy analysis may have purchased work without recording a
			// task ID. Quarantine a full day from confirmed shutdown because the
			// legacy job timestamp cannot reveal its last provider submission.
			await tx.execute(sql`
				WITH recent_legacy_analyses AS (
					SELECT DISTINCT ON (job.data->>'brandId')
					       job.id,
					       job.state,
					       job.data->>'brandId' AS brand_id,
					       COALESCE(job.completed_on, job.started_on, job.created_on) AS activity_at
					FROM pgboss.job job
					WHERE job.name = 'analyze-brand'
					  AND job.state <> 'created'
					  AND job.data->>'brandId' IS NOT NULL
					  AND (
					    job.state IN ('active', 'retry')
					    OR COALESCE(job.completed_on, job.started_on, job.created_on)
					       + interval '24 hours' > ${now}
					  )
					ORDER BY job.data->>'brandId',
					         COALESCE(job.completed_on, job.started_on, job.created_on) DESC,
					         job.id DESC
				)
				INSERT INTO provider_call_reservations (
					provider, circuit_key, owner_type, owner_id, work_key,
					request_fingerprint, request_metadata, worker_id,
					submission_started_at, attempt_count, last_error, created_at, updated_at
				)
				SELECT 'legacy-unknown', 'legacy-unknown', 'analyze-brand', brand_id, 'legacy-cutover',
				       'legacy-cutover:' || brand_id,
				       json_build_object(
				         'kind', 'legacy-cutover',
				         'brandId', brand_id,
				         'legacyJobId', id,
				         'legacyState', state,
				         'activityAt', activity_at
				       ),
				       'legacy-cutover', ${now}, 1,
				       'Legacy analysis may have reached its provider; replacement is quarantined',
				       ${now}, ${now}
				FROM recent_legacy_analyses
				ON CONFLICT (owner_type, owner_id, work_key) DO NOTHING
			`);

			// Never replay a report whose legacy generation may already have paid
			// for some or all of its immutable plan.
			await tx.execute(sql`
				WITH risky_reports AS (
					SELECT DISTINCT data->>'reportId' AS owner_id
					FROM pgboss.job
					WHERE name = 'generate-report' AND state <> 'created'
					  AND data->>'reportId' IS NOT NULL
				)
				DELETE FROM pgboss.job queued
				WHERE (
				    queued.state = 'created'
				    OR (queued.state = 'retry' AND queued.name = ${REPORT_QUEUE})
				  )
				  AND queued.name IN ('generate-report', ${REPORT_QUEUE})
				  AND queued.data->>'reportId' IN (SELECT owner_id FROM risky_reports)
			`);
			await tx.execute(sql`
				UPDATE reports report
				SET status = 'failed', updated_at = ${now}
				FROM pgboss.job job
				WHERE job.name = 'generate-report' AND job.state <> 'created'
				  AND job.data->>'reportId' = report.id::text
				  AND report.status <> 'completed'
			`);
			await tx.execute(sql`
				UPDATE pgboss.job
				SET state = 'failed', completed_on = ${now},
				    output = jsonb_build_object(
				      'error', 'Legacy paid attempt was not replayed during the durable-scheduler cutover'
				    )
				WHERE name IN ('process-prompt', 'generate-report', 'analyze-brand')
				  AND state IN ('active', 'retry')
			`);
			await tx.execute(sql`
				DELETE FROM pgboss.job
				WHERE (name = 'process-prompt' AND state = 'created')
				   OR (name = 'schedule-maintenance' AND state IN ('created', 'active', 'retry'))
			`);

			// Preserve unstarted user work, preferring an already-versioned job.
			await tx.execute(sql`
				WITH ranked AS (
					SELECT id,
					       ROW_NUMBER() OVER (
					         PARTITION BY
					           CASE WHEN name IN ('generate-report', ${REPORT_QUEUE}) THEN 'report' ELSE 'analysis' END,
					           CASE
					             WHEN name IN ('generate-report', ${REPORT_QUEUE}) THEN data->>'reportId'
					             ELSE data->>'brandId'
					           END,
					           CASE WHEN name IN ('analyze-brand', ${ANALYZE_BRAND_QUEUE}) THEN data->>'website' ELSE NULL END
					         ORDER BY
					           (name IN (${REPORT_QUEUE}, ${ANALYZE_BRAND_QUEUE})) DESC,
					           created_on DESC,
					           id DESC
					       ) AS row_number
					FROM pgboss.job
					WHERE name IN ('generate-report', ${REPORT_QUEUE}, 'analyze-brand', ${ANALYZE_BRAND_QUEUE})
					  AND state = 'created'
					  AND COALESCE(data->>'reportId', data->>'brandId') IS NOT NULL
				)
				DELETE FROM pgboss.job duplicate
				USING ranked
				WHERE duplicate.id = ranked.id AND ranked.row_number > 1
			`);
			await tx.execute(sql`
				UPDATE pgboss.job
				SET name = CASE name
				      WHEN 'generate-report' THEN ${REPORT_QUEUE}
				      WHEN 'analyze-brand' THEN ${ANALYZE_BRAND_QUEUE}
				    END,
				    data = CASE name
				      WHEN 'generate-report' THEN COALESCE(data, '{}'::jsonb) || jsonb_build_object(
				        'generationDeadlineAt',
				        created_on + ${REPORT_GENERATION_DEADLINE_MS} * interval '1 millisecond'
				      )
				      WHEN 'analyze-brand' THEN COALESCE(data, '{}'::jsonb) || jsonb_build_object(
				        'generationDeadlineAt',
				        created_on + ${ANALYZE_BRAND_GENERATION_DEADLINE_MS} * interval '1 millisecond',
				        'requestId', COALESCE(data->>'requestId', id::text)
				      )
				    END,
				    retry_limit = CASE name
				      WHEN 'generate-report' THEN ${REPORT_QUEUE_OPTIONS.retryLimit}
				      ELSE ${ANALYZE_BRAND_QUEUE_OPTIONS.retryLimit}
				    END,
				    retry_delay = CASE name
				      WHEN 'generate-report' THEN ${REPORT_QUEUE_OPTIONS.retryDelay}
				      ELSE ${ANALYZE_BRAND_QUEUE_OPTIONS.retryDelay}
				    END,
				    retry_backoff = CASE name
				      WHEN 'generate-report' THEN ${REPORT_QUEUE_OPTIONS.retryBackoff}
				      ELSE ${ANALYZE_BRAND_QUEUE_OPTIONS.retryBackoff}
				    END,
				    retry_delay_max = CASE name
				      WHEN 'generate-report' THEN ${REPORT_QUEUE_OPTIONS.retryDelayMax}
				      ELSE ${ANALYZE_BRAND_QUEUE_OPTIONS.retryDelayMax}
				    END,
				    expire_seconds = CASE name
				      WHEN 'generate-report' THEN ${REPORT_QUEUE_OPTIONS.expireInSeconds}
				      ELSE ${ANALYZE_BRAND_QUEUE_OPTIONS.expireInSeconds}
				    END,
				    heartbeat_seconds = CASE name
				      WHEN 'generate-report' THEN ${REPORT_QUEUE_OPTIONS.heartbeatSeconds}
				      ELSE ${ANALYZE_BRAND_QUEUE_OPTIONS.heartbeatSeconds}
				    END
				WHERE name IN ('generate-report', 'analyze-brand') AND state = 'created'
			`);
		}

		await tx.execute(sql`
			UPDATE worker_scheduler_control
			SET cutover_completed_at = ${now}
			WHERE id = 'global'
		`);
		return upgrading ? "migrated" : "fresh-install";
	});
}

export async function cutOverLegacyPaidWork(): Promise<void> {
	await closeLegacyPaidAdmission();
	await retireLegacySchedules();
	const result = await handOffLegacyPaidWork();
	console.log(
		result === "migrated"
			? "Legacy paid work handed off; reservation-aware workers may start"
			: "Legacy paid-work cutover is complete",
	);
}
