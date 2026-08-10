/**
 * Server functions for admin operations.
 * Replaces apps/web/src/app/api/admin/* API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { getModelOverdueStatus } from "@workspace/lib/overdue";
import { parseScrapeTargets } from "@workspace/lib/providers";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isAdmin, requireAuthSession } from "@/lib/auth/helpers";
import { sendImmediatePromptJob } from "@/lib/job-scheduler";
import { getAdminActiveBrandsOverTime, getAdminBrandRunStats, getAdminRunsOverTime } from "@/lib/postgres-read";

// ============================================================================
// Admin guard helper
// ============================================================================

async function requireAdmin() {
	const session = await requireAuthSession();
	if (!isAdmin(session)) throw new Error("Unauthorized: Admin access required");
	return session;
}

// ============================================================================
// Admin Dashboard - Brand Stats
// ============================================================================

/**
 * Get admin dashboard statistics (all brands, run counts, time series charts).
 */
export const getAdminStatsFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdmin();

	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	const [allBrands, brandsOverTime, promptsOverTime, runsOverTimeData, brandRunStats, activeBrandsData] =
		await Promise.all([
			db.query.brands.findMany({ orderBy: desc(brands.createdAt) }),

			// Cumulative brand count over time (last 30 days)
			db
				.select({
					date: sql<string>`date_series::date`,
					count: sql<number>`COUNT(${brands.id})::int`,
				})
				.from(
					sql`generate_series(
					NOW()::date - INTERVAL '30 days',
					NOW()::date,
					INTERVAL '1 day'
				) AS date_series`,
				)
				.leftJoin(brands, sql`${brands.createdAt}::date <= date_series::date`)
				.groupBy(sql`date_series`)
				.orderBy(sql`date_series`),

			// Cumulative prompts count over time (enabled vs disabled)
			db
				.select({
					date: sql<string>`date_series::date`,
					enabled: sql<number>`COUNT(*) FILTER (WHERE ${prompts.enabled} = true)::int`,
					disabled: sql<number>`COUNT(*) FILTER (WHERE ${prompts.enabled} = false)::int`,
				})
				.from(
					sql`generate_series(
					NOW()::date - INTERVAL '30 days',
					NOW()::date,
					INTERVAL '1 day'
				) AS date_series`,
				)
				.leftJoin(prompts, sql`${prompts.createdAt}::date <= date_series::date`)
				.groupBy(sql`date_series`)
				.orderBy(sql`date_series`),

			getAdminRunsOverTime(),
			getAdminBrandRunStats(),
			getAdminActiveBrandsOverTime(),
		]);

	const brandRunStatsMap = new Map(brandRunStats.map((stat) => [stat.brand_id, stat]));

	const brandStats = await Promise.all(
		allBrands.map(async (brand) => {
			const promptCounts = await db
				.select({
					total: sql<number>`count(*)::int`,
					active: sql<number>`count(*) filter (where enabled = true)::int`,
				})
				.from(prompts)
				.where(eq(prompts.brandId, brand.id));

			const recentPromptCounts = await db
				.select({
					added7Days: sql<number>`count(*) filter (where ${prompts.createdAt} >= ${sevenDaysAgo})::int`,
					removed7Days: sql<number>`count(*) filter (where ${prompts.updatedAt} >= ${sevenDaysAgo} and ${prompts.enabled} = false)::int`,
					added30Days: sql<number>`count(*) filter (where ${prompts.createdAt} >= ${thirtyDaysAgo})::int`,
					removed30Days: sql<number>`count(*) filter (where ${prompts.updatedAt} >= ${thirtyDaysAgo} and ${prompts.enabled} = false)::int`,
				})
				.from(prompts)
				.where(eq(prompts.brandId, brand.id));

			const runStats = brandRunStatsMap.get(brand.id);

			return {
				...brand,
				totalPrompts: promptCounts[0]?.total || 0,
				activePrompts: promptCounts[0]?.active || 0,
				promptRuns7Days: runStats?.runs_7d || 0,
				promptRuns30Days: runStats?.runs_30d || 0,
				lastPromptRunAt: runStats?.last_run_at ? new Date(runStats.last_run_at) : null,
				promptsAddedLast7Days: recentPromptCounts[0]?.added7Days || 0,
				promptsRemovedLast7Days: recentPromptCounts[0]?.removed7Days || 0,
				promptsAddedLast30Days: recentPromptCounts[0]?.added30Days || 0,
				promptsRemovedLast30Days: recentPromptCounts[0]?.removed30Days || 0,
			};
		}),
	);

	return {
		brands: brandStats,
		brandsOverTime,
		activeBrandsOverTime: activeBrandsData.map((row) => ({
			date: row.date,
			count: row.count,
		})),
		promptsOverTime,
		runsOverTime: runsOverTimeData.map((row) => ({
			date: row.date,
			count: row.count,
		})),
	};
});

