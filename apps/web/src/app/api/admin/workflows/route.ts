import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, promptRuns } from "@workspace/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";
import { createPromptJobScheduler, sendImmediatePromptJob } from "@/lib/job-scheduler";
import { Client } from "pg";

export const dynamic = "force-dynamic";

interface SchedulerInfo {
	exists: boolean;
	nextRunAt: number | null;
	cadenceHours: number | null;
}

interface PromptScheduleStatus {
	promptId: string;
	promptValue: string;
	brandId: string;
	brandName: string;
	enabled: boolean;
	runFrequencyMs: number;
	lastRunsByModelGroup: {
		openai?: {
			lastRunAt: Date | null;
			isOverdue: boolean;
			overdueByMs: number | null;
		};
		anthropic?: {
			lastRunAt: Date | null;
			isOverdue: boolean;
			overdueByMs: number | null;
		};
		google?: {
			lastRunAt: Date | null;
			isOverdue: boolean;
			overdueByMs: number | null;
		};
	};
	schedulerInfo: SchedulerInfo;
	recentFailures: number;
	jobStatus: "active" | "created" | "retry" | "none";
}

interface BrandScheduleSummary {
	brandId: string;
	brandName: string;
	website: string;
	enabled: boolean;
	totalPrompts: number;
	enabledPrompts: number;
	runFrequencyMs: number;
	overduePrompts: number;
	onSchedulePrompts: number;
	schedulerCoverage: { scheduled: number; total: number };
	prompts: PromptScheduleStatus[];
}

interface QueueStats {
	name: string;
	created: number;
	active: number;
	retry: number;
	completed: number;
	failed: number;
	totalPending: number;
}

interface RecentJob {
	id: string;
	name: string;
	data: { promptId?: string };
	status: "completed" | "failed";
	failedReason: string | null;
	attemptsMade: number;
	timestamp: number;
	processedOn: number | null;
	finishedOn: number | null;
}

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

function parseJobData(data: unknown): { promptId?: string } {
	if (!data) return {};

	try {
		const parsed = typeof data === "string" ? JSON.parse(data) : data;
		if (typeof parsed === "object" && parsed !== null) {
			return {
				promptId: typeof (parsed as Record<string, unknown>).promptId === "string" 
					? (parsed as Record<string, unknown>).promptId as string 
					: undefined,
			};
		}
	} catch {
		// ignore parse failures
	}

	return {};
}

async function getQueueStats(): Promise<QueueStats> {
	const stats = await withPgClient(async (client) => {
		// Check if pgboss tables exist
		const tableCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job')`,
		);
		
		if (!tableCheck.rows[0]?.exists) {
			return { created: 0, active: 0, retry: 0, completed: 0, failed: 0 };
		}

		const result = await client.query(`
			SELECT
				COUNT(*) FILTER (WHERE state = 'created') AS created,
				COUNT(*) FILTER (WHERE state = 'active') AS active,
				COUNT(*) FILTER (WHERE state = 'retry') AS retry
			FROM pgboss.job
			WHERE name = 'process-prompt'
		`);

		// Archive table may not exist yet
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

		return {
			created: Number(result.rows[0]?.created || 0),
			active: Number(result.rows[0]?.active || 0),
			retry: Number(result.rows[0]?.retry || 0),
			completed,
			failed,
		};
	});

	return {
		name: "process-prompt",
		...stats,
		totalPending: stats.created + stats.active + stats.retry,
	};
}

async function getRecentJobs(limit: number = 50): Promise<RecentJob[]> {
	const jobs = await withPgClient(async (client) => {
		// Check which pg-boss tables exist
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

	const deduped = new Map<string, typeof jobs[number]>();
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
		const data = parseJobData(row.data);
		let failedReason: string | null = null;
		
		if (row.state === "failed" && row.output) {
			try {
				const output = typeof row.output === "string" ? JSON.parse(row.output) : row.output;
				failedReason = output?.message || output?.error || "Unknown error";
			} catch {
				failedReason = "Unknown error";
			}
		}

		return {
			id: row.id,
			name: row.name,
			data,
			status: row.state === "completed" ? "completed" : "failed",
			failedReason,
			attemptsMade: row.retry_count || 0,
			timestamp: row.created_on ? new Date(row.created_on).getTime() : 0,
			processedOn: row.started_on ? new Date(row.started_on).getTime() : null,
			finishedOn: row.completed_on ? new Date(row.completed_on).getTime() : null,
		};
	});
}

