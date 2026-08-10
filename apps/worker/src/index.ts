import * as Sentry from "@sentry/node";
import { getDefaultDelayHours, RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { workerSchedulerControl } from "@workspace/lib/db/schema";
import { getProvider, parseScrapeTargets, validateScrapeTargets } from "@workspace/lib/providers";
import {
	ANALYZE_BRAND_QUEUE,
	ANALYZE_BRAND_QUEUE_OPTIONS,
	getPromptMaxProviderCalls,
	REPORT_QUEUE,
	REPORT_QUEUE_OPTIONS,
} from "@workspace/lib/scheduler";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import { eq, sql } from "drizzle-orm";
import boss from "./boss";
import { registerHandlers } from "./handlers";
import { DurablePromptScheduler } from "./scheduler";
import { shutdownTelemetry } from "./telemetry";

const promptScheduler = new DurablePromptScheduler();
async function createPaidQueues(): Promise<void> {
	await boss.createQueue(REPORT_QUEUE, REPORT_QUEUE_OPTIONS);
	await boss.updateQueue(REPORT_QUEUE, REPORT_QUEUE_OPTIONS);
	await boss.createQueue(ANALYZE_BRAND_QUEUE, ANALYZE_BRAND_QUEUE_OPTIONS);
	await boss.updateQueue(ANALYZE_BRAND_QUEUE, ANALYZE_BRAND_QUEUE_OPTIONS);
}

async function closeLegacyPromptAdmission(): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo_legacy_prompt_fence'))`);
		await tx.insert(workerSchedulerControl).values({ id: "global" }).onConflictDoNothing();
		await tx
			.update(workerSchedulerControl)
			.set({
				legacyPromptAdmissionOpen: false,
				closedAt: new Date(),
				closedBy: promptScheduler.workerId,
				updatedAt: new Date(),
			})
			.where(
				sql`${workerSchedulerControl.id} = 'global' AND ${workerSchedulerControl.legacyPromptAdmissionOpen} = true`,
			);
	});
	console.log("Closed database admission for legacy paid-work queues");
}

async function ensureLegacyAdmissionFence(): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo_legacy_prompt_fence'))`);
		const result = await tx.execute(sql`
			SELECT EXISTS (
			  SELECT 1
			  FROM pg_trigger
			  WHERE tgname = 'reject_legacy_paid_admission'
			    AND tgrelid = 'pgboss.job'::regclass
			    AND NOT tgisinternal
			) AS installed
		`);
		if ((result.rows[0] as { installed: boolean } | undefined)?.installed) return;
		// Fresh databases can create pg-boss after application migrations. Existing
		// production databases receive this trigger in the scheduler migration.
		await tx.execute(sql`
			CREATE TRIGGER reject_legacy_paid_admission
			BEFORE INSERT OR UPDATE ON pgboss.job
			FOR EACH ROW EXECUTE FUNCTION public.reject_legacy_paid_admission()
		`);
	});
}

async function retireLegacySchedules(): Promise<void> {
	for (const schedule of await boss.getSchedules("process-prompt")) {
		await boss.unschedule(schedule.name, schedule.key ?? undefined);
	}
	await boss.unschedule("schedule-maintenance");
}

