import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, promptRuns } from "@workspace/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";
import { createPromptJobScheduler } from "@/lib/job-scheduler";
import { Client } from "pg";
import { getDbosClient } from "@/lib/dbos-client";

export const dynamic = "force-dynamic";

const WORKFLOW_NAME = "processPrompt";

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
	isActiveOrWaiting: boolean;
	isInInitialDelay: boolean;
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
	data: { promptId?: string; initialDelayHours?: number };
	status: "completed" | "failed";
	failedReason: string | null;
	attemptsMade: number;
	timestamp: number;
	processedOn: number | null;
	finishedOn: number | null;
	stacktrace: string[] | null;
	returnValue: any;
}

async function withDbosClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
	const connectionString = process.env.DBOS_SYSTEM_DATABASE_URL;
	if (!connectionString) {
		throw new Error("DBOS_SYSTEM_DATABASE_URL is required");
	}

	const client = new Client({ connectionString });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
}

function parseInputs(raw: unknown): { promptId?: string; initialDelayHours?: number } {
	if (!raw) return {};

	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (Array.isArray(parsed)) {
			return {
				promptId: typeof parsed[0] === "string" ? parsed[0] : undefined,
				initialDelayHours: typeof parsed[1] === "number" ? parsed[1] : undefined,
			};
		}
		if (typeof parsed === "object" && parsed !== null) {
			const obj = parsed as Record<string, unknown>;
			return {
				promptId: typeof obj.promptId === "string" ? obj.promptId : undefined,
				initialDelayHours: typeof obj.initialDelayHours === "number" ? obj.initialDelayHours : undefined,
			};
		}
	} catch {
		// ignore parse failures
	}

	return {};
}

function parseError(raw: unknown): { message: string | null; stack: string[] | null } {
	if (!raw) return { message: null, stack: null };

	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (parsed && typeof parsed === "object") {
			const errorObj = parsed as { message?: string; stack?: string };
			const stack = errorObj.stack ? errorObj.stack.split("\n") : null;
			return { message: errorObj.message ?? "Unknown error", stack };
		}
	} catch {
		// ignore parse failures
	}

	return { message: "Unknown error", stack: null };
}

async function getQueueStats(): Promise<QueueStats> {
	const rows = await withDbosClient(async (client) => {
		const result = await client.query(
			`SELECT
				COUNT(*) FILTER (WHERE status = 'ENQUEUED') AS waiting,
				COUNT(*) FILTER (WHERE status = 'PENDING') AS active,
				COUNT(*) FILTER (WHERE status = 'SUCCESS') AS completed,
				COUNT(*) FILTER (WHERE status = 'ERROR') AS failed
			FROM dbos.workflow_status
			WHERE name = $1`,
			[WORKFLOW_NAME],
		);
		return result.rows[0];
	});

	return {
		name: WORKFLOW_NAME,
		waiting: Number(rows.waiting || 0),
		active: Number(rows.active || 0),
		completed: Number(rows.completed || 0),
		failed: Number(rows.failed || 0),
		delayed: 0,
		schedulersCount: 1,
	};
}

async function getRecentJobs(limit: number = 50): Promise<RecentJob[]> {
	const rows = await withDbosClient(async (client) => {
		const result = await client.query(
			`SELECT workflow_uuid, status, name, inputs, error, created_at, updated_at
			 FROM dbos.workflow_status
			 WHERE name = $1 AND status IN ('SUCCESS', 'ERROR')
			 ORDER BY created_at DESC
			 LIMIT $2`,
			[WORKFLOW_NAME, limit],
		);
		return result.rows;
	});

	return rows.map((row) => {
		const inputs = parseInputs(row.inputs);
		const error = parseError(row.error);
		return {
			id: row.workflow_uuid,
			name: row.name,
			data: inputs,
			status: row.status === "SUCCESS" ? "completed" : "failed",
			failedReason: row.status === "ERROR" ? error.message : null,
			attemptsMade: 0,
			timestamp: Number(row.created_at),
			processedOn: Number(row.created_at),
			finishedOn: Number(row.updated_at || row.created_at),
			stacktrace: row.status === "ERROR" ? error.stack : null,
			returnValue: null,
		};
	});
}

