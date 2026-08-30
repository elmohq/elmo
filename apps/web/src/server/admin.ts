/**
 * Server functions for admin operations.
 * Replaces apps/web/src/app/api/admin/* API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import type { Entitlements } from "@workspace/config/entitlements";
import { getModelMeta } from "@workspace/config/models";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { type Brand, brands, organization, type Prompt, promptRuns, prompts } from "@workspace/lib/db/schema";
import { assertCadenceAllowed, getBrandOrganizationId, getOrgEntitlementsMap } from "@workspace/lib/entitlements";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { type ModelConfig, parseScrapeTargets } from "@workspace/lib/providers";
import {
	type PromptRunPlan,
	resolveBrandPromptRunPlans,
	type TargetPlan,
	targetKey,
	targetOverdueStatus,
} from "@workspace/lib/run-policy";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
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

async function organizationSlugs(organizationIds: string[]): Promise<Map<string, string>> {
	if (organizationIds.length === 0) return new Map();
	const rows = await db
		.select({ id: organization.id, slug: organization.slug })
		.from(organization)
		.where(inArray(organization.id, [...new Set(organizationIds)]));
	return new Map(rows.map((row) => [row.id, row.slug]));
}

function organizationSegment(slugs: Map<string, string>, organizationId: string): string {
	return slugs.get(organizationId) ?? organizationId;
}

// ============================================================================
// Postgres client helper for pg-boss queries
// ============================================================================

async function withPgClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required");
	}
	const client = new Client({ connectionString });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
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
	const orgSlugs = await organizationSlugs(allBrands.map((brand) => brand.organizationId));

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
				organizationSlug: organizationSegment(orgSlugs, brand.organizationId),
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
			delayOverrideHours: z.number().nullable(),
		}),
	)
	.handler(async ({ data }) => {
		await requireAdmin();
		await assertCadenceAllowed(await getBrandOrganizationId(data.brandId), data.delayOverrideHours);
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

function parseJobData(data: unknown): { promptId?: string } {
	if (!data) return {};
	try {
		const parsed = typeof data === "string" ? JSON.parse(data) : data;
		if (typeof parsed === "object" && parsed !== null) {
			return {
				promptId:
					typeof (parsed as Record<string, unknown>).promptId === "string"
						? ((parsed as Record<string, unknown>).promptId as string)
						: undefined,
			};
		}
	} catch {
		// ignore parse failures
	}
	return {};
}

async function getQueueStats() {
	return withPgClient(async (client) => {
		const tableCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job')`,
		);

		if (!tableCheck.rows[0]?.exists) {
			return {
				name: "process-prompt",
				created: 0,
				active: 0,
				retry: 0,
				completed: 0,
				failed: 0,
				totalPending: 0,
			};
		}

		const result = await client.query(`
			SELECT
				COUNT(*) FILTER (WHERE state = 'created') AS created,
				COUNT(*) FILTER (WHERE state = 'active') AS active,
				COUNT(*) FILTER (WHERE state = 'retry') AS retry
			FROM pgboss.job
			WHERE name = 'process-prompt'
		`);

		const archiveCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'archive')`,
		);

		let completed = 0;
		let failed = 0;
		if (archiveCheck.rows[0]?.exists) {
			const archiveResult = await client.query(`
				SELECT
					COUNT(*) FILTER (WHERE state = 'completed') AS completed,
					COUNT(*) FILTER (WHERE state = 'failed') AS failed
				FROM pgboss.archive
				WHERE name = 'process-prompt'
			`);
			completed = Number(archiveResult.rows[0]?.completed || 0);
			failed = Number(archiveResult.rows[0]?.failed || 0);
		}

		const stats = {
			created: Number(result.rows[0]?.created || 0),
			active: Number(result.rows[0]?.active || 0),
			retry: Number(result.rows[0]?.retry || 0),
			completed,
			failed,
		};

		return {
			name: "process-prompt",
			...stats,
			totalPending: stats.created + stats.active + stats.retry,
		};
	});
}

function failureReason(state: string, output: unknown): string | null {
	if (state !== "failed" || !output) return null;
	try {
		const parsed = typeof output === "string" ? JSON.parse(output) : (output as Record<string, unknown>);
		return (parsed?.message as string) || (parsed?.error as string) || "Unknown error";
	} catch {
		return "Unknown error";
	}
}

async function getRecentJobs(limit = 50) {
	const jobs = await withPgClient(async (client) => {
		const [jobCheck, archiveCheck] = await Promise.all([
			client.query(
				`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job')`,
			),
			client.query(
				`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'archive')`,
			),
		]);

		const rows: any[] = [];

		if (jobCheck.rows[0]?.exists) {
			const result = await client.query(
				`SELECT id, name, data, state, output, retry_count, created_on, started_on, completed_on
				 FROM pgboss.job
				 WHERE name = 'process-prompt'
				   AND state IN ('completed', 'failed')
				 ORDER BY completed_on DESC NULLS LAST
				 LIMIT $1`,
				[limit],
			);
			rows.push(...result.rows);
		}

		if (archiveCheck.rows[0]?.exists) {
			const result = await client.query(
				`SELECT id, name, data, state, output, retry_count, created_on, started_on, completed_on
				 FROM pgboss.archive
				 WHERE name = 'process-prompt'
				 ORDER BY completed_on DESC NULLS LAST
				 LIMIT $1`,
				[limit],
			);
			rows.push(...result.rows);
		}

		return rows;
	});

	const deduped = new Map<string, (typeof jobs)[number]>();
	for (const row of jobs) {
		if (!deduped.has(row.id)) {
			deduped.set(row.id, row);
		}
	}

	const sorted = Array.from(deduped.values()).sort((a, b) => {
		const aTime = a.completed_on ? new Date(a.completed_on).getTime() : 0;
		const bTime = b.completed_on ? new Date(b.completed_on).getTime() : 0;
		return bTime - aTime;
	});

	return sorted.slice(0, limit).map((row) => {
		return {
			id: row.id,
			name: row.name,
			data: parseJobData(row.data),
			status: row.state === "completed" ? ("completed" as const) : ("failed" as const),
			failedReason: failureReason(row.state, row.output),
			attemptsMade: row.retry_count || 0,
			timestamp: row.created_on ? new Date(row.created_on).getTime() : 0,
			processedOn: row.started_on ? new Date(row.started_on).getTime() : null,
			finishedOn: row.completed_on ? new Date(row.completed_on).getTime() : null,
		};
	});
}

/**
 * pg-boss schedules this job with one of two cron shapes; nothing here needs a
 * general cron parser, and reading them in one place keeps the cadence the
 * dashboard reports and the next-run it computes derived from the same match.
 */