async function handoffLegacyPaidWork(): Promise<{
	drained: boolean;
	active: number;
	confirmationRequired: boolean;
}> {
	const now = new Date();
	const defaultCadenceHours = getDefaultDelayHours();
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo_legacy_paid_handoff'))`);
		const control = await tx.execute(sql`
			SELECT closed_at, legacy_prompt_drained_at
			FROM worker_scheduler_control
			WHERE id = 'global'
			FOR UPDATE
		`);
		const controlRow = control.rows[0] as
			| {
					closed_at: Date | string | null;
					legacy_prompt_drained_at: Date | string | null;
			  }
			| undefined;
		if (controlRow?.legacy_prompt_drained_at) {
			return { drained: true, active: 0, confirmationRequired: false };
		}
		const closedAt = controlRow?.closed_at ? new Date(controlRow.closed_at) : now;
		const legacyEvidenceSince = new Date(closedAt.getTime() - 60 * 60 * 1000);
		const legacyQueues = await tx.execute(sql`
			SELECT EXISTS (
			  SELECT 1 FROM pgboss.queue
			  WHERE name IN ('process-prompt', 'generate-report', 'analyze-brand')
			) AS exists
		`);
		const upgradingLegacyDeployment = Boolean((legacyQueues.rows[0] as { exists: boolean } | undefined)?.exists);

		const transfer = async () => {
			// An active/retried/recently-finished legacy attempt may already have
			// spent money. Consume its durable intent and wait one full cadence.
			await tx.execute(sql`
				WITH consumed AS (
					SELECT DISTINCT data->>'promptId' AS prompt_id
					FROM pgboss.job
					WHERE name = 'process-prompt'
					  AND data->>'promptId' IS NOT NULL
					  AND (
					    state IN ('active', 'retry')
						    OR (
						      state IN ('completed', 'failed')
						      AND COALESCE(completed_on, started_on, created_on) >= ${legacyEvidenceSince}
						    )
					  )
				)
				INSERT INTO prompt_schedules (
					prompt_id, next_run_at, run_requested_at, last_started_at, created_at, updated_at
				)
				SELECT p.id,
				       ${now} + make_interval(hours => CASE
				         WHEN b.delay_override_hours > 0 THEN b.delay_override_hours
				         ELSE ${defaultCadenceHours}
				       END),
				       NULL, ${now}, ${now}, ${now}
				FROM consumed c
				JOIN prompts p ON p.id::text = c.prompt_id
				JOIN brands b ON b.id = p.brand_id
				WHERE p.enabled = true AND b.enabled = true
				ON CONFLICT (prompt_id) DO UPDATE
				SET next_run_at = EXCLUDED.next_run_at,
				    run_requested_at = prompt_schedules.run_requested_at,
				    lease_owner = NULL,
				    lease_expires_at = NULL,
				    last_started_at = EXCLUDED.last_started_at,
				    updated_at = EXCLUDED.updated_at
			`);
			await tx.execute(sql`
				WITH consumed AS (
					SELECT DISTINCT data->>'promptId' AS prompt_id
					FROM pgboss.job
					WHERE name = 'process-prompt'
					  AND data->>'promptId' IS NOT NULL
					  AND (
					    state IN ('active', 'retry')
					    OR (
					      state IN ('completed', 'failed')
					      AND COALESCE(completed_on, started_on, created_on) >= ${legacyEvidenceSince}
					    )
					  )
				)
				DELETE FROM pgboss.job queued
				USING consumed
				WHERE queued.name = 'process-prompt' AND queued.state = 'created'
				  AND queued.data->>'promptId' = consumed.prompt_id
			`);

			// Created jobs have not spent yet and retain their original deadline.
			// Retry jobs are treated as consumed, then removed so they cannot replay.
			await tx.execute(sql`
				WITH queued AS MATERIALIZED (
					SELECT id, data->>'promptId' AS prompt_id, state, start_after
					FROM pgboss.job
					WHERE name = 'process-prompt'
					  AND state IN ('created', 'retry')
					  AND data->>'promptId' IS NOT NULL
					FOR UPDATE
				), per_prompt AS (
					SELECT prompt_id,
					       BOOL_OR(state = 'retry') AS consumed,
					       MIN(start_after) FILTER (WHERE state = 'created') AS queued_for
					FROM queued
					GROUP BY prompt_id
				), transferred AS (
					INSERT INTO prompt_schedules (
						prompt_id, next_run_at, run_requested_at, last_started_at, created_at, updated_at
					)
					SELECT p.id,
					       CASE WHEN q.consumed THEN
					         ${now} + make_interval(hours => CASE
					           WHEN b.delay_override_hours > 0 THEN b.delay_override_hours
					           ELSE ${defaultCadenceHours}
					         END)
					       ELSE COALESCE(q.queued_for, ${now}) END,
					       NULL,
					       CASE WHEN q.consumed THEN ${now} ELSE NULL END,
					       ${now}, ${now}
					FROM per_prompt q
					JOIN prompts p ON p.id::text = q.prompt_id
					JOIN brands b ON b.id = p.brand_id
					WHERE p.enabled = true AND b.enabled = true
					ON CONFLICT (prompt_id) DO UPDATE
					SET next_run_at = CASE
					      WHEN EXCLUDED.last_started_at IS NOT NULL THEN EXCLUDED.next_run_at
					      ELSE LEAST(prompt_schedules.next_run_at, EXCLUDED.next_run_at)
					    END,
				    run_requested_at = prompt_schedules.run_requested_at,
					    last_started_at = COALESCE(EXCLUDED.last_started_at, prompt_schedules.last_started_at),
					    lease_owner = NULL,
					    lease_expires_at = NULL,
					    updated_at = EXCLUDED.updated_at
					RETURNING prompt_id
				), deleted AS (
					DELETE FROM pgboss.job j
					USING queued q
					WHERE j.id = q.id
					RETURNING j.id
				)
				SELECT COUNT(*) FROM deleted
			`);

			// Unstarted report/onboarding work moves to versioned queues that only
			// reservation-aware workers consume. A retry may already have spent, so
			// it is failed closed instead of migrated.
			await tx.execute(sql`
				DELETE FROM pgboss.job legacy
				USING pgboss.job durable
				WHERE legacy.state = 'created' AND durable.state IN ('created', 'retry')
				  AND (
				    (legacy.name = 'generate-report' AND durable.name = 'generate-report-v2'
				      AND legacy.data->>'reportId' = durable.data->>'reportId')
				    OR (legacy.name = 'analyze-brand' AND durable.name = 'analyze-brand-v2'
				      AND legacy.data->>'brandId' = durable.data->>'brandId')
				  )
			`);
			await tx.execute(sql`
				WITH ranked AS (
					SELECT id,
					       ROW_NUMBER() OVER (
					         PARTITION BY
					           CASE WHEN name IN ('generate-report', 'generate-report-v2') THEN 'report' ELSE 'analysis' END,
					           CASE
					             WHEN name IN ('generate-report', 'generate-report-v2') THEN data->>'reportId'
					             ELSE data->>'brandId'
					           END
					         ORDER BY created_on DESC, id DESC
					       ) AS row_number
					FROM pgboss.job
					WHERE name IN ('generate-report', 'generate-report-v2', 'analyze-brand', 'analyze-brand-v2')
					  AND state = 'created'
					  AND COALESCE(data->>'reportId', data->>'brandId') IS NOT NULL
				)
				DELETE FROM pgboss.job duplicate
				USING ranked
				WHERE duplicate.id = ranked.id AND ranked.row_number > 1
			`);
			await tx.execute(sql`
				WITH legacy_report AS (
					SELECT DISTINCT data->>'reportId' AS owner_id
					FROM pgboss.job
					WHERE name = 'generate-report' AND data->>'reportId' IS NOT NULL
					  AND (
					    state IN ('active', 'retry')
					    OR (state IN ('completed', 'failed')
					      AND COALESCE(completed_on, started_on, created_on) >= ${legacyEvidenceSince})
					  )
				), legacy_analysis AS (
					SELECT DISTINCT data->>'brandId' AS owner_id
					FROM pgboss.job
					WHERE name = 'analyze-brand' AND data->>'brandId' IS NOT NULL
					  AND (
					    state IN ('active', 'retry')
					    OR (state IN ('completed', 'failed')
					      AND COALESCE(completed_on, started_on, created_on) >= ${legacyEvidenceSince})
					  )
				)
				DELETE FROM pgboss.job queued
				WHERE (
				    queued.state = 'created'
				    OR (queued.state = 'retry' AND queued.name IN ('generate-report-v2', 'analyze-brand-v2'))
				  )
				  AND (
				    (queued.name IN ('generate-report', 'generate-report-v2')
				      AND queued.data->>'reportId' IN (SELECT owner_id FROM legacy_report))
				    OR (queued.name IN ('analyze-brand', 'analyze-brand-v2')
				      AND queued.data->>'brandId' IN (SELECT owner_id FROM legacy_analysis))
				  )
			`);
			await tx.execute(sql`
				UPDATE reports report
				SET status = 'failed', updated_at = ${now}
				FROM pgboss.job job
				WHERE job.name = 'generate-report' AND job.state = 'retry'
				  AND job.data->>'reportId' = report.id::text
				  AND report.status <> 'completed'
			`);
			await tx.execute(sql`
				UPDATE pgboss.job
				SET state = 'failed', completed_on = ${now},
				    output = jsonb_build_object(
				      'error', 'Legacy paid attempt was not replayed during the durable-scheduler cutover'
				    )
				WHERE name IN ('generate-report', 'analyze-brand') AND state = 'retry'
			`);
			await tx.execute(sql`
				UPDATE pgboss.job
				SET name = CASE name
				      WHEN 'generate-report' THEN 'generate-report-v2'
				      WHEN 'analyze-brand' THEN 'analyze-brand-v2'
				    END,
				    retry_limit = CASE name WHEN 'generate-report' THEN 10 ELSE 3 END,
				    retry_delay = 60,
				    retry_backoff = true,
				    retry_delay_max = CASE name WHEN 'generate-report' THEN 3600 ELSE 900 END,
				    expire_seconds = CASE name WHEN 'generate-report' THEN 86400 ELSE 900 END,
				    heartbeat_seconds = 120
				WHERE name IN ('generate-report', 'analyze-brand') AND state = 'created'
			`);
			await tx.execute(sql`
				DELETE FROM pgboss.job
				WHERE name = 'schedule-maintenance' AND state IN ('created', 'retry')
			`);
		};

		await transfer();
		const activeResult = await tx.execute(sql`
			SELECT COUNT(*)::int AS active
			FROM pgboss.job
			WHERE name IN ('process-prompt', 'generate-report', 'analyze-brand', 'schedule-maintenance')
			  AND state = 'active'
		`);
		const active = Number((activeResult.rows[0] as { active: number } | undefined)?.active ?? 0);
		if (active > 0) return { drained: false, active, confirmationRequired: false };

		// Active handlers schedule/retry before leaving active. A second pass after
		// observing zero captures that final state transition.
		await transfer();
		if (upgradingLegacyDeployment && process.env.CONFIRM_LEGACY_PAID_WORKERS_STOPPED !== "1") {
			return { drained: false, active: 0, confirmationRequired: true };
		}
		await tx
			.update(workerSchedulerControl)
			.set({ legacyPromptDrainedAt: now, updatedAt: now })
			.where(eq(workerSchedulerControl.id, "global"));
		return { drained: true, active: 0, confirmationRequired: false };
	});
}