async function getActiveWorkflowMap(): Promise<Map<string, { nextRunAt: number | null; isInInitialDelay: boolean }>> {
	const now = Date.now();
	const rows = await withDbosClient(async (client) => {
		const result = await client.query(
			`SELECT workflow_uuid, status, inputs, created_at
			 FROM dbos.workflow_status
			 WHERE name = $1 AND status IN ('ENQUEUED','PENDING')`,
			[WORKFLOW_NAME],
		);
		return result.rows;
	});

	const map = new Map<string, { nextRunAt: number | null; isInInitialDelay: boolean }>();

	for (const row of rows) {
		const inputs = parseInputs(row.inputs);
		if (!inputs.promptId) continue;

		const createdAt = Number(row.created_at);
		const delayMs = (inputs.initialDelayHours ?? 0) * 60 * 60 * 1000;
		const nextRunAt = delayMs > 0 ? createdAt + delayMs : null;
		const isInInitialDelay = Boolean(nextRunAt && nextRunAt > now);

		map.set(inputs.promptId, { nextRunAt, isInInitialDelay });
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

		const [queueStats, recentJobs, activeWorkflowMap] = await Promise.all([
			getQueueStats(),
			getRecentJobs(5000),
			getActiveWorkflowMap(),
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
			iterationCount: null,
			every: null,
		};

		let initialDelayCount = 0;
		let latestInitialDelayEndAt: number | null = null;

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

				const workflowInfo = activeWorkflowMap.get(prompt.id);
				const schedulerInfo = workflowInfo
					? {
							exists: true,
							nextRunAt: workflowInfo.nextRunAt,
							iterationCount: null,
							every: runFrequencyMs,
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

				if (workflowInfo?.isInInitialDelay) {
					initialDelayCount++;
					if (workflowInfo.nextRunAt && (!latestInitialDelayEndAt || workflowInfo.nextRunAt > latestInitialDelayEndAt)) {
						latestInitialDelayEndAt = workflowInfo.nextRunAt;
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
					schedulerInfo,
					recentFailures: failuresByPrompt.get(prompt.id) || 0,
					isActiveOrWaiting: Boolean(workflowInfo),
					isInInitialDelay: Boolean(workflowInfo?.isInInitialDelay),
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

		// TODO(post-migration): Remove migration status tracking once initialDelayHours is removed
		const migrationStatus = {
			initialDelayRemaining: initialDelayCount,
			totalPrompts,
			latestInitialDelayEndAt,
		};

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
			migration: migrationStatus,
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
		const { promptId, jobId } = body;

		const dbosClient = await getDbosClient();

		if (jobId) {
			await dbosClient.resumeWorkflow(jobId);
			return NextResponse.json({
				success: true,
				message: `Retrying workflow ${jobId}`,
				jobId,
			});
		}

		if (!promptId || typeof promptId !== "string") {
			return NextResponse.json({ error: "Either jobId or promptId is required" }, { status: 400 });
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

		const workflows = await dbosClient.listWorkflows({
			workflowName: WORKFLOW_NAME,
			workflow_id_prefix: `prompt-${promptId}-`,
			status: ["ERROR"],
			limit: 1,
			sortDesc: true,
		});

		if (workflows.length > 0) {
			await dbosClient.resumeWorkflow(workflows[0].workflowID);
			return NextResponse.json({
				success: true,
				message: `Retrying failed workflow for prompt ${promptId}`,
				jobId: workflows[0].workflowID,
			});
		}

		const success = await createPromptJobScheduler(promptId);
		if (!success) {
			return NextResponse.json({ error: "Failed to recreate workflow" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			message: `No failed workflow found - started new workflow for prompt ${promptId}`,
			recreatedScheduler: true,
		});
	} catch (error) {
		console.error("Error triggering retry:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
