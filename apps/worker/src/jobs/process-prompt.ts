import * as Sentry from "@sentry/node";
import type { Entitlements } from "@workspace/config/entitlements";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import {
	type Brand,
	brands,
	type Competitor,
	citations,
	competitors,
	promptRuns,
	prompts,
	usageEvents,
} from "@workspace/lib/db/schema";
import { getOrgEntitlements } from "@workspace/lib/entitlements";
import { analyzeMentions } from "@workspace/lib/mentions";
import { getProvider, type ModelConfig, type Provider } from "@workspace/lib/providers";
import { failureBackoffHours } from "@workspace/lib/run-backoff";
import {
	dailyRunCeiling,
	lastRunQueryWindowMs,
	lastRunsByTargetKey,
	type PromptRunPlan,
	resolveBrandPromptRunPlans,
	selectDueTargets,
	slowestIntervalHours,
	targetKey,
} from "@workspace/lib/run-policy";
import type { Citation } from "@workspace/lib/text-extraction";
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";
import { trackWorkerEvent } from "../telemetry";

export interface ProcessPromptData {
	promptId: string;
	/** Accepted for queued jobs created by older app versions; the worker resolves cadence from current policy. */
	cadenceHours?: number;
	/** Cycles in a row where every run failed, carried forward to size the backoff. */
	consecutiveFailures?: number;
}

/**
 * Queue options for a process-prompt job, wherever it's scheduled from.
 *
 * The expiry has to outlast the whole fan-out. A cycle submits every one of its
 * runs at once and each is bounded by the provider's own task ceiling, so the
 * job runs for about as long as its slowest run — which, behind a provider
 * queue deep enough to matter, is that ceiling. If pg-boss expires the job it
 * cannot cancel the running promises, and a retry would pay for the fan-out a
 * second time.
 *
 * `retryLimit: 0` for the same reason from the other side. By the time this job
 * can fail it has already submitted paid requests, and a queue-level retry
 * re-submits the whole fan-out including the runs that succeeded. Recovery goes
 * through the handler's own backoff reschedule instead, or through
 * schedule-maintenance for a job that died before reaching it.
 */
export const PROMPT_JOB_OPTIONS = {
	retryLimit: 0,
	expireInSeconds: 90 * 60,
} as const;

interface PromptContext {
	prompt: typeof prompts.$inferSelect;
	brand: Brand;
	competitors: Competitor[];
}

/**
 * Schedule the next run for a prompt.
 *
 * Normally that's one cadence away; after a cycle where every run failed it's
 * the shorter backoff from failureBackoffHours, and `consecutiveFailures` rides
 * along on the job so the next failure can lengthen it again.
 */