// ============================================================================
// Admin Dashboard - Delay Override
// ============================================================================

/**
 * Update delay override for a brand.
 */
export const updateDelayOverrideFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			delayOverrideHours: z.number().positive().nullable(),
		}),
	)
	.handler(async ({ data }) => {
		await requireAdmin();
		const result = await db
			.update(brands)
			.set({ delayOverrideHours: data.delayOverrideHours, updatedAt: new Date() })
			.where(eq(brands.id, data.brandId))
			.returning();
		if (!result[0]) throw new Error("Brand not found");
		return result[0];
	});

// ============================================================================
// Admin Tools - Analyze Brand
// ============================================================================

/**
 * Provider-agnostic brand analysis. Returns brand info, competitors, and
 * suggested prompts in a single LLM round-trip — same pipeline that the
 * onboarding wizard and `POST /api/v1/tools/analyze` use.
 */
export const adminAnalyzeBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			website: z.string().min(1),
			brandName: z.string().optional(),
			maxCompetitors: z.number().int().min(0).optional(),
			maxPrompts: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireAdmin();
		return analyzeBrand({
			website: data.website,
			brandName: data.brandName,
			maxCompetitors: data.maxCompetitors,
			maxPrompts: data.maxPrompts,
		});
	});

// ============================================================================
// Admin Workflows - Data Fetching
// ============================================================================

async function getQueueStats() {
	const result = await db.execute(sql`
		SELECT
			COUNT(*) FILTER (
				WHERE status IN ('pending', 'processing')
				  AND worker_id IS NULL
				  AND available_at <= now()
			)::int AS created,
			COUNT(*) FILTER (
				WHERE status IN ('pending', 'running', 'processing')
				  AND worker_id IS NOT NULL
			)::int AS active,
			COUNT(*) FILTER (
				WHERE status IN ('pending', 'processing')
				  AND worker_id IS NULL
				  AND available_at > now()
			)::int AS retry,
			COUNT(*) FILTER (WHERE status IN ('succeeded', 'skipped'))::int AS completed,
			COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
		FROM prompt_execution_runs
	`);
	const row = result.rows[0] as
		| { created: number; active: number; retry: number; completed: number; failed: number }
		| undefined;
	const stats = {
		created: Number(row?.created ?? 0),
		active: Number(row?.active ?? 0),
		retry: Number(row?.retry ?? 0),
		completed: Number(row?.completed ?? 0),
		failed: Number(row?.failed ?? 0),
	};

	return {
		name: "durable-prompt-runs",
		...stats,
		totalPending: stats.created + stats.active + stats.retry,
	};
}

async function getRecentJobs(limit = 50) {
	const result = await db.execute(sql`
		SELECT id, prompt_id, status, error_summary, created_at, started_at, completed_at
		FROM prompt_executions
		WHERE status <> 'running'
		ORDER BY completed_at DESC NULLS LAST, created_at DESC
		LIMIT ${limit}
	`);

	return result.rows.map((rawRow) => {
		const row = rawRow as {
			id: string;
			prompt_id: string;
			status: string;
			error_summary: string | null;
			created_at: Date | string;
			started_at: Date | string | null;
			completed_at: Date | string | null;
		};
		const failed = row.status === "partial" || row.status === "failed";

		return {
			id: row.id,
			name: "prompt-execution",
			data: { promptId: row.prompt_id },
			status: failed ? ("failed" as const) : ("completed" as const),
			failedReason: failed ? (row.error_summary ?? `Execution ended with status ${row.status}`) : null,
			timestamp: new Date(row.created_at).getTime(),
			processedOn: row.started_at ? new Date(row.started_at).getTime() : null,
			finishedOn: row.completed_at ? new Date(row.completed_at).getTime() : null,
		};
	});
}

