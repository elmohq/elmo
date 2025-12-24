import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { brands, prompts, promptRuns } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { devPromptQueue, prodPromptQueue } from "@/worker/queues";
import { DEFAULT_DELAY_MS, recreatePromptJobScheduler } from "@/lib/job-scheduler";

export const dynamic = "force-dynamic";

// Model groups we track
const MODEL_GROUPS = ["openai", "anthropic", "google"] as const;
type ModelGroup = (typeof MODEL_GROUPS)[number];

interface SchedulerInfo {
	exists: boolean;
	nextRunAt: number | null;
	iterationCount: number | null;
	every: number | null;
}

interface PromptScheduleStatus {
	promptId: string;
	promptValue: string;
	brandId: string;
	brandName: string;
	enabled: boolean;
	runFrequencyMs: number;
	lastRunsByModelGroup: {
		[K in ModelGroup]?: {
			lastRunAt: Date | null;
			isOverdue: boolean;
			overdueByMs: number | null;
		};
	};
	schedulerInfo: {
		dev: SchedulerInfo;
		prod: SchedulerInfo;
	};
	recentFailures: {
		dev: number;
		prod: number;
	};
	isActiveOrWaiting: {
		dev: boolean;
		prod: boolean;
	};
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
	schedulerCoverage: {
		dev: { scheduled: number; total: number };
		prod: { scheduled: number; total: number };
	};
	prompts: PromptScheduleStatus[];
}

interface QueueStats {
	name: string;
	environment: "dev" | "prod";
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	schedulersCount: number;
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
	stacktrace: string[] | null;
	returnValue: any;
	environment: "dev" | "prod";
}

async function getQueueStats(queue: Queue, environment: "dev" | "prod"): Promise<QueueStats> {
	try {
		const jobCounts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
		const schedulersCount = await queue.getJobSchedulersCount();

		return {
			name: queue.name,
			environment,
			waiting: jobCounts.waiting || 0,
			active: jobCounts.active || 0,
			completed: jobCounts.completed || 0,
			failed: jobCounts.failed || 0,
			delayed: jobCounts.delayed || 0,
			schedulersCount,
		};
	} catch (error) {
		console.error(`Error getting queue stats for ${queue.name}:`, error);
		return {
			name: queue.name,
			environment,
			waiting: 0,
			active: 0,
			completed: 0,
			failed: 0,
			delayed: 0,
			schedulersCount: 0,
		};
	}
}

async function getRecentJobs(queue: Queue, environment: "dev" | "prod", limit: number = 50): Promise<RecentJob[]> {
	try {
		const [failedJobs, completedJobs] = await Promise.all([
			queue.getFailed(0, limit - 1),
			queue.getCompleted(0, limit - 1),
		]);

		const failed: RecentJob[] = failedJobs.map((job) => ({
			id: job.id || "",
			name: job.name,
			data: job.data as { promptId?: string },
			status: "failed" as const,
			failedReason: job.failedReason || "Unknown",
			attemptsMade: job.attemptsMade,
			timestamp: job.timestamp,
			processedOn: job.processedOn || null,
			finishedOn: job.finishedOn || null,
			stacktrace: job.stacktrace || null,
			returnValue: null,
			environment,
		}));

		const completed: RecentJob[] = completedJobs.map((job) => ({
			id: job.id || "",
			name: job.name,
			data: job.data as { promptId?: string },
			status: "completed" as const,
			failedReason: null,
			attemptsMade: job.attemptsMade,
			timestamp: job.timestamp,
			processedOn: job.processedOn || null,
			finishedOn: job.finishedOn || null,
			stacktrace: null,
			returnValue: job.returnvalue,
			environment,
		}));

		return [...failed, ...completed];
	} catch (error) {
		console.error(`Error getting recent jobs for ${queue.name}:`, error);
		return [];
	}
}

interface SchedulerDetails {
	promptId: string;
	info: SchedulerInfo;
}

async function getSchedulerDetails(queue: Queue): Promise<Map<string, SchedulerInfo>> {
	const schedulerMap = new Map<string, SchedulerInfo>();

	try {
		const schedulers = await queue.getJobSchedulers(0, -1);

		for (const scheduler of schedulers) {
			// Scheduler key format: repeater-{promptId}
			if (scheduler.key.startsWith("repeater-")) {
				const promptId = scheduler.key.substring("repeater-".length);
				schedulerMap.set(promptId, {
					exists: true,
					nextRunAt: scheduler.next || null,
					iterationCount: scheduler.iterationCount || null,
					every: scheduler.every || null,
				});
			}
		}
	} catch (error) {
		console.error(`Error getting job schedulers for ${queue.name}:`, error);
	}

	return schedulerMap;
}

