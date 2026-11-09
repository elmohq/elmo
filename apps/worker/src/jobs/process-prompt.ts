import * as Sentry from "@sentry/node";
import type { Entitlements } from "@workspace/config/entitlements";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { type Brand, brands, promptRuns, prompts, usageEvents } from "@workspace/lib/db/schema";
import { getOrgEntitlements } from "@workspace/lib/entitlements";
import { getProvider, type ModelConfig, type Provider } from "@workspace/lib/providers";
import { PROCESS_PROMPT_QUEUE, PROMPT_JOB_OPTIONS, promptSingletonKey } from "@workspace/lib/queues/prompt-jobs";
import {
	afterPromptCycle,
	dailyRunCeiling,
	decidePromptCycle,
	lastRunQueryWindowMs,
	lastRunsByTargetKey,
	type PromptCycleAction,
	type PromptCycleState,
	type PromptRunPlan,
	resolveBrandPromptRunPlans,
	slowestIntervalHours,
	type TargetPlan,
} from "@workspace/lib/run-policy";
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { getBoss } from "../boss";
import { trackWorkerEvent } from "../telemetry";
import { DERIVE_PRIORITY, sendDeriveRuns } from "./derive-runs";

export interface ProcessPromptData {
	promptId: string;
	/** Accepted for queued jobs created by older app versions; the worker resolves cadence from current policy. */
	cadenceHours?: number;
	/** Cycles in a row where every run failed, carried forward to size the backoff. */
	consecutiveFailures?: number;
}

interface PromptContext {
	prompt: typeof prompts.$inferSelect;
	brand: Brand;
}

async function scheduleNextRun(promptId: string, delayHours: number, consecutiveFailures: number): Promise<void> {
	const startAfterSeconds = Math.round(delayHours * 60 * 60);

	try {
		await getBoss().send(
			PROCESS_PROMPT_QUEUE,
			{ promptId, consecutiveFailures },
			{
				singletonKey: promptSingletonKey(promptId),
				singletonSeconds: startAfterSeconds, // Prevent duplicates until the next attempt is due
				startAfter: startAfterSeconds,
				...PROMPT_JOB_OPTIONS,
			},
		);
		const reason = consecutiveFailures > 0 ? ` (backing off after ${consecutiveFailures} failed cycle(s))` : "";
		console.log(`Scheduled next run for prompt ${promptId} in ${delayHours}h${reason}`);
	} catch (error) {
		console.error(`Failed to schedule next run for prompt ${promptId}:`, error);
		// The cycle's runs are already saved; a failed reschedule shouldn't fail the job.
	}
}

async function getPromptContext(promptId: string): Promise<PromptContext | null> {
	const prompt = await db.query.prompts.findFirst({
		where: eq(prompts.id, promptId),
	});

	if (!prompt) {
		console.error(`Prompt not found: ${promptId}`);
		return null;
	}

	const brand = await db.query.brands.findFirst({
		where: eq(brands.id, prompt.brandId),
	});

	if (!brand) {
		console.error(`Brand not found: ${prompt.brandId}`);
		return null;
	}

	return { prompt, brand };
}

/** Outside cloud this reads nothing extra and uses the deployment's fixed run settings. */
async function resolvePlanForPrompt(
	context: PromptContext,
	scrapeTargets: ModelConfig[],
): Promise<{ plan: PromptRunPlan; entitlements: Entitlements }> {
	const { prompt, brand } = context;
	const entitlements = await getOrgEntitlements(brand.organizationId);

	const orgPrompts = entitlements.unlimited
		? []
		: await db
				.select({ id: prompts.id, createdAt: prompts.createdAt, premiumModels: prompts.premiumModels })
				.from(prompts)
				.innerJoin(brands, eq(prompts.brandId, brands.id))
				.where(and(eq(brands.organizationId, brand.organizationId), eq(prompts.enabled, true)));

	const plans = resolveBrandPromptRunPlans({
		scrapeTargets,
		defaultDelayHours: getDefaultDelayHours(),
		entitlements,
		orgPrompts,
		brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
		prompts: [{ id: prompt.id, premiumModels: prompt.premiumModels }],
	});
	const plan = plans.get(prompt.id) ?? { targets: [], rescheduleHours: null };
	return { plan, entitlements };
}