async function getScheduleMap() {
	const defaultDelayHours = getDefaultDelayHours();
	const result = await db.execute(sql`
		SELECT ps.prompt_id,
		       LEAST(ps.next_run_at, COALESCE(ps.run_requested_at, ps.next_run_at)) AS next_run_at,
		       COALESCE(b.delay_override_hours, ${defaultDelayHours}) AS cadence_hours,
		       ps.admission_paused_until, ps.pause_reason
		FROM prompt_schedules ps
		JOIN prompts p ON p.id = ps.prompt_id
		JOIN brands b ON b.id = p.brand_id
	`);
	const map = new Map<
		string,
		{
			promptId: string;
			cadenceHours: number | null;
			nextRunAt: number | null;
			pausedUntil: number | null;
			pauseReason: string | null;
		}
	>();

	for (const rawRow of result.rows) {
		const row = rawRow as {
			prompt_id: string;
			next_run_at: Date | string;
			cadence_hours: number | string;
			admission_paused_until: Date | string | null;
			pause_reason: string | null;
		};
		map.set(row.prompt_id, {
			promptId: row.prompt_id,
			cadenceHours: Number(row.cadence_hours),
			nextRunAt: new Date(row.next_run_at).getTime(),
			pausedUntil: row.admission_paused_until ? new Date(row.admission_paused_until).getTime() : null,
			pauseReason: row.pause_reason,
		});
	}

	return map;
}

async function getActiveJobMap() {
	const result = await db.execute(sql`
		SELECT e.id, e.prompt_id,
		       CASE
		         WHEN COUNT(*) FILTER (
		           WHERE r.status IN ('pending', 'running', 'processing') AND r.worker_id IS NOT NULL
		         ) > 0 THEN 'active'
		         WHEN COUNT(*) FILTER (
		           WHERE r.status IN ('pending', 'processing')
		             AND r.worker_id IS NULL
		             AND r.available_at > now()
		         ) > 0 THEN 'retry'
		         ELSE 'created'
		       END AS state,
		       e.created_at
		FROM prompt_executions e
		LEFT JOIN prompt_execution_runs r ON r.execution_id = e.id
		WHERE e.status = 'running'
		GROUP BY e.id, e.prompt_id, e.created_at
		ORDER BY e.created_at DESC
	`);
	const map = new Map<string, { promptId: string; state: "created" | "active" | "retry" }>();

	for (const rawRow of result.rows) {
		const row = rawRow as { prompt_id: string; state: "created" | "active" | "retry" };
		if (!map.has(row.prompt_id)) {
			map.set(row.prompt_id, {
				promptId: row.prompt_id,
				state: row.state,
			});
		}
	}

	return map;
}

function getReleaseReservationConfirmationPhrase(reservationId: string): string {
	return `RELEASE PROVIDER RESERVATION ${reservationId}`;
}