interface ScheduleInfo {
	promptId: string;
	cadenceHours: number | null;
	nextRunAt: number | null;
}

function getNextRunFromCron(cron: string, now: Date): number | null {
	const hourlyMatch = cron.match(/^0 \*\/(\d+) \* \* \*$/);
	if (hourlyMatch) {
		const interval = Number(hourlyMatch[1]);
		if (!Number.isFinite(interval) || interval <= 0) return null;

		const nowMs = now.getTime();
		const nowUtc = new Date(nowMs);
		const year = nowUtc.getUTCFullYear();
		const month = nowUtc.getUTCMonth();
		const day = nowUtc.getUTCDate();
		const hour = nowUtc.getUTCHours();
		const minute = nowUtc.getUTCMinutes();
		const second = nowUtc.getUTCSeconds();
		const ms = nowUtc.getUTCMilliseconds();

		let nextHour = hour;
		if (minute > 0 || second > 0 || ms > 0) {
			nextHour += 1;
		}

		for (let i = 0; i <= 48; i += 1) {
			const h = nextHour + i;
			if (h % interval === 0) {
				const dayOffset = Math.floor(h / 24);
				const hourOfDay = h % 24;
				const baseMidnight = Date.UTC(year, month, day, 0, 0, 0, 0);
				const candidateMs =
					baseMidnight + dayOffset * 24 * 60 * 60 * 1000 + hourOfDay * 60 * 60 * 1000;
				if (candidateMs > nowMs) {
					return candidateMs;
				}
			}
		}

		return null;
	}

	const dailyMatch = cron.match(/^0 0 (?:\*\/(\d+)|\*) \* \*$/);
	if (dailyMatch) {
		const dayInterval = dailyMatch[1] ? Number(dailyMatch[1]) : 1;
		if (!Number.isFinite(dayInterval) || dayInterval <= 0) return null;

		const nowMs = now.getTime();
		const nowUtc = new Date(nowMs);

		for (let i = 0; i <= 31; i += 1) {
			const candidate = new Date(
				Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate() + i, 0, 0, 0, 0),
			);
			const dayOfMonth = candidate.getUTCDate();
			const matches = dayInterval === 1 || (dayOfMonth - 1) % dayInterval === 0;
			if (matches && candidate.getTime() > nowMs) {
				return candidate.getTime();
			}
		}

		return null;
	}

	return null;
}