async function waitForLegacyPaidDrain(): Promise<void> {
	let lastLogAt = 0;
	while (true) {
		await retireLegacySchedules();
		const { drained, active, confirmationRequired } = await handoffLegacyPaidWork();
		if (drained) {
			console.log("Legacy paid workers drained; reservation-aware workers may start");
			return;
		}
		if (Date.now() - lastLogAt >= 30_000) {
			if (confirmationRequired) {
				console.warn(
					"Worker remains unready: stop every pre-cutover worker process, then start one new worker " +
						"with CONFIRM_LEGACY_PAID_WORKERS_STOPPED=1",
				);
			} else {
				console.warn(`Worker remains unready while ${active} active legacy paid job(s) drain safely`);
			}
			lastLogAt = Date.now();
		}
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}
}

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || "development",
		tracesSampleRate: 1.0,
	});
}

async function main() {
	console.log("Starting pg-boss worker...");

	// Awaited so a stored credential counts toward the validation below.
	await startCredentialRefresh();

	// Fail fast on misconfigured SCRAPE_TARGETS — surfaces unknown providers,
	// missing API keys, and per-provider target errors before any job runs.
	const scrapeTargets = parseScrapeTargets(process.env.SCRAPE_TARGETS);
	validateScrapeTargets(scrapeTargets, getProvider);
	const promptProviderCalls = scrapeTargets.length * RUNS_PER_PROMPT;
	const promptProviderBudget = getPromptMaxProviderCalls();
	if (promptProviderCalls > promptProviderBudget) {
		throw new Error(
			`SCRAPE_TARGETS materializes ${promptProviderCalls} calls per prompt cycle, exceeding ` +
				`PROMPT_MAX_PROVIDER_CALLS=${promptProviderBudget}`,
		);
	}
	console.log(`SCRAPE_TARGETS validated (${promptProviderCalls}/${promptProviderBudget} calls per prompt cycle)`);

	boss.on("error", (error) => {
		console.error("pg-boss error:", error);
		Sentry.withScope((scope) => {
			scope.setTag("source", "pg-boss-internal");
			Sentry.captureException(error);
		});
	});

	// Start pg-boss (creates schema if needed)
	await boss.start();
	console.log("pg-boss started");
	await createPaidQueues();
	await ensureLegacyAdmissionFence();
	await closeLegacyPromptAdmission();
	await waitForLegacyPaidDrain();

	// Create queues if they don't exist (required in pg-boss v12)
	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.createQueue("sync-auth0-memberships", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 10,
		});
	}
	console.log("Queues created");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.schedule("sync-auth0-memberships", "*/15 * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled Auth0 membership sync (every 15 minutes)");
	}

	// Register job handlers
	await registerHandlers(boss);
	await promptScheduler.start();
	console.log("All handlers registered, worker is ready");
}

main().catch(async (error) => {
	Sentry.captureException(error);
	console.error("Failed to start worker:", error);
	await Sentry.flush(2000);
	process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`Received ${signal}, shutting down gracefully...`);
	await Promise.all([promptScheduler.stop(30000), boss.stop({ graceful: true, timeout: 30000 })]);
	await Promise.all([Sentry.flush(2000), shutdownTelemetry()]);
	console.log("Worker stopped");
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