type CronSchedule = { unit: "hours" | "days"; interval: number };

function parseCron(cron: string): CronSchedule | null {
	const hourly = cron.match(/^0 \*\/(\d+) \* \* \*$/);
	if (hourly) {
		const interval = Number(hourly[1]);
		return Number.isFinite(interval) && interval > 0 ? { unit: "hours", interval } : null;
	}
	const daily = cron.match(/^0 0 (?:\*\/(\d+)|\*) \* \*$/);
	if (daily) {
		const interval = daily[1] ? Number(daily[1]) : 1;
		return Number.isFinite(interval) && interval > 0 ? { unit: "days", interval } : null;
	}
	return null;
}

function nextHourlyRun(interval: number, now: Date): number | null {
	const nowMs = now.getTime();
	const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
	// Part-way through an hour means that hour has already passed.
	const startHour =
		now.getUTCHours() + (now.getUTCMinutes() > 0 || now.getUTCSeconds() > 0 || now.getUTCMilliseconds() > 0 ? 1 : 0);

	for (let hour = startHour; hour <= startHour + 48; hour += 1) {
		if (hour % interval !== 0) continue;
		const candidate = midnight + hour * 60 * 60 * 1000;
		if (candidate > nowMs) return candidate;
	}
	return null;
}

function nextDailyRun(interval: number, now: Date): number | null {
	const nowMs = now.getTime();
	for (let offset = 0; offset <= 31; offset += 1) {
		const candidate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, 0, 0, 0, 0);
		const dayOfMonth = new Date(candidate).getUTCDate();
		const onInterval = interval === 1 || (dayOfMonth - 1) % interval === 0;
		if (onInterval && candidate > nowMs) return candidate;
	}
	return null;
}

function getNextRunFromCron(cron: string, now: Date): number | null {
	const schedule = parseCron(cron);
	if (!schedule) return null;
	return schedule.unit === "hours" ? nextHourlyRun(schedule.interval, now) : nextDailyRun(schedule.interval, now);
}