async function getScheduleMap(): Promise<Map<string, ScheduleInfo>> {
	const schedules = await withPgClient(async (client) => {
		// Check if pgboss schedule table exists
		const tableCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'schedule')`,
		);
		
		if (!tableCheck.rows[0]?.exists) {
			return [];
		}

		// Schedules use name='process-prompt' with key=promptId for uniqueness
		const result = await client.query(`
			SELECT name, key, data, cron
			FROM pgboss.schedule
			WHERE name = 'process-prompt'
		`);
		return result.rows;
	});

	const map = new Map<string, ScheduleInfo>();
	const now = new Date();

	for (const row of schedules) {
		// The key is the promptId
		const promptId = row.key;
		if (promptId) {
			// Parse cadence from cron expression
			// Formats: "0 */N * * *" (every N hours) or "0 0 */N * *" (every N days)
			let cadenceHours: number | null = null;
			let nextRunAt: number | null = null;
			if (row.cron) {
				// Try hourly pattern: "0 */6 * * *"
				const hourlyMatch = row.cron.match(/^0 \*\/(\d+) \* \* \*$/);
				if (hourlyMatch) {
					cadenceHours = Number(hourlyMatch[1]);
				} else {
					// Try daily pattern: "0 0 */3 * *" or "0 0 * * *"
					const dailyMatch = row.cron.match(/^0 0 (?:\*\/(\d+)|\*) \* \*$/);
					if (dailyMatch) {
						cadenceHours = dailyMatch[1] ? Number(dailyMatch[1]) * 24 : 24;
					}
				}

				nextRunAt = getNextRunFromCron(row.cron, now);
			}
			map.set(promptId, { promptId, cadenceHours, nextRunAt });
		}
	}

	return map;
}

interface ActiveJobInfo {
	promptId: string;
	state: "created" | "active" | "retry";
}

async function getActiveJobMap(): Promise<Map<string, ActiveJobInfo>> {
	const jobs = await withPgClient(async (client) => {
		// Check if pgboss job table exists
		const tableCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'job')`,
		);
		
		if (!tableCheck.rows[0]?.exists) {
			return [];
		}

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

	const map = new Map<string, ActiveJobInfo>();

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

export async function GET() {
	try {
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const allBrands = await db.query.brands.findMany({
			orderBy: desc(brands.createdAt),
		});
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
				modelGroup: promptRuns.modelGroup,
				lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
			})
			.from(promptRuns)
			.groupBy(promptRuns.promptId, promptRuns.modelGroup);

		const lastRunsMap: Record<string, Record<string, Date>> = {};
		for (const run of lastRunsQuery) {
			if (!lastRunsMap[run.promptId]) {
				lastRunsMap[run.promptId] = {};
			}
			lastRunsMap[run.promptId][run.modelGroup] = run.lastRunAt;
		}

		const [recentJobs, scheduleMap, activeJobMap, queueStats] = await Promise.all([
			getRecentJobs(5000),
			getScheduleMap(),
			getActiveJobMap(),
			getQueueStats(),
		]);

		const failuresByPrompt = new Map<string, number>();
		for (const job of recentJobs) {
			if (job.status === "failed" && job.data?.promptId) {
				failuresByPrompt.set(job.data.promptId, (failuresByPrompt.get(job.data.promptId) || 0) + 1);
			}
		}

		const now = Date.now();
		const defaultSchedulerInfo: SchedulerInfo = {
			exists: false,
			nextRunAt: null,
			cadenceHours: null,
		};

		const brandSummaries: BrandScheduleSummary[] = allBrands.map((brand) => {
			const brandPrompts = promptsByBrand[brand.id] || [];
			const delayHours = brand.delayOverrideHours ?? DEFAULT_DELAY_HOURS;
			const runFrequencyMs = delayHours * 60 * 60 * 1000;

			let overduePrompts = 0;
			let onSchedulePrompts = 0;
			let scheduledCount = 0;

			const promptStatuses: PromptScheduleStatus[] = brandPrompts.map((prompt) => {
				const lastRuns = lastRunsMap[prompt.id] || {};
				const lastRunsByModelGroup: PromptScheduleStatus["lastRunsByModelGroup"] = {};

				let anyOverdue = false;

				for (const modelGroup of ["openai", "anthropic", "google"] as const) {
					const lastRunAt = lastRuns[modelGroup] || null;
					let isOverdue = false;
					let overdueByMs: number | null = null;

					if (prompt.enabled) {
						if (lastRunAt) {
							const timeSinceRun = now - new Date(lastRunAt).getTime();
							if (timeSinceRun > runFrequencyMs) {
								isOverdue = true;
								overdueByMs = timeSinceRun - runFrequencyMs;
								anyOverdue = true;
							}
						} else {
							isOverdue = true;
							anyOverdue = true;
						}
					}

					lastRunsByModelGroup[modelGroup] = {
						lastRunAt,
						isOverdue,
						overdueByMs,
					};
				}

				const scheduleInfo = scheduleMap.get(prompt.id);
				const schedulerInfo: SchedulerInfo = scheduleInfo
					? {
							exists: true,
							nextRunAt: scheduleInfo.nextRunAt,
							cadenceHours: scheduleInfo.cadenceHours,
						}
					: defaultSchedulerInfo;

				// Get job status
				const activeJob = activeJobMap.get(prompt.id);

				// Count enabled prompts that have a pending job (created/active/retry)
				if (prompt.enabled && activeJob) scheduledCount++;

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
					lastRunsByModelGroup,
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

		return NextResponse.json({
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
		});
	} catch (error) {
		console.error("Error fetching workflow data:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const body = await request.json();
		const { action, promptId, brandId } = body;

		// Handle retry all overdue action
		if (action === "retry-all-overdue") {
			return await handleRetryAllOverdue(brandId);
		}

		// Handle single prompt retry (legacy and default behavior)
		if (!promptId || typeof promptId !== "string") {
			return NextResponse.json({ error: "promptId is required" }, { status: 400 });
		}

		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		if (!prompt.enabled) {
			return NextResponse.json({ error: "Prompt is disabled" }, { status: 400 });
		}

		// Send an immediate job to process the prompt
		const success = await sendImmediatePromptJob(promptId);
		if (!success) {
			return NextResponse.json({ error: "Failed to send job" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			message: `Triggered immediate job for prompt ${promptId}`,
		});
	} catch (error) {
		console.error("Error triggering job:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * Retry all overdue prompts - sends immediate jobs for all prompts that are past their run frequency.
 */
async function handleRetryAllOverdue(brandId?: string): Promise<NextResponse> {
	try {
		// Get all enabled brands and their prompts
		const allBrands = await db.query.brands.findMany({
			where: brandId ? eq(brands.id, brandId) : undefined,
		});

		const enabledBrandIds = allBrands.filter((b) => b.enabled).map((b) => b.id);

		// Get all enabled prompts for enabled brands
		const allPrompts = await db.query.prompts.findMany();
		const enabledPrompts = allPrompts.filter(
			(p) => p.enabled && enabledBrandIds.includes(p.brandId),
		);

		// Get last runs for all prompts
		const lastRunsQuery = await db
			.select({
				promptId: promptRuns.promptId,
				modelGroup: promptRuns.modelGroup,
				lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
			})
			.from(promptRuns)
			.groupBy(promptRuns.promptId, promptRuns.modelGroup);

		const lastRunsMap: Record<string, Record<string, Date>> = {};
		for (const run of lastRunsQuery) {
			if (!lastRunsMap[run.promptId]) {
				lastRunsMap[run.promptId] = {};
			}
			lastRunsMap[run.promptId][run.modelGroup] = run.lastRunAt;
		}

		// Build a map of brand delay overrides
		const brandDelayMap: Record<string, number> = {};
		for (const brand of allBrands) {
			brandDelayMap[brand.id] = brand.delayOverrideHours ?? DEFAULT_DELAY_HOURS;
		}

		const now = Date.now();
		const overduePromptIds: string[] = [];

		for (const prompt of enabledPrompts) {
			const delayHours = brandDelayMap[prompt.brandId] ?? DEFAULT_DELAY_HOURS;
			const runFrequencyMs = delayHours * 60 * 60 * 1000;
			const lastRuns = lastRunsMap[prompt.id] || {};

			// Check if any model group is overdue
			let isOverdue = false;
			for (const modelGroup of ["openai", "anthropic", "google"]) {
				const lastRunAt = lastRuns[modelGroup];
				if (!lastRunAt) {
					isOverdue = true; // Never run
					break;
				}
				const timeSinceRun = now - new Date(lastRunAt).getTime();
				if (timeSinceRun > runFrequencyMs) {
					isOverdue = true;
					break;
				}
			}

			if (isOverdue) {
				overduePromptIds.push(prompt.id);
			}
		}

		if (overduePromptIds.length === 0) {
			return NextResponse.json({
				success: true,
				message: "No overdue prompts found",
				retriedCount: 0,
			});
		}

		// Send immediate jobs for all overdue prompts (batch in chunks to avoid overwhelming)
		const BATCH_SIZE = 50;
		let successCount = 0;
		let failCount = 0;

		for (let i = 0; i < overduePromptIds.length; i += BATCH_SIZE) {
			const batch = overduePromptIds.slice(i, i + BATCH_SIZE);
			const results = await Promise.allSettled(
				batch.map((pid) => sendImmediatePromptJob(pid)),
			);

			for (const result of results) {
				if (result.status === "fulfilled" && result.value) {
					successCount++;
				} else {
					failCount++;
				}
			}

			// Small delay between batches to avoid rate limiting
			if (i + BATCH_SIZE < overduePromptIds.length) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		return NextResponse.json({
			success: true,
			message: `Triggered jobs for ${successCount} overdue prompts${failCount > 0 ? ` (${failCount} failed)` : ""}`,
			retriedCount: successCount,
			failedCount: failCount,
			totalOverdue: overduePromptIds.length,
		});
	} catch (error) {
		console.error("Error retrying all overdue:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