/** Last successful run per target within the cadence lookup window. */
async function getLastRunsByTargetKey(promptId: string, maxIntervalHours: number): Promise<Map<string, Date>> {
	const windowStart = new Date(Date.now() - lastRunQueryWindowMs(maxIntervalHours));
	const rows = await db
		.select({
			model: promptRuns.model,
			provider: promptRuns.provider,
			webSearchEnabled: promptRuns.webSearchEnabled,
			lastRunAt: sql<string>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.where(and(eq(promptRuns.promptId, promptId), gt(promptRuns.createdAt, windowStart)))
		.groupBy(promptRuns.model, promptRuns.provider, promptRuns.webSearchEnabled);

	return lastRunsByTargetKey(rows);
}

/**
 * Runaway protection: how many provider attempts the org has recorded in the
 * last 24h, compared against its plan-derived ceiling before spending more.
 *
 * Counts usage_events rather than prompt_runs because a retry storm writes no prompt_runs
 * rows but burns spend — counting attempts is the stronger meaning for a
 * safety ceiling. usage_events also has the org_id denormalized and an
 * index on (organization_id, created_at), so this scan is cheap.
 */
async function isOrgOverDailyCeiling(organizationId: string, ceiling: number): Promise<boolean> {
	const [row] = await db
		.select({ value: sql<number>`COUNT(*)` })
		.from(usageEvents)
		.where(
			and(eq(usageEvents.organizationId, organizationId), gt(usageEvents.createdAt, sql`now() - interval '24 hours'`)),
		);
	return Number(row?.value ?? 0) >= ceiling;
}

/**
 * Billing-grade attribution: one row per provider call, success
 * or failure. Never fails the run — attribution must not break tracking.
 */
async function recordUsageEvent(input: {
	organizationId: string;
	brandId: string;
	promptId: string;
	eventType: "prompt_run" | "prompt_run_failed";
	config: ModelConfig;
}): Promise<void> {
	try {
		const cost = estimateRunCostUsd(input.config.provider, input.config.webSearch);
		await db.insert(usageEvents).values({
			organizationId: input.organizationId,
			brandId: input.brandId,
			promptId: input.promptId,
			eventType: input.eventType,
			provider: input.config.provider,
			model: input.config.model,
			webSearchEnabled: input.config.webSearch,
			units: 1,
			estimatedCostUsd: cost === null ? null : cost.toFixed(6),
		});
	} catch (error) {
		console.error("Failed to record usage event:", error);
	}
}

async function runModelIteration({
	promptId,
	promptValue,
	brand,
	config,
	providerImpl,
	runIndex,
}: {
	promptId: string;
	promptValue: string;
	brand: Brand;
	config: ModelConfig;
	providerImpl: Provider;
	runIndex: number;
}): Promise<void> {
	const logPrefix = `[${config.model}_${runIndex}]`;

	try {
		const result = await providerImpl.run(config.model, promptValue, {
			webSearch: config.webSearch,
			version: config.version,
		});

		// `webQueries` is stored exactly as the provider reported it — engines do
		// sometimes genuinely search the prompt verbatim, and that's real data. The
		// fan-out page excludes verbatim repeats at read time as a display rule;
		// providers whose query field is fabricated (DataForSEO) write the
		// `unavailable` sentinel in their own extractor instead.
		const { rawOutput, webQueries, modelVersion } = result;
		const recordedVersion = modelVersion ?? config.version ?? config.provider;

		// Only the answer is saved here. Its text, citations and mentions are derived in their own
		// job, so a bug there can neither lose an answer that's been paid for nor ask for it again.
		const [{ id: promptRunId }] = await db
			.insert(promptRuns)
			.values({
				promptId,
				brandId: brand.id,
				model: config.model,
				provider: config.provider,
				version: recordedVersion,
				webSearchEnabled: config.webSearch,
				rawOutput,
				webQueries,
			})
			.returning({ id: promptRuns.id });
		console.log(`${logPrefix} Saved prompt run ${promptRunId}`);
		// The answer is saved either way; a job that fails to queue here is picked up by the sweep.
		await sendDeriveRuns(getBoss(), brand.id, [promptRunId], DERIVE_PRIORITY.new).catch((error) =>
			console.error(`${logPrefix} Couldn't queue judging for run ${promptRunId}; the sweep will:`, error),
		);

		await recordUsageEvent({
			organizationId: brand.organizationId,
			brandId: brand.id,
			promptId,
			eventType: "prompt_run",
			config,
		});
	} catch (error) {
		// A single run's failure doesn't fail the job, so report it here to keep
		// per-provider failure rates visible.
		Sentry.withScope((scope) => {
			scope.setTag("queue", PROCESS_PROMPT_QUEUE);
			scope.setTag("provider", config.provider);
			scope.setTag("model", config.model);
			scope.setContext("run", { promptId, brandId: brand.id, runIndex });
			Sentry.captureException(error);
		});
		await recordUsageEvent({
			organizationId: brand.organizationId,
			brandId: brand.id,
			promptId,
			eventType: "prompt_run_failed",
			config,
		});
		throw error;
	}
}

// Read fresh every firing so plan, cancellation and platform-pick changes apply without touching queued jobs.
async function gatherCycleState(context: PromptContext, scrapeConfigs: ModelConfig[]): Promise<PromptCycleState> {
	const prompt = { enabled: context.prompt.enabled };
	const brand = { enabled: context.brand.enabled, delayOverrideHours: context.brand.delayOverrideHours };
	const defaultDelayHours = getDefaultDelayHours();

	// A disabled prompt is decided before its plan is read, so don't pay for the lookups.
	if (!prompt.enabled || !brand.enabled) {
		return {
			prompt,
			brand,
			defaultDelayHours,
			plan: { targets: [], rescheduleHours: null },
			lastRunAtByKey: new Map(),
			dailyRunCeiling: null,
		};
	}

	const { plan, entitlements } = await resolvePlanForPrompt(context, scrapeConfigs);
	const lastRunAtByKey =
		plan.targets.length > 0
			? await getLastRunsByTargetKey(context.prompt.id, slowestIntervalHours(plan.targets))
			: new Map<string, Date>();

	return {
		prompt,
		brand,
		defaultDelayHours,
		plan,
		lastRunAtByKey,
		dailyRunCeiling: dailyRunCeiling(entitlements),
	};
}

function logAction(promptId: string, organizationId: string, action: PromptCycleAction): void {
	switch (action.kind) {
		case "stop":
			console.log(
				action.reason === "prompt-gone"
					? `Prompt ${promptId} not found, skipping (no reschedule)`
					: `Prompt ${promptId} has no runnable targets (org ${organizationId}); stopping until entitled`,
			);
			return;
		case "reschedule":
			console.log(`Prompt ${promptId}: ${action.reason}, rescheduling in ${action.delayHours}h`);
			return;
		case "run":
			console.log(`Prompt ${promptId}: running ${action.targets.length} due target(s)`);
	}
}

function reportCeilingHit(organizationId: string, ceiling: number): void {
	console.warn(`Org ${organizationId} is over its daily run ceiling (${ceiling}); skipping this cycle`);
	Sentry.withScope((scope) => {
		scope.setLevel("warning");
		scope.setTag("scheduler", "org-daily-ceiling");
		scope.setFingerprint(["org-daily-ceiling", organizationId]);
		Sentry.captureMessage(`Org ${organizationId} hit its daily run ceiling (${ceiling})`, "warning");
	});
}

async function runCycle(
	context: PromptContext,
	targets: TargetPlan[],
): Promise<{ attempted: number; succeeded: number }> {
	const { prompt, brand } = context;
	const runPromises = targets.flatMap((target) => {
		const providerImpl = getProvider(target.config.provider);
		return Array.from({ length: target.replication }, (_, i) =>
			runModelIteration({
				promptId: prompt.id,
				promptValue: prompt.value,
				brand,
				config: target.config,
				providerImpl,
				runIndex: i + 1,
			}),
		);
	});

	const results = await Promise.allSettled(runPromises);
	const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
	if (failures.length > 0) {
		const errorMessages = failures
			.map((f, i) => `Run ${i + 1}: ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`)
			.join("; ");
		console.error(`Prompt ${prompt.id} had ${failures.length}/${runPromises.length} failed runs: ${errorMessages}`);
	}

	const succeeded = runPromises.length - failures.length;
	console.log(`Completed prompt ${prompt.id}: ${succeeded}/${runPromises.length} successful runs`);
	trackWorkerEvent("prompt_processed", {
		brand_id: brand.id,
		models: [...new Set(targets.map((t) => t.config.model))],
		providers: [...new Set(targets.map((t) => t.config.provider))],
		total_runs: runPromises.length,
		successful_runs: succeeded,
		failed_runs: failures.length,
	});

	return { attempted: runPromises.length, succeeded };
}

async function processPrompt(
	promptId: string,
	scrapeConfigs: ModelConfig[],
	consecutiveFailures: number,
): Promise<void> {
	console.log(`Processing prompt ${promptId}`);

	const context = await getPromptContext(promptId);
	if (!context) {
		logAction(promptId, "unknown", { kind: "stop", reason: "prompt-gone" });
		return;
	}
	const organizationId = context.brand.organizationId;

	const state = await gatherCycleState(context, scrapeConfigs);
	const action = await decidePromptCycle(state, new Date(), async (ceiling) => {
		const over = await isOrgOverDailyCeiling(organizationId, ceiling);
		if (over) reportCeilingHit(organizationId, ceiling);
		return over;
	});
	logAction(promptId, organizationId, action);

	if (action.kind === "stop") return;
	if (action.kind === "reschedule") {
		await scheduleNextRun(promptId, action.delayHours, action.consecutiveFailures);
		return;
	}

	const { attempted, succeeded } = await runCycle(context, action.targets);
	const next = afterPromptCycle({
		attempted,
		succeeded,
		rescheduleHours: action.rescheduleHours,
		consecutiveFailures,
	});
	await scheduleNextRun(promptId, next.delayHours, next.consecutiveFailures);
}

/** After a cycle it schedules the next run: on cadence when anything came back, on a backoff when nothing did. */
export async function processPromptJob(jobs: Job<ProcessPromptData>[]): Promise<void> {
	const scrapeConfigs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

	for (const job of jobs) {
		await processPrompt(job.data.promptId, scrapeConfigs, job.data.consecutiveFailures ?? 0);
	}
}