async function getUnreleasedProviderReservations() {
	const result = await db.execute(sql`
		SELECT reservation.id,
		       reservation.provider,
		       reservation.owner_type,
		       reservation.owner_id,
		       reservation.work_key,
		       reservation.submission_started_at,
		       reservation.external_task_id,
		       reservation.task_deadline_at,
		       reservation.lease_expires_at,
		       reservation.last_error,
		       reservation.created_at,
		       COALESCE(
		         report.brand_name,
		         analysis_brand.name,
		         prompt_brand.name,
		         prompt_execution.context_payload->'brand'->>'name'
		       ) AS owner_name,
		       COALESCE(
		         analysis_brand.website,
		         prompt_brand.website,
		         prompt_execution.context_payload->'brand'->>'website'
		       ) AS owner_website,
		       COALESCE(
		         reservation.request_metadata->>'prompt',
		         prompt.value,
		         prompt_execution.context_payload->'prompt'->>'value'
		       ) AS prompt_value,
		       COALESCE(reservation.request_metadata->>'model', prompt_run.model) AS model,
		       report.status AS report_status
		FROM provider_call_reservations reservation
		LEFT JOIN reports report
		  ON reservation.owner_type = 'report' AND report.id::text = reservation.owner_id
		LEFT JOIN brands analysis_brand
		  ON reservation.owner_type = 'analyze-brand' AND analysis_brand.id = reservation.owner_id
		LEFT JOIN prompt_execution_runs prompt_run
		  ON reservation.owner_type = 'prompt-run' AND prompt_run.id::text = reservation.owner_id
		LEFT JOIN prompt_executions prompt_execution ON prompt_execution.id = prompt_run.execution_id
		LEFT JOIN prompts prompt ON prompt.id = prompt_execution.prompt_id
		LEFT JOIN brands prompt_brand ON prompt_brand.id = prompt.brand_id
		WHERE reservation.released_at IS NULL
		ORDER BY reservation.created_at ASC
	`);

	return result.rows.map((rawRow) => {
		const row = rawRow as {
			id: string;
			provider: string;
			owner_type: string;
			owner_id: string;
			work_key: string;
			submission_started_at: Date | string | null;
			external_task_id: string | null;
			task_deadline_at: Date | string | null;
			lease_expires_at: Date | string | null;
			last_error: string | null;
			created_at: Date | string;
			owner_name: string | null;
			owner_website: string | null;
			prompt_value: string | null;
			model: string | null;
			report_status: string | null;
		};

		return {
			id: row.id,
			provider: row.provider,
			model: row.model,
			ownerType: row.owner_type,
			ownerId: row.owner_id,
			workKey: row.work_key,
			requestSummary: row.prompt_value,
			externalTaskId: row.external_task_id,
			submissionStartedAt: row.submission_started_at ? new Date(row.submission_started_at).getTime() : null,
			taskDeadlineAt: row.task_deadline_at ? new Date(row.task_deadline_at).getTime() : null,
			leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at).getTime() : null,
			lastError: row.last_error,
			brandName: row.owner_name,
			ownerWebsite: row.owner_website,
			reportStatus: row.report_status,
			createdAt: new Date(row.created_at).getTime(),
			confirmationPhrase: getReleaseReservationConfirmationPhrase(row.id),
		};
	});
}

/**
 * Get full workflow data: queue stats, recent jobs, brand schedule summaries.
 */
