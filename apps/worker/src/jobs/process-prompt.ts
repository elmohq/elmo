import * as Sentry from "@sentry/node";
import { getDeployment } from "@workspace/deployment";
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
import { type Entitlements, getOrgEntitlements } from "@workspace/lib/entitlements";
import { getProvider, type ModelConfig, type Provider, parseScrapeTargets } from "@workspace/lib/providers";
import {
	dailyRunCeiling,
	lastRunQueryWindowMs,
	type PromptRunPlan,
	selectDueTargets,
	targetKey,
} from "@workspace/lib/run-policy";
import type { Citation } from "@workspace/lib/text-extraction";
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";
import { trackWorkerEvent } from "../telemetry";
import { resolveBrandPromptRunPlans } from "./run-plans";

export interface ProcessPromptData {
	promptId: string;
	/** Legacy field from pre-policy job payloads; cadence is now resolved fresh each firing. */
	cadenceHours?: number;
}

interface PromptContext {
	prompt: typeof prompts.$inferSelect;
	brand: Brand;
	competitors: Competitor[];
}

/**
 * Schedule the next run for a prompt after the specified cadence.
 */
async function scheduleNextRun(promptId: string, cadenceHours: number): Promise<void> {
	const startAfterSeconds = cadenceHours * 60 * 60;

	try {
		await boss.send(
			"process-prompt",
			{ promptId },
			{
				singletonKey: `prompt-${promptId}`,
				singletonSeconds: startAfterSeconds, // Prevent duplicates for the cadence period
				startAfter: startAfterSeconds,
				retryLimit: 3,
				retryDelay: 60,
				retryBackoff: true,
				expireInSeconds: 60 * 15,
			},
		);
		console.log(`Scheduled next run for prompt ${promptId} in ${cadenceHours}h`);
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
 * reproduces the legacy behavior exactly (asserted by run-policy tests).
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
				.select({ id: prompts.id, createdAt: prompts.createdAt, claudeMode: prompts.claudeMode })
				.from(prompts)
				.innerJoin(brands, eq(prompts.brandId, brands.id))
				.where(and(eq(brands.organizationId, brand.organizationId), eq(prompts.enabled, true)));

	const plans = resolveBrandPromptRunPlans({
		mode: getDeployment().mode,
		scrapeTargets,
		defaultDelayHours: getDefaultDelayHours(),
		entitlements,
		orgPrompts,
		brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
		prompts: [{ id: prompt.id, claudeMode: prompt.claudeMode }],
	});
	const plan = plans.get(prompt.id) ?? { targets: [], rescheduleHours: null };
	return { plan, entitlements };
}

/** Last successful run per target (model + webSearch) inside the dueness window. */
async function getLastRunsByTargetKey(promptId: string, maxIntervalHours: number): Promise<Map<string, Date>> {
	const windowStart = new Date(Date.now() - lastRunQueryWindowMs(maxIntervalHours));
	const rows = await db
		.select({
			model: promptRuns.model,
			webSearchEnabled: promptRuns.webSearchEnabled,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.where(and(eq(promptRuns.promptId, promptId), gt(promptRuns.createdAt, windowStart)))
		.groupBy(promptRuns.model, promptRuns.webSearchEnabled);

	const map = new Map<string, Date>();
	for (const row of rows) {
		map.set(targetKey({ model: row.model, webSearch: row.webSearchEnabled }), new Date(row.lastRunAt));
	}
	return map;
}

/**
 * Runaway protection: how many provider attempts the org has recorded in the
 * last 24h, compared against its plan-derived ceiling before spending more.
 *
 * Counts usage_events rather than prompt_runs because a retry storm (the
 * v0.2.15 pathology that this guard was written for) writes no prompt_runs
 * rows but burns spend — counting attempts is the stronger meaning for a
 * pathology ceiling. usage_events also has the org_id denormalized and an
 * index on (organization_id, created_at), so this scan is cheap.
 */
async function isOrgOverDailyCeiling(organizationId: string, ceiling: number): Promise<boolean> {
	const [row] = await db
		.select({ value: sql<number>`COUNT(*)` })
		.from(usageEvents)
		.where(and(eq(usageEvents.organizationId, organizationId), gt(usageEvents.createdAt, sql`now() - interval '24 hours'`)));
	return Number(row?.value ?? 0) >= ceiling;
}

function extractDomainFromUrl(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

function analyzeMentions(
	content: string,
	brand: Brand,
	competitorsList: Competitor[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();

	const brandNames = [brand.name, ...(brand.aliases || [])].map((n) => n.toLowerCase());
	const brandDomains = [
		extractDomainFromUrl(brand.website),
		...(brand.additionalDomains || []).map(extractDomainFromUrl),
	];
	const brandMentioned =
		brandNames.some((n) => contentLower.includes(n)) || brandDomains.some((d) => contentLower.includes(d));

	const competitorsMentioned = competitorsList
		.filter((competitor) => {
			const names = [competitor.name, ...(competitor.aliases || [])].map((n) => n.toLowerCase());
			const nameMatch = names.some((n) => contentLower.includes(n));
			const domainMatch = (competitor.domains || []).some((d) => contentLower.includes(extractDomainFromUrl(d)));
			return nameMatch || domainMatch;
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
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

		const { brandMentioned, competitorsMentioned } = analyzeMentions(safeTextContent, brand, competitorsList);

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
		// A single run's failure doesn't fail the job (only an all-runs failure
		// does), so report it here to keep per-provider failure rates visible.
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
 * One prompt's firing: resolve what should run now, run it, and schedule the
 * next link in the chain. Returning without rescheduling parks the chain —
 * schedule-maintenance revives it once the run plan produces targets again.
 * Throwing fails the job so pg-boss retries.
 */
async function processPrompt(promptId: string, scrapeConfigs: ModelConfig[]): Promise<void> {
	console.log(`Processing prompt ${promptId}`);

	const context = await getPromptContext(promptId);
	if (!context) {
		// The prompt was deleted: complete the job and let the chain end.
		console.log(`Prompt ${promptId} not found, skipping (no reschedule)`);
		return;
	}

	const { prompt, brand, competitors: competitorsList } = context;

	if (!prompt.enabled || !brand.enabled) {
		console.log(`Prompt ${promptId} or brand ${brand.id} is disabled, skipping but rescheduling`);
		// Still reschedule at the brand cadence - the prompt might be enabled later
		await scheduleNextRun(promptId, brand.delayOverrideHours ?? getDefaultDelayHours());
		return;
	}

	const { plan, entitlements } = await resolvePlanForPrompt(context, scrapeConfigs);
	if (plan.targets.length === 0 || plan.rescheduleHours === null) {
		// Nothing to run and nothing to wait for: unentitled org, no platform
		// picks, or outside the plan pool. The chain parks here — no
		// reschedule — and schedule-maintenance revives it within one tick of
		// the plan producing targets again (resubscribe, upgrade, new picks).
		console.log(`Prompt ${promptId} has no runnable targets (org ${brand.organizationId}); parking chain`);
		return;
	}

	const maxIntervalHours = Math.max(...plan.targets.map((t) => t.intervalHours));
	const lastRuns = await getLastRunsByTargetKey(promptId, maxIntervalHours);
	const dueTargets = selectDueTargets(plan.targets, lastRuns, new Date());

	if (dueTargets.length === 0) {
		// Fired early (expedite, duplicate send): everything is fresh. Keep the
		// chain alive without spending anything.
		console.log(`Prompt ${promptId}: no targets due yet, rescheduling in ${plan.rescheduleHours}h`);
		await scheduleNextRun(promptId, plan.rescheduleHours);
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
		await scheduleNextRun(promptId, plan.rescheduleHours);
		return;
	}

	console.log(
		`Processing prompt "${prompt.value}" for brand "${brand.name}" — ${dueTargets.length}/${plan.targets.length} targets due`,
	);

	// Run all due model iterations in parallel
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

		// If ALL runs failed, throw to trigger retry
		if (failures.length === runPromises.length) {
			throw new Error(`All runs failed for prompt ${promptId}: ${errorMessages}`);
		}
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

	await scheduleNextRun(promptId, plan.rescheduleHours);
}

/**
 * Process a prompt - runs AI models and saves results.
 * This is a pg-boss job handler, called when a scheduled job fires.
 * After successful completion, schedules the next run.
 */
export async function processPromptJob(jobs: Job<ProcessPromptData>[]): Promise<void> {
	const scrapeConfigs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

	// pg-boss v12 passes an array of jobs - process each one
	for (const job of jobs) {
		await processPrompt(job.data.promptId, scrapeConfigs);
	}
}