async function getActiveOrWaitingPromptIds(queue: Queue): Promise<Set<string>> {
	const promptIds = new Set<string>();

	try {
		const [activeJobs, waitingJobs] = await Promise.all([queue.getActive(0, 100), queue.getWaiting(0, 100)]);

		for (const job of [...activeJobs, ...waitingJobs]) {
			if (job.data?.promptId) {
				promptIds.add(job.data.promptId);
			}
		}
	} catch (error) {
		console.error(`Error getting active/waiting jobs for ${queue.name}:`, error);
	}

	return promptIds;
}

export async function GET() {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		// Get all brands with their delay overrides
		const allBrands = await db.query.brands.findMany({
			orderBy: desc(brands.createdAt),
		});

		// Get all prompts
		const allPrompts = await db.query.prompts.findMany();

		// Group prompts by brand
		const promptsByBrand: Record<string, typeof allPrompts> = {};
		for (const prompt of allPrompts) {
			if (!promptsByBrand[prompt.brandId]) {
				promptsByBrand[prompt.brandId] = [];
			}
			promptsByBrand[prompt.brandId].push(prompt);
		}

		// Get the last run for each prompt and model group combination
		const lastRunsQuery = await db
			.select({
				promptId: promptRuns.promptId,
				modelGroup: promptRuns.modelGroup,
				lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
			})
			.from(promptRuns)
			.groupBy(promptRuns.promptId, promptRuns.modelGroup);

		// Create a map of promptId -> modelGroup -> lastRunAt
		const lastRunsMap: Record<string, Record<ModelGroup, Date>> = {};
		for (const run of lastRunsQuery) {
			if (!lastRunsMap[run.promptId]) {
				lastRunsMap[run.promptId] = {} as Record<ModelGroup, Date>;
			}
			lastRunsMap[run.promptId][run.modelGroup as ModelGroup] = run.lastRunAt;
		}

		// Get scheduler details from both dev and prod queues
		const [devSchedulerDetails, prodSchedulerDetails, devActiveWaiting, prodActiveWaiting] = await Promise.all([
			getSchedulerDetails(devPromptQueue),
			getSchedulerDetails(prodPromptQueue),
			getActiveOrWaitingPromptIds(devPromptQueue),
			getActiveOrWaitingPromptIds(prodPromptQueue),
		]);

		// Get queue stats and recent jobs from both environments
		const [devQueueStats, prodQueueStats, devRecentJobs, prodRecentJobs] = await Promise.all([
			getQueueStats(devPromptQueue, "dev"),
			getQueueStats(prodPromptQueue, "prod"),
		getRecentJobs(devPromptQueue, "dev", 5000),
		getRecentJobs(prodPromptQueue, "prod", 5000),
		]);

		// Count failures by promptId
		const devFailuresByPrompt = new Map<string, number>();
		const prodFailuresByPrompt = new Map<string, number>();

		for (const job of devRecentJobs) {
			if (job.status === "failed" && job.data?.promptId) {
				devFailuresByPrompt.set(job.data.promptId, (devFailuresByPrompt.get(job.data.promptId) || 0) + 1);
			}
		}
		for (const job of prodRecentJobs) {
			if (job.status === "failed" && job.data?.promptId) {
				prodFailuresByPrompt.set(job.data.promptId, (prodFailuresByPrompt.get(job.data.promptId) || 0) + 1);
			}
		}

		const now = new Date().getTime();

		const defaultSchedulerInfo: SchedulerInfo = {
			exists: false,
			nextRunAt: null,
			iterationCount: null,
			every: null,
		};

		// Build brand summaries
		const brandSummaries: BrandScheduleSummary[] = allBrands.map((brand) => {
			const brandPrompts = promptsByBrand[brand.id] || [];
			const runFrequencyMs = brand.delayOverrideMs ?? DEFAULT_DELAY_MS;

			let overduePrompts = 0;
			let onSchedulePrompts = 0;
			let devScheduled = 0;
			let prodScheduled = 0;

			const promptStatuses: PromptScheduleStatus[] = brandPrompts.map((prompt) => {
				const lastRuns = lastRunsMap[prompt.id] || {};
				const lastRunsByModelGroup: PromptScheduleStatus["lastRunsByModelGroup"] = {};

				let anyOverdue = false;

				for (const modelGroup of MODEL_GROUPS) {
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
							// Never run - consider it overdue if prompt is enabled
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

				const devSchedulerInfo = devSchedulerDetails.get(prompt.id) || defaultSchedulerInfo;
				const prodSchedulerInfo = prodSchedulerDetails.get(prompt.id) || defaultSchedulerInfo;

				if (devSchedulerInfo.exists) devScheduled++;
				if (prodSchedulerInfo.exists) prodScheduled++;

				if (prompt.enabled) {
					if (anyOverdue) {
						overduePrompts++;
					} else {
						onSchedulePrompts++;
					}
				}

				return {
					promptId: prompt.id,
					promptValue: prompt.value,
					brandId: brand.id,
					brandName: brand.name,
					enabled: prompt.enabled,
					runFrequencyMs,
					lastRunsByModelGroup,
					schedulerInfo: {
						dev: devSchedulerInfo,
						prod: prodSchedulerInfo,
					},
					recentFailures: {
						dev: devFailuresByPrompt.get(prompt.id) || 0,
						prod: prodFailuresByPrompt.get(prompt.id) || 0,
					},
					isActiveOrWaiting: {
						dev: devActiveWaiting.has(prompt.id),
						prod: prodActiveWaiting.has(prompt.id),
					},
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
				schedulerCoverage: {
					dev: { scheduled: devScheduled, total: enabledPrompts },
					prod: { scheduled: prodScheduled, total: enabledPrompts },
				},
				prompts: promptStatuses,
			};
		});

		// Calculate overall stats
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
			queues: {
				dev: devQueueStats,
				prod: prodQueueStats,
			},
			recentJobs: [...devRecentJobs, ...prodRecentJobs].sort((a, b) => b.timestamp - a.timestamp),
			brands: brandSummaries,
			currentEnvironment: process.env.ENVIRONMENT || "dev",
		});
	} catch (error) {
		console.error("Error fetching workflow data:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

// POST endpoint to retry a failed job for a prompt
export async function POST(request: NextRequest) {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const body = await request.json();
		const { promptId, environment, jobId } = body;

		if (!environment || (environment !== "dev" && environment !== "prod")) {
			return NextResponse.json({ error: "environment must be 'dev' or 'prod'" }, { status: 400 });
		}

		const queue = environment === "prod" ? prodPromptQueue : devPromptQueue;

		// If jobId is provided, retry that specific job
		if (jobId) {
			const job = await queue.getJob(jobId);
			if (!job) {
				return NextResponse.json({ error: "Job not found" }, { status: 404 });
			}

			const isFailed = await job.isFailed();
			if (!isFailed) {
				return NextResponse.json({ error: "Job is not in failed state" }, { status: 400 });
			}

			await job.retry();

			return NextResponse.json({
				success: true,
				message: `Retrying job ${jobId} in ${environment}`,
				jobId: job.id,
			});
		}

		// If only promptId is provided, find the most recent failed job for this prompt
		if (!promptId || typeof promptId !== "string") {
			return NextResponse.json({ error: "Either jobId or promptId is required" }, { status: 400 });
		}

		// Verify prompt exists and is enabled
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		if (!prompt.enabled) {
			return NextResponse.json({ error: "Prompt is disabled" }, { status: 400 });
		}

		// Find the most recent failed job for this prompt
		const failedJobs = await queue.getFailed(0, 100);
		const promptFailedJob = failedJobs
			.filter((job) => job.data?.promptId === promptId)
			.sort((a, b) => b.timestamp - a.timestamp)[0];

		if (!promptFailedJob) {
			// No failed job found - recreate the job scheduler instead
			const success = await recreatePromptJobScheduler(promptId, queue);

			if (!success) {
				return NextResponse.json({ error: "Failed to recreate job scheduler" }, { status: 500 });
			}

			return NextResponse.json({
				success: true,
				message: `No failed job found - recreated job scheduler for prompt ${promptId} in ${environment}`,
				recreatedScheduler: true,
			});
		}

		await promptFailedJob.retry();

		return NextResponse.json({
			success: true,
			message: `Retrying failed job for prompt ${promptId} in ${environment}`,
			jobId: promptFailedJob.id,
		});
	} catch (error) {
		console.error("Error triggering retry:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