export const getWorkflowDataFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdmin();

	const allBrands = await db.query.brands.findMany({ orderBy: desc(brands.createdAt) });
	const allPrompts = await db.query.prompts.findMany();

	const promptsByBrand: Record<string, typeof allPrompts> = {};
	for (const prompt of allPrompts) {
		if (!promptsByBrand[prompt.brandId]) {
			promptsByBrand[prompt.brandId] = [];
		}
		promptsByBrand[prompt.brandId].push(prompt);
	}

	const lastRunsQuery = await db
		.select({
			promptId: promptRuns.promptId,
			model: promptRuns.model,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId, promptRuns.model);

	const lastRunsMap: Record<string, Record<string, Date>> = {};
	for (const run of lastRunsQuery) {
		if (!lastRunsMap[run.promptId]) {
			lastRunsMap[run.promptId] = {};
		}
		lastRunsMap[run.promptId][run.model] = run.lastRunAt;
	}

	const [recentJobs, scheduleMap, activeJobMap, queueStats, providerReservations] = await Promise.all([
		getRecentJobs(5000),
		getScheduleMap(),
		getActiveJobMap(),
		getQueueStats(),
		getUnreleasedProviderReservations(),
	]);

	const failuresByPrompt = new Map<string, number>();
	for (const job of recentJobs) {
		if (job.status === "failed" && job.data?.promptId) {
			failuresByPrompt.set(job.data.promptId, (failuresByPrompt.get(job.data.promptId) || 0) + 1);
		}
	}

	const now = Date.now();
	const defaultDelayHours = getDefaultDelayHours();
	const defaultSchedulerInfo = {
		exists: false,
		nextRunAt: null as number | null,
		cadenceHours: null as number | null,
		pausedUntil: null as number | null,
		pauseReason: null as string | null,
	};

	const brandSummaries = allBrands.map((brand) => {
		const brandPrompts = promptsByBrand[brand.id] || [];
		const delayHours = brand.delayOverrideHours ?? defaultDelayHours;
		const runFrequencyMs = delayHours * 60 * 60 * 1000;

		let overduePrompts = 0;
		let onSchedulePrompts = 0;
		let scheduledCount = 0;

		const modelList = parseScrapeTargets(process.env.SCRAPE_TARGETS).map((t) => t.model);
		const promptStatuses = brandPrompts.map((prompt) => {
			const lastRuns = lastRunsMap[prompt.id] || {};
			const lastRunsByModel: Record<
				string,
				{ lastRunAt: Date | null; isOverdue: boolean; overdueByMs: number | null }
			> = {};

			let anyOverdue = false;

			for (const model of modelList) {
				const lastRunAt = lastRuns[model] || null;
				const { isOverdue, overdueByMs } = prompt.enabled
					? getModelOverdueStatus({
							lastRunAt,
							promptCreatedAt: prompt.createdAt,
							runFrequencyMs,
							now,
						})
					: { isOverdue: false, overdueByMs: null };
				if (isOverdue) anyOverdue = true;
				lastRunsByModel[model] = { lastRunAt, isOverdue, overdueByMs };
			}

			const scheduleInfo = scheduleMap.get(prompt.id);
			const schedulerInfo = scheduleInfo
				? {
						exists: true,
						nextRunAt: scheduleInfo.nextRunAt,
						cadenceHours: scheduleInfo.cadenceHours,
						pausedUntil: scheduleInfo.pausedUntil,
						pauseReason: scheduleInfo.pauseReason,
					}
				: defaultSchedulerInfo;

			const activeJob = activeJobMap.get(prompt.id);
			if (prompt.enabled && scheduleInfo) scheduledCount++;

			if (prompt.enabled) {
				if (anyOverdue) {
					overduePrompts++;
				} else {
					onSchedulePrompts++;
				}
			}

			const jobStatus: "active" | "created" | "retry" | "none" = activeJob?.state ?? "none";

			return {
				promptId: prompt.id,
				promptValue: prompt.value,
				brandId: brand.id,
				brandName: brand.name,
				enabled: prompt.enabled,
				runFrequencyMs,
				lastRunsByModel,
				schedulerInfo,
				recentFailures: failuresByPrompt.get(prompt.id) || 0,
				jobStatus,
			};
		});

		const enabledPrompts = brandPrompts.filter((p) => p.enabled).length;

		return {
			brandId: brand.id,
			brandName: brand.name,
			website: brand.website,
			enabled: brand.enabled,
			totalPrompts: brandPrompts.length,
			enabledPrompts,
			runFrequencyMs,
			overduePrompts,
			onSchedulePrompts,
			schedulerCoverage: { scheduled: scheduledCount, total: enabledPrompts },
			prompts: promptStatuses,
		};
	});

	const totalOverdue = brandSummaries.reduce((sum, b) => sum + b.overduePrompts, 0);
	const totalOnSchedule = brandSummaries.reduce((sum, b) => sum + b.onSchedulePrompts, 0);
	const totalEnabled = brandSummaries.reduce((sum, b) => sum + b.enabledPrompts, 0);
	const totalPrompts = brandSummaries.reduce((sum, b) => sum + b.totalPrompts, 0);

	return {
		summary: {
			totalBrands: allBrands.length,
			totalPrompts,
			totalEnabled,
			totalOverdue,
			totalOnSchedule,
			percentOnSchedule: totalEnabled > 0 ? Math.round((totalOnSchedule / totalEnabled) * 100) : 100,
		},
		queue: queueStats,
		recentJobs: recentJobs.sort((a, b) => b.timestamp - a.timestamp),
		providerReservations,
		brands: brandSummaries,
	};
});

// ============================================================================
// Admin Workflows - Release Provider Reservation
// ============================================================================

/**
 * Release provider capacity after an administrator has independently resolved
 * an ambiguous paid call. This does not inspect or cancel provider work.
 */
