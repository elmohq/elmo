import { DEFAULT_DELAY_HOURS, RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import {
	type Brand,
	brands,
	type Competitor,
	citations,
	competitors,
	promptRuns,
	prompts,
} from "@workspace/lib/db/schema";
import type { Citation } from "@workspace/lib/text-extraction";
import type { Provider, ProviderOptions } from "@workspace/lib/providers";
import {
	getProvider,
	parseScrapeTargets,
	resolveProviderId,
} from "@workspace/lib/providers";
import { eq } from "drizzle-orm";
import type { Job } from "pg-boss";
import boss from "../boss";
import { trackWorkerEvent } from "../telemetry";

export interface ProcessPromptData {
	promptId: string;
	cadenceHours?: number; // Hours until next run (for self-rescheduling)
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
	}
}

/**
 * Get the cadence hours for a prompt based on its brand's delay override.
 */
async function getCadenceHours(promptId: string): Promise<number> {
	const prompt = await db.query.prompts.findFirst({
		where: eq(prompts.id, promptId),
	});

	if (!prompt) return DEFAULT_DELAY_HOURS;

	const brand = await db.query.brands.findFirst({
		where: eq(brands.id, prompt.brandId),
	});

	if (!brand) return DEFAULT_DELAY_HOURS;

	return brand.delayOverrideHours ?? DEFAULT_DELAY_HOURS;
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
	extractedCitations: Citation[],
	createdAt: Date,
): Promise<void> {
	if (extractedCitations.length === 0) return;

	await db.insert(citations).values(
		extractedCitations.map((c) => ({
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
	model,
	version,
	webSearchEnabled,
	runIndex,
	providerImpl,
	providerOptions,
}: {
	promptId: string;
	promptValue: string;
	brand: Brand;
	competitorsList: Competitor[];
	model: string;
	version: string;
	webSearchEnabled: boolean;
	runIndex: number;
	providerImpl: Provider;
	providerOptions: ProviderOptions;
}): Promise<void> {
	const logPrefix = `[${model}_${runIndex}]`;

	const result = await providerImpl.run(model, promptValue, providerOptions);

	const { rawOutput, webQueries, textContent, modelVersion } = result;
	console.log(`${logPrefix} AI call completed, textContent length: ${textContent?.length ?? "null"}`);

	const safeTextContent = typeof textContent === "string" ? textContent : "";

	const { brandMentioned, competitorsMentioned } = analyzeMentions(safeTextContent, brand, competitorsList);

	const { id: promptRunId, createdAt } = await savePromptRun(
		promptId,
		brand.id,
		model,
		providerImpl.id,
		modelVersion ?? version,
		webSearchEnabled,
		rawOutput,
		webQueries,
		brandMentioned,
		competitorsMentioned,
	);
	console.log(`${logPrefix} Saved prompt run ${promptRunId}`);

	await saveCitations(promptRunId, promptId, brand.id, model, result.citations, createdAt);
}

/**
 * Process a prompt - runs AI models and saves results.
 * This is a pg-boss job handler, called when a scheduled job fires.
 * After successful completion, schedules the next run.
 */
export async function processPromptJob(jobs: Job<ProcessPromptData>[]): Promise<void> {
	for (const job of jobs) {
		const { promptId, cadenceHours: providedCadence } = job.data;
		console.log(`Processing prompt ${promptId}`);

		const cadenceHours = providedCadence ?? (await getCadenceHours(promptId));

		const context = await getPromptContext(promptId);
		if (!context) {
			console.log(`Prompt ${promptId} not found, skipping (no reschedule)`);
			continue;
		}

		const { prompt, brand, competitors: competitorsList } = context;

		if (!prompt.enabled || !brand.enabled) {
			console.log(`Prompt ${promptId} or brand ${brand.id} is disabled, skipping but rescheduling`);
			await scheduleNextRun(promptId, cadenceHours);
			continue;
		}

		console.log(`Processing prompt "${prompt.value}" for brand "${brand.name}"`);

		const allModels = parseScrapeTargets(process.env.SCRAPE_TARGETS);
		const brandModels = brand.enabledModels;
		const effectiveModels = brandModels ? allModels.filter((cfg) => brandModels.includes(cfg.model)) : allModels;

		const runPromises: Promise<void>[] = [];

		for (const cfg of effectiveModels) {
			const resolvedProvider = resolveProviderId(cfg.provider, cfg.model);
			const provider = getProvider(resolvedProvider);
			for (let i = 0; i < RUNS_PER_PROMPT; i++) {
				runPromises.push(
					runModelIteration({
						promptId,
						promptValue: prompt.value,
						brand,
						competitorsList,
						model: cfg.model,
						version: cfg.version ?? provider.id,
						webSearchEnabled: cfg.webSearch,
						runIndex: i + 1,
						providerImpl: provider,
						providerOptions: { webSearch: cfg.webSearch, version: cfg.version },
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

			console.error(`Prompt ${promptId} had ${failures.length}/${runPromises.length} failed runs: ${errorMessages}`);

			if (failures.length === runPromises.length) {
				throw new Error(`All runs failed for prompt ${promptId}: ${errorMessages}`);
			}
		}

		const successCount = runPromises.length - failures.length;
		console.log(`Completed prompt ${promptId}: ${successCount}/${runPromises.length} successful runs`);

		trackWorkerEvent("prompt_processed", {
			brand_id: brand.id,
			engines: effectiveModels.map((cfg) => cfg.model),
			providers: effectiveModels.map((cfg) => cfg.provider),
			total_runs: runPromises.length,
			successful_runs: successCount,
			failed_runs: failures.length,
		});

		await scheduleNextRun(promptId, cadenceHours);
	}
}