async function getScheduleMap() {
	const schedules = await withPgClient(async (client) => {
		const tableCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'schedule')`,
		);

		if (!tableCheck.rows[0]?.exists) return [];

		const result = await client.query(`
			SELECT name, key, data, cron
			FROM pgboss.schedule
			WHERE name = 'process-prompt'
		`);
		return result.rows;
	});

	const map = new Map<string, { promptId: string; cadenceHours: number | null; nextRunAt: number | null }>();
	const now = new Date();

	for (const row of schedules) {
		const promptId = row.key;
		if (!promptId) continue;
		const schedule = row.cron ? parseCron(row.cron) : null;
		map.set(promptId, {
			promptId,
			cadenceHours: schedule ? schedule.interval * (schedule.unit === "days" ? 24 : 1) : null,
			nextRunAt: row.cron ? getNextRunFromCron(row.cron, now) : null,
		});
	}

	return map;
}

async function getActiveJobMap() {
	const jobs = await withPgClient(async (client) => {
		const tableCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job')`,
		);

		if (!tableCheck.rows[0]?.exists) return [];

		const result = await client.query(`
			SELECT id, data, state, created_on, started_on
			FROM pgboss.job
			WHERE name = 'process-prompt'
			  AND state IN ('created', 'active', 'retry')
			ORDER BY
				CASE state
					WHEN 'active' THEN 1
					WHEN 'retry' THEN 2
					WHEN 'created' THEN 3
					ELSE 4
				END,
				started_on DESC NULLS LAST,
				created_on DESC NULLS LAST
		`);
		return result.rows;
	});

	const map = new Map<string, { promptId: string; state: "created" | "active" | "retry" }>();

	for (const row of jobs) {
		const data = parseJobData(row.data);
		if (data.promptId) {
			if (!map.has(data.promptId)) {
				map.set(data.promptId, {
					promptId: data.promptId,
					state: row.state as "created" | "active" | "retry",
				});
			}
		}
	}

	return map;
}

interface TargetRunStatus {
	lastRunAt: Date | null;
	isOverdue: boolean;
	overdueByMs: number | null;
}

/**
 * Every prompt's run plan, resolved the way the worker resolves it: pool
 * positions across the whole org, run plans per brand. A brand whose
 * configuration no longer resolves (a pick whose target left SCRAPE_TARGETS)
 * is skipped rather than taking the whole dashboard down.
 */
function resolveRunPlansForBrands(input: {
	brands: Brand[];
	promptsByBrand: Record<string, Prompt[]>;
	entitlementsByOrg: Map<string, Entitlements>;
	scrapeTargets: ModelConfig[];
	defaultDelayHours: number;
}): Map<string, PromptRunPlan> {
	const enabledByOrg = new Map<string, Prompt[]>();
	for (const brand of input.brands) {
		const enabled = (input.promptsByBrand[brand.id] ?? []).filter((p) => p.enabled);
		if (enabled.length === 0) continue;
		enabledByOrg.set(brand.organizationId, [...(enabledByOrg.get(brand.organizationId) ?? []), ...enabled]);
	}

	const plans = new Map<string, PromptRunPlan>();
	for (const brand of input.brands) {
		const brandPrompts = input.promptsByBrand[brand.id] ?? [];
		const entitlements = input.entitlementsByOrg.get(brand.organizationId);
		if (brandPrompts.length === 0 || !entitlements) continue;
		try {
			for (const [promptId, plan] of resolveBrandPromptRunPlans({
				scrapeTargets: input.scrapeTargets,
				defaultDelayHours: input.defaultDelayHours,
				entitlements,
				orgPrompts: enabledByOrg.get(brand.organizationId) ?? [],
				brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
				prompts: brandPrompts,
			})) {
				plans.set(promptId, plan);
			}
		} catch (error) {
			console.error(`[admin] Skipping brand ${brand.id} run plans (invalid target config):`, error);
		}
	}
	return plans;
}

/** The chain's cadence: its fastest target. Zero when nothing is planned. */
function intervalMsOf(targets: TargetPlan[]): number {
	if (targets.length === 0) return 0;
	return Math.min(...targets.map((t) => t.intervalHours)) * 60 * 60 * 1000;
}

function fastestCadenceMs(cadences: number[]): number {
	const running = cadences.filter((ms) => ms > 0);
	return running.length > 0 ? Math.min(...running) : 0;
}

/** The union of every target the brand's prompts run, in first-seen order. */
function targetColumnsFor(plans: (PromptRunPlan | undefined)[]): { key: string; label: string }[] {
	const columns = new Map<string, { key: string; label: string }>();
	for (const plan of plans) {
		for (const target of plan?.targets ?? []) {
			const key = targetKey(target.config);
			if (columns.has(key)) continue;
			const label = getModelMeta(target.config.model).label;
			columns.set(key, { key, label: target.config.webSearch ? `${label} (web)` : label });
		}
	}
	return [...columns.values()];
}

/**
 * Get full workflow data: queue stats, recent jobs, brand schedule summaries.
 */
