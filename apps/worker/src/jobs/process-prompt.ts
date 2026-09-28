import * as Sentry from "@sentry/node";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { activeCompetitorsOf } from "@workspace/lib/db/competitors";
import { db } from "@workspace/lib/db/db";
import {
	type Brand,
	brands,
	type Competitor,
	citations,
	promptRuns,
	prompts,
	usageEvents,
} from "@workspace/lib/db/schema";
import { type Entitlements, getOrgEntitlements } from "@workspace/lib/entitlements";
import { getProvider, type ModelConfig, type Provider, parseScrapeTargets } from "@workspace/lib/providers";
import {
	dailyRunCeiling,
	ensureNextRunScheduled,
	lastRunQueryWindowMs,
	PROMPT_JOB_OPTIONS,
	type PromptRunPlan,
	resolveBrandPromptRunPlans,
	selectRunTargets,
	targetKey,
} from "@workspace/lib/run-policy";
import { brandEntity, competitorEntity, enqueueSentimentBestEffort, extractAnswerBody } from "@workspace/lib/sentiment";
import { enqueueSourceClassificationsBestEffort } from "@workspace/lib/source-classification";
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
	/**
	 * Operator-triggered run that bypasses the cadence gate. Only the admin
	 * retry endpoint sets it; the job it queues carries retryLimit 0 so a failed
	 * forced fan-out is never re-paid by a queue retry.
	 */
	forceDue?: boolean;
}

export { PROMPT_JOB_OPTIONS };

interface PromptContext {
	prompt: typeof prompts.$inferSelect;
	brand: Brand;
	competitors: Competitor[];
}

/**
 * Schedule the next run for a prompt through the shared exactly-one-chain
 * logic (see ensureNextRunScheduled): an existing future chain job is kept
 * as-is, a missing one is created, and a silently throttled send is revived.
 */
async function scheduleNextRun(promptId: string, cadenceHours: number, consecutiveFailures: number): Promise<void> {
	try {
		const outcome = await ensureNextRunScheduled(promptId, cadenceHours, consecutiveFailures, {
			send: (queue, data, options) => boss.send(queue, data, options),
			listScheduledChainJobs: async (singletonKey) => {
				const rows = await db.execute(
					sql`select id from pgboss.job where name = 'process-prompt' and singleton_key = ${singletonKey} and state = 'created' order by created_on`,
				);
				return rows.rows.map((row) => String((row as { id: unknown }).id));
			},
			cancelChainJob: async (jobId) => {
				await boss.cancel("process-prompt", jobId);
			},
		});
		const reason = consecutiveFailures > 0 ? ` (after ${consecutiveFailures} failed cycle(s))` : "";
		console.log(`Next run for prompt ${promptId}: ${outcome.status}${reason}`);
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
		where: activeCompetitorsOf(prompt.brandId),
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

	const map = new Map<string, Date>();
	for (const row of rows) {
		if (!row.provider) continue;
		map.set(
			targetKey({ model: row.model, provider: row.provider, webSearch: row.webSearchEnabled }),
			new Date(row.lastRunAt),
		);
	}
	return map;
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
}): Promise<Citation[]> {
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
		await enqueueSentiment(promptRunId, brand, competitorsList, rawOutput, config, logPrefix);
		return extractedCitations;
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
 * Best-effort supplemental sentiment for a freshly persisted run: deterministic
 * mention rows for the own brand and the ACTIVE competitor roster, then at most
 * one queued classify-sentiment job when something was mentioned. Never fails
 * the run — the outcome is logged and a missed run is recovered by the
 * sentiment backfill/repair scan.
 */
async function enqueueSentiment(
	promptRunId: string,
	brand: Brand,
	competitorsList: Competitor[],
	rawOutput: unknown,
	config: ModelConfig,
	logPrefix: string,
): Promise<void> {
	const outcome = await enqueueSentimentBestEffort({
		promptRunId,
		brandId: brand.id,
		answerBody: extractAnswerBody(rawOutput, config.provider, config.model),
		entities: [brandEntity(brand), ...competitorsList.map(competitorEntity)],
		sender: boss,
	});
	const detail = "mentions" in outcome ? ` (${outcome.mentions} mention${outcome.mentions === 1 ? "" : "s"})` : "";
	console.log(`${logPrefix} Sentiment enqueue for run ${promptRunId}: ${outcome.status}${detail}`);
}

/**
 * Best-effort supplemental source classification for freshly persisted
 * citations: unique eligible hostnames (valid, not brand/competitor for this
 * brand, no current-version cache row) become one queued
 * classify-source-domain job each, deduplicated against in-flight jobs by
 * singleton key. Runs only after citations are durably saved, and never fails
 * the prompt run — an outage here just means the hostname is retried on a
 * later citation ingest or backfill.
 */
async function enqueueSourceClassifications(
	savedCitations: Citation[],
	brand: Brand,
	competitorsList: Competitor[],
): Promise<void> {
	if (savedCitations.length === 0) return;

	const brandDomains = new Set(
		[extractDomainFromUrl(brand.website), ...(brand.additionalDomains || []).map(extractDomainFromUrl)].filter(Boolean),
	);
	const competitorDomains = new Set(
		competitorsList.flatMap((competitor) => (competitor.domains || []).map(extractDomainFromUrl)).filter(Boolean),
	);

	const { attempted, accepted, deduplicated, failed } = await enqueueSourceClassificationsBestEffort({
		citations: savedCitations,
		brandDomains,
		competitorDomains,
		sender: boss,
	});
	if (attempted > 0) {
		console.log(
			`Source-classification enqueue for brand ${brand.id}: ` +
				`${accepted} accepted, ${deduplicated} deduplicated, ${failed} failed of ${attempted} attempted`,
		);
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
	forceDue: boolean,
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
		// The chain ends here: a disabled prompt owns no future job. Enabling it
		// starts a new chain (the save that enables it, or schedule-maintenance
		// within one pass), so ten thousand disabled prompts cost nothing, not
		// ten thousand no-op jobs per cadence.
		console.log(`Prompt ${promptId} or brand ${brand.id} is disabled, skipping (no reschedule)`);
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

	const maxIntervalHours = Math.max(...plan.targets.map((t) => t.intervalHours));
	const lastRuns = await getLastRunsByTargetKey(promptId, maxIntervalHours);
	if (forceDue) {
		// Audit trail for a paid out-of-cadence run: who asked is logged by the
		// admin endpoint; this records that the worker honored it.
		console.warn(`Force-run: prompt ${promptId} bypassing the cadence gate (operator-triggered)`);
	}
	const dueTargets = selectRunTargets(plan.targets, lastRuns, new Date(), forceDue);

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

	const savedCitations = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
	await enqueueSourceClassifications(savedCitations, brand, competitorsList);

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
		await processPrompt(
			job.data.promptId,
			scrapeConfigs,
			job.data.consecutiveFailures ?? 0,
			job.data.forceDue === true,
		);
	}
}
