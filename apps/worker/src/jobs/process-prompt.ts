import * as Sentry from "@sentry/node";
import { getDefaultDelayHours, RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import {
	type Brand,
	brands,
	brandSchedulerRollouts,
	type Competitor,
	citations,
	competitors,
	promptRuns,
	prompts,
} from "@workspace/lib/db/schema";
import {
	getProvider,
	type ModelConfig,
	type Provider,
	parseScrapeTargets,
	selectTargetsForBrand,
} from "@workspace/lib/providers";
import type { Citation } from "@workspace/lib/text-extraction";
import { eq } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";
import { trackWorkerEvent } from "../telemetry";
import { shouldUseLegacyScheduler } from "./legacy-rollout";

export interface ProcessPromptData {
	promptId: string;
	cadenceHours?: number; // Hours until next run (for self-rescheduling)
}

export interface PromptContext {
	prompt: typeof prompts.$inferSelect;
	brand: Brand;
	competitors: Competitor[];
}

type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ModelIterationEvaluation {
	promptId: string;
	brandId: string;
	model: string;
	provider: string;
	version: string;
	webSearchEnabled: boolean;
	rawOutput: unknown;
	webQueries: string[];
	brandMentioned: boolean;
	competitorsMentioned: string[];
	citations: Citation[];
}

/**
 * Schedule the next run for a prompt after the specified cadence.
 */
async function scheduleNextRun(promptId: string, cadenceHours: number): Promise<void> {
	const startAfterSeconds = cadenceHours * 60 * 60;

	try {
		await boss.send(
			"process-prompt",
			{ promptId, cadenceHours },
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

async function mayRunLegacyPrompt(brandId: string): Promise<boolean> {
	if (process.env.DEPLOYMENT_MODE !== "cloud") return true;
	const rollout = await db.query.brandSchedulerRollouts.findFirst({
		columns: { mode: true },
		where: eq(brandSchedulerRollouts.brandId, brandId),
	});
	return shouldUseLegacyScheduler("cloud", rollout?.mode ?? null);
}

export async function getPromptContext(promptId: string): Promise<PromptContext | null> {
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
	conn: DbConnection,
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
	promptRunId?: string,
): Promise<{ id: string; createdAt: Date }> {
	const [result] = await conn
		.insert(promptRuns)
		.values({
			...(promptRunId ? { id: promptRunId } : {}),
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
	conn: DbConnection,
	promptRunId: string,
	promptId: string,
	brandId: string,
	model: string,
	extracted: Citation[],
	createdAt: Date,
): Promise<void> {
	if (extracted.length === 0) return;

	await conn.insert(citations).values(
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

export async function evaluateModelIteration({
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
}): Promise<ModelIterationEvaluation> {
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

		return {
			promptId,
			brandId: brand.id,
			model: config.model,
			provider: config.provider,
			version: recordedVersion,
			webSearchEnabled: config.webSearch,
			rawOutput,
			webQueries,
			brandMentioned,
			competitorsMentioned,
			citations: extractedCitations,
		};
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
		throw error;
	}
}

export async function persistModelIteration(
	evaluation: ModelIterationEvaluation,
	conn: DbConnection,
	promptRunId?: string,
): Promise<{ promptRunId: string }> {
	const saved = await savePromptRun(
		conn,
		evaluation.promptId,
		evaluation.brandId,
		evaluation.model,
		evaluation.provider,
		evaluation.version,
		evaluation.webSearchEnabled,
		evaluation.rawOutput,
		evaluation.webQueries,
		evaluation.brandMentioned,
		evaluation.competitorsMentioned,
		promptRunId,
	);
	await saveCitations(
		conn,
		saved.id,
		evaluation.promptId,
		evaluation.brandId,
		evaluation.model,
		evaluation.citations,
		saved.createdAt,
	);
	return { promptRunId: saved.id };
}

export async function runModelIteration(
	input: Parameters<typeof evaluateModelIteration>[0],
): Promise<{ promptRunId: string }> {
	const evaluation = await evaluateModelIteration(input);
	return db.transaction(async (tx) => persistModelIteration(evaluation, tx));
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
		const { promptId, cadenceHours: providedCadence } = job.data;
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
			await scheduleNextRun(promptId, cadenceHours);
			continue;
		}

		const selectedConfigs = selectTargetsForBrand(scrapeConfigs, brand.enabledModels);
		if (selectedConfigs.length === 0) {
			console.log(`Prompt ${promptId} for brand ${brand.id} has no targets (brand.enabledModels=[])`);
		}

		console.log(`Processing prompt "${prompt.value}" for brand "${brand.name}"`);
		// Recheck at the consumer boundary so jobs queued before a v2 cutover
		// cannot fan out all legacy targets outside v2 quota accounting.
		if (!(await mayRunLegacyPrompt(brand.id))) {
			console.log(`Prompt ${promptId} belongs to an explicit v2 brand; skipping legacy execution and reschedule`);
			continue;
		}

		// Run all model iterations in parallel
		const runPromises: Array<Promise<{ promptRunId: string }>> = [];

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
			models: [...new Set(selectedConfigs.map((c) => c.model))],
			providers: [...new Set(selectedConfigs.map((c) => c.provider))],
			total_runs: runPromises.length,
			successful_runs: successCount,
			failed_runs: failures.length,
		});

		// Schedule the next run
		await scheduleNextRun(promptId, cadenceHours);
	}
}