interface WorkflowContext {
	orgSlugs: Map<string, string>;
	runPlans: Map<string, PromptRunPlan>;
	lastRunsByPrompt: Map<string, Map<string, Date>>;
	scheduleMap: Awaited<ReturnType<typeof getScheduleMap>>;
	activeJobMap: Awaited<ReturnType<typeof getActiveJobMap>>;
	failuresByPrompt: Map<string, number>;
	now: number;
}

const NO_SCHEDULER = { exists: false, nextRunAt: null as number | null, cadenceHours: null as number | null };

function targetFreshness(
	prompt: { enabled: boolean; createdAt: Date },
	targets: TargetPlan[],
	lastRuns: Map<string, Date>,
	now: number,
): Record<string, TargetRunStatus> {
	const byTarget: Record<string, TargetRunStatus> = {};
	for (const target of targets) {
		const key = targetKey(target.config);
		const lastRunAt = lastRuns.get(key) ?? null;
		// A disabled prompt is parked on purpose, so it is never overdue.
		const { isOverdue, overdueByMs } = prompt.enabled
			? targetOverdueStatus({ intervalHours: target.intervalHours, lastRunAt, promptCreatedAt: prompt.createdAt, now })
			: { isOverdue: false, overdueByMs: null };
		byTarget[key] = { lastRunAt, isOverdue, overdueByMs };
	}
	return byTarget;
}

function promptWorkflowStatus(
	prompt: { id: string; value: string; enabled: boolean; createdAt: Date },
	brand: { id: string; name: string },
	context: WorkflowContext,
) {
	const targets = context.runPlans.get(prompt.id)?.targets ?? [];
	const lastRunsByTarget = targetFreshness(
		prompt,
		targets,
		context.lastRunsByPrompt.get(prompt.id) ?? new Map<string, Date>(),
		context.now,
	);
	const scheduleInfo = context.scheduleMap.get(prompt.id);
	const activeJob = context.activeJobMap.get(prompt.id);

	return {
		overdue: Object.values(lastRunsByTarget).some((target) => target.isOverdue),
		scheduled: activeJob !== undefined,
		row: {
			promptId: prompt.id,
			promptValue: prompt.value,
			brandId: brand.id,
			brandName: brand.name,
			enabled: prompt.enabled,
			// The chain's own cadence: its fastest target, which is what the
			// scheduler reschedules on. Zero when the plan parks the prompt.
			runFrequencyMs: intervalMsOf(targets),
			lastRunsByTarget,
			schedulerInfo: scheduleInfo
				? { exists: true, nextRunAt: scheduleInfo.nextRunAt, cadenceHours: scheduleInfo.cadenceHours }
				: NO_SCHEDULER,
			recentFailures: context.failuresByPrompt.get(prompt.id) || 0,
			jobStatus: (activeJob?.state ?? "none") as "active" | "created" | "retry" | "none",
		},
	};
}