async function scheduleNextRun(promptId: string, cadenceHours: number, consecutiveFailures: number): Promise<void> {
	const delayHours = failureBackoffHours(consecutiveFailures, cadenceHours);
	const startAfterSeconds = Math.round(delayHours * 60 * 60);

	try {
		await boss.send(
			"process-prompt",
			{ promptId, consecutiveFailures },
			{
				singletonKey: `prompt-${promptId}`,
				singletonSeconds: startAfterSeconds, // Prevent duplicates until the next attempt is due
				startAfter: startAfterSeconds,
				...PROMPT_JOB_OPTIONS,
			},
		);
		const reason = consecutiveFailures > 0 ? ` (backing off after ${consecutiveFailures} failed cycle(s))` : "";
		console.log(`Scheduled next run for prompt ${promptId} in ${delayHours}h${reason}`);
	} catch (error) {
		console.error(`Failed to schedule next run for prompt ${promptId}:`, error);
		// Don't throw - we don't want to fail the job just because rescheduling failed
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

	const brandCompetitors = await db.query.competitors.findMany({
		where: eq(competitors.brandId, prompt.brandId),
	});

	return {
		prompt,
		brand,
		competitors: brandCompetitors,
	};
}

/**
 * Resolve the prompt's run plan for this firing: entitlements + pool
 * positions + per-target cadence. Everything is looked up fresh so plan
 * changes, cancellations, and platform-pick edits apply on the next firing
 * without touching queued jobs. Outside cloud this reads nothing extra and
 * uses the deployment's fixed run settings.
 */
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
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
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

async function savePromptRun(
	promptId: string,
	brandId: string,
	model: string,
	provider: string | null,
	version: string,
	webSearchEnabled: boolean,
	rawOutput: unknown,
	webQueries: string[],
	brandMentioned: boolean,
	competitorsMentioned: string[],
): Promise<{ id: string; createdAt: Date }> {
	const [result] = await db
		.insert(promptRuns)
		.values({
			promptId,
			brandId,
			model,
			provider,
			version,
			webSearchEnabled,
			rawOutput,
			webQueries,
			brandMentioned,
			competitorsMentioned,
		})
		.returning({ id: promptRuns.id, createdAt: promptRuns.createdAt });

	return result;
}

async function saveCitations(
	promptRunId: string,
	promptId: string,
	brandId: string,
	model: string,
	extracted: Citation[],
	createdAt: Date,
): Promise<void> {
	if (extracted.length === 0) return;

	await db.insert(citations).values(
		extracted.map((c) => ({
			promptRunId,
			promptId,
			brandId,
			model,
			url: c.url,
			domain: c.domain,
			title: c.title || null,
			citationIndex: c.citationIndex,
			createdAt,
		})),
	);
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
	competitorsList,
	config,
	providerImpl,
	runIndex,
}: {
	promptId: string;
	promptValue: string;
	brand: Brand;
	competitorsList: Competitor[];
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
		const { rawOutput, textContent, webQueries, citations: extractedCitations, modelVersion } = result;
		console.log(`${logPrefix} AI call completed, textContent length: ${textContent?.length ?? "null"}`);

		const safeTextContent = typeof textContent === "string" ? textContent : "";

		const { brandMentioned, competitorsMentioned } = analyzeMentions(
			safeTextContent,
			{ name: brand.name, aliases: brand.aliases, domains: [brand.website, ...(brand.additionalDomains ?? [])] },
			competitorsList,
		);

		const recordedVersion = modelVersion ?? config.version ?? config.provider;

		const { id: promptRunId, createdAt } = await savePromptRun(
			promptId,
			brand.id,
			config.model,
			config.provider,
			recordedVersion,
			config.webSearch,
			rawOutput,
			webQueries,
			brandMentioned,
			competitorsMentioned,
		);
		console.log(`${logPrefix} Saved prompt run ${promptRunId}`);

		await saveCitations(promptRunId, promptId, brand.id, config.model, extractedCitations, createdAt);
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
			scope.setTag("queue", "process-prompt");
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

/**
 * One run of a prompt: work out what is due now, run it, and queue the next
 * run. Returning without queueing one stops the prompt until
 * schedule-maintenance starts it again, once the plan produces targets.
 */
async function processPrompt(
	promptId: string,
	scrapeConfigs: ModelConfig[],
	consecutiveFailures: number,
): Promise<void> {
	console.log(`Processing prompt ${promptId}`);

	const context = await getPromptContext(promptId);
	if (!context) {
		// The prompt was deleted: complete the job and queue nothing further.
		console.log(`Prompt ${promptId} not found, skipping (no reschedule)`);
		return;
	}

	const { prompt, brand, competitors: competitorsList } = context;

	if (!prompt.enabled || !brand.enabled) {
		console.log(`Prompt ${promptId} or brand ${brand.id} is disabled, skipping but rescheduling`);
		// Still reschedule at the brand cadence - the prompt might be enabled later
		await scheduleNextRun(promptId, brand.delayOverrideHours ?? getDefaultDelayHours(), 0);
		return;
	}

	const { plan, entitlements } = await resolvePlanForPrompt(context, scrapeConfigs);
	if (plan.targets.length === 0 || plan.rescheduleHours === null) {
		// Nothing to run and nothing to wait for: unentitled org, no platform
		// picks, or outside the plan pool. The prompt stops here — it queues no
		// next run — and schedule-maintenance starts it again within one pass of
		// the plan producing targets (resubscribe, upgrade, new picks).
		console.log(`Prompt ${promptId} has no runnable targets (org ${brand.organizationId}); stopping until entitled`);
		return;
	}

	const lastRuns = await getLastRunsByTargetKey(promptId, slowestIntervalHours(plan.targets));
	const dueTargets = selectDueTargets(plan.targets, lastRuns, new Date());

	if (dueTargets.length === 0) {
		// Fired early (expedite, duplicate send): everything is fresh. Keep the
		// prompt going without spending anything.
		console.log(`Prompt ${promptId}: no targets due yet, rescheduling in ${plan.rescheduleHours}h`);
		await scheduleNextRun(promptId, plan.rescheduleHours, 0);
		return;
	}

	const ceiling = dailyRunCeiling(entitlements);
	if (ceiling !== null && (await isOrgOverDailyCeiling(brand.organizationId, ceiling))) {
		console.warn(`Org ${brand.organizationId} is over its daily run ceiling (${ceiling}); skipping this cycle`);
		Sentry.withScope((scope) => {
			scope.setLevel("warning");
			scope.setTag("scheduler", "org-daily-ceiling");
			scope.setFingerprint(["org-daily-ceiling", brand.organizationId]);
			Sentry.captureMessage(`Org ${brand.organizationId} hit its daily run ceiling (${ceiling})`, "warning");
		});
		await scheduleNextRun(promptId, plan.rescheduleHours, 0);
		return;
	}

	console.log(
		`Processing prompt "${prompt.value}" for brand "${brand.name}" — ${dueTargets.length}/${plan.targets.length} targets due`,
	);

	const runPromises = dueTargets.flatMap((target) => {
		const providerImpl = getProvider(target.config.provider);
		return Array.from({ length: target.replication }, (_, i) =>
			runModelIteration({
				promptId,
				promptValue: prompt.value,
				brand,
				competitorsList,
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

		// Log failures but don't throw if some succeeded
		console.error(`Prompt ${promptId} had ${failures.length}/${runPromises.length} failed runs: ${errorMessages}`);
	}

	const successCount = runPromises.length - failures.length;
	console.log(`Completed prompt ${promptId}: ${successCount}/${runPromises.length} successful runs`);

	trackWorkerEvent("prompt_processed", {
		brand_id: brand.id,
		models: [...new Set(dueTargets.map((t) => t.config.model))],
		providers: [...new Set(dueTargets.map((t) => t.config.provider))],
		total_runs: runPromises.length,
		successful_runs: successCount,
		failed_runs: failures.length,
	});

	// A cycle where nothing came back means the targets themselves are failing,
	// so the next attempt backs off instead of running on cadence. Anything that
	// produced a run clears the streak. The cap is how often the prompt runs
	// (rescheduleHours, its fastest target), so a prompt that stays broken costs
	// what a healthy one costs rather than more.
	const failedCycles = runPromises.length > 0 && successCount === 0 ? consecutiveFailures + 1 : 0;
	await scheduleNextRun(promptId, plan.rescheduleHours, failedCycles);
}

/**
 * Process a prompt - runs AI models and saves results.
 * This is a pg-boss job handler, called when a scheduled job fires.
 * After a cycle it schedules the next run: on cadence when anything came back,
 * on a backoff when nothing did.
 */
export async function processPromptJob(jobs: Job<ProcessPromptData>[]): Promise<void> {
	const scrapeConfigs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

	// pg-boss v12 passes an array of jobs - process each one
	for (const job of jobs) {
		await processPrompt(job.data.promptId, scrapeConfigs, job.data.consecutiveFailures ?? 0);
	}
}
