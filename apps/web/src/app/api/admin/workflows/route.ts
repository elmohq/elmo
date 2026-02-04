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
		// Check if pgboss archive table exists
		const tableCheck = await client.query(
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pgboss' AND table_name = 'archive')`,
		);
		
		if (!tableCheck.rows[0]?.exists) {
			return [];
		}

		const result = await client.query(
			`SELECT id, name, data, state, output, retrycount, createdon, startedon, completedon
			 FROM pgboss.archive
			 WHERE name = 'process-prompt'
			 ORDER BY completedon DESC NULLS LAST
			 LIMIT $1`,
			[limit],
		);
		return result.rows;
	});

	return jobs.map((row) => {
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
			attemptsMade: row.retrycount || 0,
			timestamp: row.createdon ? new Date(row.createdon).getTime() : 0,
			processedOn: row.startedon ? new Date(row.startedon).getTime() : null,
			finishedOn: row.completedon ? new Date(row.completedon).getTime() : null,
		};
	});
}

interface ScheduleInfo {
	promptId: string;
	cadenceHours: number | null;
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

	for (const row of schedules) {
		// The key is the promptId
		const promptId = row.key;
		if (promptId) {
			// Parse cadence from cron expression
			// Formats: "0 */N * * *" (every N hours) or "0 0 */N * *" (every N days)
			let cadenceHours: number | null = null;
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
			}
			map.set(promptId, { promptId, cadenceHours });
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
			SELECT id, data, state
			FROM pgboss.job
			WHERE name = 'process-prompt'
			  AND state IN ('created', 'active', 'retry')
		`);
		return result.rows;
	});

	const map = new Map<string, ActiveJobInfo>();

	for (const row of jobs) {
		const data = parseJobData(row.data);
		if (data.promptId) {
			map.set(data.promptId, {
				promptId: data.promptId,
				state: row.state as "created" | "active" | "retry",
			});
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
							nextRunAt: null, // pg-boss doesn't expose next run time easily
							cadenceHours: scheduleInfo.cadenceHours,
						}
					: defaultSchedulerInfo;

				if (schedulerInfo.exists) scheduledCount++;

				if (prompt.enabled) {
					if (anyOverdue) {
						overduePrompts++;
					} else {
						onSchedulePrompts++;
					}
				}

				// Get job status
				const activeJob = activeJobMap.get(prompt.id);
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
		const { promptId } = body;

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