function brandWorkflowSummary(
	brand: { id: string; slug: string | null; organizationId: string; name: string; website: string; enabled: boolean },
	brandPrompts: { id: string; value: string; enabled: boolean; createdAt: Date }[],
	context: WorkflowContext,
) {
	const statuses = brandPrompts.map((prompt) => promptWorkflowStatus(prompt, brand, context));
	const enabled = statuses.filter((status) => status.row.enabled);

	return {
		brandId: brand.id,
		brandSlug: brand.slug,
		organizationSlug: organizationSegment(context.orgSlugs, brand.organizationId),
		brandName: brand.name,
		website: brand.website,
		enabled: brand.enabled,
		totalPrompts: brandPrompts.length,
		enabledPrompts: enabled.length,
		// Prompts of one brand can run different targets (premium is per prompt),
		// so the table's columns are the union rather than whatever the first row
		// happens to have.
		targetColumns: targetColumnsFor(brandPrompts.map((p) => context.runPlans.get(p.id))),
		runFrequencyMs: fastestCadenceMs(statuses.map((status) => status.row.runFrequencyMs)),
		overduePrompts: enabled.filter((status) => status.overdue).length,
		onSchedulePrompts: enabled.filter((status) => !status.overdue).length,
		schedulerCoverage: { scheduled: enabled.filter((status) => status.scheduled).length, total: enabled.length },
		prompts: statuses.map((status) => status.row),
	};
}

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
			provider: promptRuns.provider,
			webSearchEnabled: promptRuns.webSearchEnabled,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId, promptRuns.model, promptRuns.provider, promptRuns.webSearchEnabled);

	const lastRunsByPrompt = new Map<string, Map<string, Date>>();
	for (const run of lastRunsQuery) {
		let byKey = lastRunsByPrompt.get(run.promptId);
		if (!byKey) {
			byKey = new Map();
			lastRunsByPrompt.set(run.promptId, byKey);
		}
		// provider is nullable on the column; a row without one predates target
		// keying and can't be matched to a target anyway.
		if (!run.provider) continue;
		byKey.set(
			targetKey({ model: run.model, provider: run.provider, webSearch: run.webSearchEnabled }),
			new Date(run.lastRunAt),
		);
	}

	const [orgSlugs, recentJobs, scheduleMap, activeJobMap, queueStats] = await Promise.all([
		organizationSlugs(allBrands.map((brand) => brand.organizationId)),
		getRecentJobs(5000),
		getScheduleMap(),
		getActiveJobMap(),
		getQueueStats(),
	]);

	// The dashboard reports against what each prompt is actually supposed to run,
	// so it resolves the same plans the worker does. Reading every configured
	// SCRAPE_TARGETS model at the brand cadence instead would mark every platform
	// a plan doesn't sell as permanently overdue.
	const entitlementsByOrg = await getOrgEntitlementsMap([...new Set(allBrands.map((b) => b.organizationId))]);
	const runPlans = resolveRunPlansForBrands({
		brands: allBrands,
		promptsByBrand,
		entitlementsByOrg,
		scrapeTargets: parseScrapeTargets(process.env.SCRAPE_TARGETS),
		defaultDelayHours: getDefaultDelayHours(),
	});

	const failuresByPrompt = new Map<string, number>();
	for (const job of recentJobs) {
		if (job.status === "failed" && job.data?.promptId) {
			failuresByPrompt.set(job.data.promptId, (failuresByPrompt.get(job.data.promptId) || 0) + 1);
		}
	}

	const context: WorkflowContext = {
		orgSlugs,
		runPlans,
		lastRunsByPrompt,
		scheduleMap,
		activeJobMap,
		failuresByPrompt,
		now: Date.now(),
	};
	const brandSummaries = allBrands.map((brand) => brandWorkflowSummary(brand, promptsByBrand[brand.id] || [], context));

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
		brands: brandSummaries,
	};
});

// ============================================================================
// Admin Workflows - Retry Job
// ============================================================================

/**
 * Retry a prompt job (send immediate job for a prompt).
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
		if (!success) throw new Error("Failed to send job");

		return { success: true, message: `Triggered immediate job for prompt ${targetPromptId}` };
	});

// ============================================================================
// Admin Workflows - Job Logs
// ============================================================================

/**
 * Get logs for a specific job.
 */
function formatJobLogs(job: Record<string, any>): string[] {
	/** JSON columns arrive as text or as parsed objects depending on the driver. */
	const pretty = (value: unknown) => {
		try {
			return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value, null, 2);
		} catch {
			return String(value);
		}
	};
	const timestamps: [string, unknown][] = [
		["Created", job.created_on],
		["Started", job.started_on],
		["Completed", job.completed_on],
	];

	return [
		`Job ID: ${job.id}`,
		`Name: ${job.name}`,
		`State: ${job.state}`,
		`Retry count: ${job.retry_count || 0}`,
		...timestamps.filter(([, at]) => at).map(([label, at]) => `${label}: ${new Date(at as string).toISOString()}`),
		...(job.data ? [`Data: ${pretty(job.data)}`] : []),
		...(job.output ? [`${job.state === "failed" ? "Error" : "Output"}: ${pretty(job.output)}`] : []),
	];
}

export const getJobLogsFn = createServerFn({ method: "GET" })
	.validator(z.object({ jobId: z.string() }))
	.handler(async ({ data }) => {
		await requireAdmin();

		const job = await withPgClient(async (client) => {
			const schemaCheck = await client.query(
				`SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgboss')`,
			);

			if (!schemaCheck.rows[0]?.exists) return null;

			let result = await client.query(
				`SELECT id, name, data, state, output, retry_count, created_on, started_on, completed_on
				 FROM pgboss.job
				 WHERE id = $1`,
				[data.jobId],
			);

			if (result.rows.length === 0) {
				result = await client.query(
					`SELECT id, name, data, state, output, retry_count, created_on, started_on, completed_on
					 FROM pgboss.archive
					 WHERE id = $1`,
					[data.jobId],
				);
			}

			return result.rows[0] || null;
		});

		if (!job) throw new Error("Job not found");

		const logs = formatJobLogs(job);
		return { jobId: data.jobId, logs, count: logs.length };
	});
