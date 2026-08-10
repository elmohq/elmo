import * as Sentry from "@sentry/node";
import type { Job } from "pg-boss";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	citations,
	competitors,
	promptRuns,
	prompts,
	type Brand,
	type Competitor,
} from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { RUNS_PER_PROMPT, getDefaultDelayHours } from "@workspace/lib/constants";
import { failureBackoffHours } from "@workspace/lib/run-backoff";
import {
	getProvider,
	parseScrapeTargets,
	selectTargetsForBrand,
	ProviderUnavailableError,
	type ModelConfig,
	type Provider,
} from "@workspace/lib/providers";
import type { Citation } from "@workspace/lib/text-extraction";
import boss from "../boss";
import { trackWorkerEvent } from "../telemetry";

export interface ProcessPromptData {
	promptId: string;
	cadenceHours?: number; // Hours until next run (for self-rescheduling)
	/** Cycles in a row where every run failed, carried forward to size the backoff. */
	consecutiveFailures?: number;
}

/**
 * Queue options for every process-prompt job, wherever it's scheduled from.
 *
 * `retryLimit: 0` is the important one: by the time this job can fail it has
 * already submitted paid requests to the providers, and most of them bill for
 * work the caller gave up on. A queue-level retry re-submits the whole fan-out —
 * including the runs that succeeded — so a provider having a bad day was
 * costing four times the intended spend before anything else amplified it.
 * Recovery instead goes through the handler's own backoff reschedule, or
 * through schedule-maintenance for a job that died before reaching it.
 *
 * The expiry has to cover a full fan-out queued behind the provider concurrency
 * gate, since a job that expires mid-flight abandons requests already paid for.
 */
export const PROMPT_JOB_OPTIONS = {
	retryLimit: 0,
	expireInSeconds: 60 * 45,
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
			{ promptId, cadenceHours, consecutiveFailures },
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

/**
 * Get the cadence hours for a prompt based on its brand's delay override.
 */
async function getCadenceHours(promptId: string): Promise<number> {
	const defaultDelayHours = getDefaultDelayHours();
	const prompt = await db.query.prompts.findFirst({
		where: eq(prompts.id, promptId),
	});

	if (!prompt) return defaultDelayHours;

	const brand = await db.query.brands.findFirst({
		where: eq(brands.id, prompt.brandId),
	});

	if (!brand) return defaultDelayHours;

	return brand.delayOverrideHours ?? defaultDelayHours;
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
	} catch (error) {
		// A single run's failure doesn't fail the job, so report it here to keep
		// per-provider failure rates visible — except when the run never left the
		// building. A paused provider is this system applying its own back
		// pressure, and the failure that caused the pause was already reported;
		// re-reporting every run it turns away just buries that one.
		if (!(error instanceof ProviderUnavailableError)) {
			Sentry.withScope((scope) => {
				scope.setTag("queue", "process-prompt");
				scope.setTag("provider", config.provider);
				scope.setTag("model", config.model);
				scope.setContext("run", { promptId, brandId: brand.id, runIndex });
				Sentry.captureException(error);
			});
		}
		throw error;
	}
}

/**
 * Collapse a fan-out's failures into one line per distinct message.
 *
 * When a provider is down every run fails the same way, and listing all of them
 * verbatim buries the rest of the log in kilobyte-long repeats of one sentence.
 */
function summarizeFailures(failures: PromiseRejectedResult[]): string {
	const counts = new Map<string, number>();
	for (const { reason } of failures) {
		const message = reason instanceof Error ? reason.message : String(reason);
		counts.set(message, (counts.get(message) ?? 0) + 1);
	}
	return [...counts]
		.sort(([, a], [, b]) => b - a)
		.map(([message, count]) => (count > 1 ? `${message} (×${count})` : message))
		.join("; ");
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
		const { promptId, cadenceHours: providedCadence, consecutiveFailures = 0 } = job.data;
		console.log(`Processing prompt ${promptId}`);

		// Get cadence hours - use provided value or look it up
		const cadenceHours = providedCadence ?? (await getCadenceHours(promptId));

		// Get prompt context
		const context = await getPromptContext(promptId);
		if (!context) {
			console.log(`Prompt ${promptId} not found, skipping (no reschedule)`);
			continue; // Job completes successfully - prompt was deleted, don't reschedule
		}

		const { prompt, brand, competitors: competitorsList } = context;

		// Check if prompt and brand are enabled
		if (!prompt.enabled || !brand.enabled) {
			console.log(`Prompt ${promptId} or brand ${brand.id} is disabled, skipping but rescheduling`);
			// Still reschedule - the prompt might be enabled later
			await scheduleNextRun(promptId, cadenceHours, 0);
			continue;
		}

		const selectedConfigs = selectTargetsForBrand(scrapeConfigs, brand.enabledModels);
		if (selectedConfigs.length === 0) {
			console.log(`Prompt ${promptId} for brand ${brand.id} has no targets (brand.enabledModels=[])`);
		}

		console.log(`Processing prompt "${prompt.value}" for brand "${brand.name}"`);

		// Run all model iterations in parallel
		const runPromises: Promise<void>[] = [];

		for (const config of selectedConfigs) {
			const providerImpl = getProvider(config.provider);
			for (let i = 0; i < RUNS_PER_PROMPT; i++) {
				runPromises.push(
					runModelIteration({
						promptId,
						promptValue: prompt.value,
						brand,
						competitorsList,
						config,
						providerImpl,
						runIndex: i + 1,
					}),
				);
			}
		}

		const results = await Promise.allSettled(runPromises);
		const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

		if (failures.length > 0) {
			console.error(
				`Prompt ${promptId} had ${failures.length}/${runPromises.length} failed runs: ${summarizeFailures(failures)}`,
			);
		}

		const successCount = runPromises.length - failures.length;
		console.log(`Completed prompt ${promptId}: ${successCount}/${runPromises.length} successful runs`);

		trackWorkerEvent("prompt_processed", {
			brand_id: brand.id,
			models: [...new Set(selectedConfigs.map((c) => c.model))],
			providers: [...new Set(selectedConfigs.map((c) => c.provider))],
			total_runs: runPromises.length,
			successful_runs: successCount,
			failed_runs: failures.length,
		});

		// A cycle where nothing came back means the targets themselves are
		// failing, so the next attempt backs off instead of running on cadence.
		// Anything that produced a run clears the streak.
		const failedCycles = runPromises.length > 0 && successCount === 0 ? consecutiveFailures + 1 : 0;
		await scheduleNextRun(promptId, cadenceHours, failedCycles);
	}
}