export const releaseProviderReservationFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			reservationId: z.string().uuid(),
			confirmationPhrase: z.string().max(100),
			resolutionNote: z.string().trim().min(1, "A resolution note is required").max(2000),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAdmin();
		const expectedPhrase = getReleaseReservationConfirmationPhrase(data.reservationId);
		if (data.confirmationPhrase !== expectedPhrase) {
			throw new Error("Confirmation phrase does not exactly match");
		}

		const released = await db.transaction(async (tx) => {
			const result = await tx.execute(sql`
				UPDATE provider_call_reservations
				SET released_at = now(),
				    release_reason = ${data.resolutionNote},
				    released_by = ${session.user.id},
				    updated_at = now()
				WHERE id = ${data.reservationId}
				  AND released_at IS NULL
				  AND (lease_expires_at IS NULL OR lease_expires_at <= now())
				RETURNING id, circuit_key, released_at
			`);
			const row = result.rows[0] as { id: string; circuit_key: string; released_at: Date | string } | undefined;
			if (!row) return null;

			await tx.execute(sql`
				UPDATE provider_health
				SET circuit_state = 'open', reopen_at = now() + interval '5 minutes',
				    probe_run_id = NULL, last_failure_kind = 'operator_resolved',
				    last_error = ${data.resolutionNote}, last_failure_at = now(), updated_at = now()
				WHERE circuit_key = ${row.circuit_key}
				  AND circuit_state = 'half_open'
				  AND probe_run_id = ${row.id}
			`);
			return row;
		});

		if (!released) {
			throw new Error("Reservation is active, already released, or no longer exists");
		}

		return {
			success: true,
			reservationId: released.id,
			releasedAt: new Date(released.released_at).getTime(),
		};
	});

// ============================================================================
// Admin Workflows - Reschedule Prompt
// ============================================================================

/**
 * Request another durable execution for a prompt.
 */
export const retryJobFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			promptId: z.string().optional(),
			jobId: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireAdmin();

		const targetPromptId = data.promptId;
		if (!targetPromptId) {
			throw new Error("promptId is required");
		}

		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, targetPromptId),
		});

		if (!prompt) throw new Error("Prompt not found");
		if (!prompt.enabled) throw new Error("Prompt is disabled");

		const success = await sendImmediatePromptJob(targetPromptId);
		if (!success) throw new Error("Failed to reschedule prompt");

		return { success: true, message: `Requested a new execution for prompt ${targetPromptId}` };
	});

// ============================================================================
// Admin Workflows - Execution Logs
// ============================================================================

/**
 * Get the durable execution record and all of its execution units.
 */
export const getJobLogsFn = createServerFn({ method: "GET" })
	.validator(z.object({ jobId: z.string() }))
	.handler(async ({ data }) => {
		await requireAdmin();

		const [executionResult, runsResult] = await Promise.all([
			db.execute(sql`
				SELECT id, prompt_id, trigger, scheduled_for, not_after, status,
				       total_runs, succeeded_runs, failed_runs, skipped_runs,
				       error_summary, started_at, completed_at, created_at, updated_at
				FROM prompt_executions
				WHERE id = ${data.jobId}
			`),
			db.execute(sql`
				SELECT run.id, run.prompt_run_id, run.target_index, run.run_index, run.provider,
				       run.model, run.version, run.web_search_enabled, run.status, run.available_at,
				       run.worker_id, run.lease_expires_at, run.local_attempts, run.failure_kind,
				       run.error_message, run.started_at, run.completed_at, run.created_at, run.updated_at,
				       reservation.id AS reservation_id,
				       reservation.external_task_id,
				       reservation.attempt_count,
				       reservation.submission_started_at AS provider_submitted_at,
				       reservation.task_deadline_at,
				       reservation.released_at,
				       reservation.release_reason,
				       reservation.last_error AS provider_error
				FROM prompt_execution_runs run
				LEFT JOIN provider_call_reservations reservation
				  ON reservation.owner_type = 'prompt-run'
				 AND reservation.owner_id = run.id::text
				 AND reservation.work_key = 'provider'
				WHERE run.execution_id = ${data.jobId}
				ORDER BY run.target_index, run.run_index
			`),
		]);

		const execution = executionResult.rows[0] as
			| {
					id: string;
					prompt_id: string;
					trigger: string;
					scheduled_for: Date | string;
					not_after: Date | string;
					status: string;
					total_runs: number;
					succeeded_runs: number;
					failed_runs: number;
					skipped_runs: number;
					error_summary: string | null;
					started_at: Date | string | null;
					completed_at: Date | string | null;
					created_at: Date | string;
					updated_at: Date | string;
			  }
			| undefined;

		if (!execution) throw new Error("Execution not found");

		const iso = (value: Date | string) => new Date(value).toISOString();
		const logs: string[] = [
			`Execution ID: ${execution.id}`,
			`Prompt ID: ${execution.prompt_id}`,
			`Trigger: ${execution.trigger}`,
			`Status: ${execution.status}`,
			`Scheduled for: ${iso(execution.scheduled_for)}`,
			`Execution window ends: ${iso(execution.not_after)}`,
			`Created: ${iso(execution.created_at)}`,
		];

		if (execution.started_at) logs.push(`Started: ${iso(execution.started_at)}`);
		if (execution.completed_at) logs.push(`Completed: ${iso(execution.completed_at)}`);
		logs.push(
			`Units: ${execution.total_runs} total, ${execution.succeeded_runs} succeeded, ` +
				`${execution.failed_runs} failed, ${execution.skipped_runs} skipped`,
		);
		if (execution.error_summary) logs.push(`Execution error: ${execution.error_summary}`);

		for (const rawRun of runsResult.rows) {
			const run = rawRun as {
				id: string;
				prompt_run_id: string | null;
				target_index: number;
				run_index: number;
				provider: string;
				model: string;
				version: string | null;
				web_search_enabled: boolean;
				status: string;
				available_at: Date | string;
				worker_id: string | null;
				lease_expires_at: Date | string | null;
				reservation_id: string | null;
				external_task_id: string | null;
				attempt_count: number | null;
				local_attempts: number;
				failure_kind: string | null;
				error_message: string | null;
				started_at: Date | string | null;
				provider_submitted_at: Date | string | null;
				task_deadline_at: Date | string | null;
				released_at: Date | string | null;
				release_reason: string | null;
				provider_error: string | null;
				completed_at: Date | string | null;
				created_at: Date | string;
				updated_at: Date | string;
			};

			logs.push("");
			logs.push(`Unit ${run.target_index + 1}.${run.run_index} (${run.id}): ${run.model} via ${run.provider}`);
			logs.push(`Status: ${run.status}`);
			logs.push(`Version: ${run.version ?? "default"}; web search: ${run.web_search_enabled ? "enabled" : "disabled"}`);
			logs.push(`Reservation claims: ${run.attempt_count ?? 0}; local retries: ${run.local_attempts}`);
			logs.push(`Available: ${iso(run.available_at)}`);
			if (run.started_at) logs.push(`Started: ${iso(run.started_at)}`);
			if (run.reservation_id) logs.push(`Provider reservation: ${run.reservation_id}`);
			if (run.provider_submitted_at) logs.push(`Provider submitted: ${iso(run.provider_submitted_at)}`);
			if (run.task_deadline_at) logs.push(`Provider task deadline: ${iso(run.task_deadline_at)}`);
			if (run.released_at) {
				logs.push(`Provider reservation released: ${iso(run.released_at)} (${run.release_reason ?? "no reason"})`);
			}
			if (run.completed_at) logs.push(`Completed: ${iso(run.completed_at)}`);
			if (run.worker_id) logs.push(`Worker: ${run.worker_id}`);
			if (run.lease_expires_at) logs.push(`Lease expires: ${iso(run.lease_expires_at)}`);
			if (run.external_task_id) logs.push(`External task: ${run.external_task_id}`);
			if (run.prompt_run_id) logs.push(`Saved prompt run: ${run.prompt_run_id}`);
			if (run.failure_kind) logs.push(`Failure kind: ${run.failure_kind}`);
			if (run.error_message) logs.push(`Error: ${run.error_message}`);
			if (run.provider_error) logs.push(`Provider reservation error: ${run.provider_error}`);
		}

		return { jobId: data.jobId, logs, count: logs.length };
	});
