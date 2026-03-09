import type { Job } from "pg-boss";
import { db } from "@workspace/lib/db/db";
import { brands, citations, competitors, promptRuns, prompts, type Brand, type Competitor } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { AI_MODELS, DEFAULT_DELAY_HOURS, RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { runWithAnthropic, runWithDataForSEO, runWithOpenAI } from "@workspace/lib/ai-providers";
import {
	ingestPromptRuns,
	ingestPromptRunsV2,
	ingestToTinybird,
	type TinybirdCitationItem,
	type TinybirdPromptRunEvent,
} from "@workspace/lib/tinybird";
import { extractCitations } from "@workspace/lib/text-extraction";
import boss from "../boss";

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
		// Don't throw - we don't want to fail the job just because rescheduling failed
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

function analyzeMentions(
	content: string,
	brand: Brand,
	competitorsList: Competitor[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();
	const brandName = brand.name.toLowerCase();

	const url = new URL(brand.website.startsWith("http") ? brand.website : `https://${brand.website}`);
	const domain = url.hostname.replace(/^www\./, "").toLowerCase();

	const brandMentioned = contentLower.includes(brandName) || contentLower.includes(domain);

	const competitorsMentioned = competitorsList
		.filter((competitor) => {
			const nameMatch = contentLower.includes(competitor.name.toLowerCase());

			const competitorUrl = new URL(
				competitor.domain.startsWith("http") ? competitor.domain : `https://${competitor.domain}`,
			);
			const competitorDomain = competitorUrl.hostname.replace(/^www\./, "").toLowerCase();

			const domainMatch = contentLower.includes(competitorDomain);
			return nameMatch || domainMatch;
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}

async function savePromptRun(
	promptId: string,
	brandId: string,
	modelGroup: "openai" | "anthropic" | "google",
	model: string,
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
			modelGroup,
			model,
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
	modelGroup: "openai" | "anthropic" | "google",
	rawOutput: unknown,
	createdAt: Date,
): Promise<void> {
	const extracted = extractCitations(rawOutput, modelGroup);
	if (extracted.length === 0) return;

	await db.insert(citations).values(
		extracted.map((c) => ({
			promptRunId,
			promptId,
			brandId,
			modelGroup,
			url: c.url,
			domain: c.domain,
			title: c.title || null,
			createdAt,
		})),
	);
}

async function sendToTinybird(
	promptRunId: string,
	promptId: string,
	brandId: string,
	modelGroup: "openai" | "anthropic" | "google",
	model: string,
	webSearchEnabled: boolean,
	rawOutput: unknown,
	webQueries: string[],
	brandMentioned: boolean,
	competitorsMentioned: string[],
	textContent: string,
	createdAt: Date,
): Promise<void> {
	const extractedCitations = extractCitations(rawOutput, modelGroup);
	const citations: TinybirdCitationItem[] = extractedCitations.map((c) => ({
		url: c.url,
		domain: c.domain,
		title: c.title || null,
	}));

	const event: TinybirdPromptRunEvent = {
		id: promptRunId,
		prompt_id: promptId,
		brand_id: brandId,
		model_group: modelGroup,
		model: model,
		web_search_enabled: webSearchEnabled ? 1 : 0,
		brand_mentioned: brandMentioned ? 1 : 0,
		competitors_mentioned: competitorsMentioned,
		web_queries: webQueries,
		text_content: textContent,
		raw_output: JSON.stringify(rawOutput),
		citations: citations,
		created_at: createdAt.toISOString(),
		competitor_count: competitorsMentioned.length,
		has_competitor_mention: competitorsMentioned.length > 0 ? 1 : 0,
	};

	await Promise.all([ingestToTinybird(ingestPromptRuns, [event]), ingestToTinybird(ingestPromptRunsV2, [event])]);
}

async function runModelIteration({
	promptId,
	promptValue,
	brand,
	competitorsList,
	modelGroup,
	model,
	webSearchEnabled,
	runIndex,
}: {
	promptId: string;
	promptValue: string;
	brand: Brand;
	competitorsList: Competitor[];
	modelGroup: "openai" | "anthropic" | "google";
	model: string;
	webSearchEnabled: boolean;
	runIndex: number;
}): Promise<void> {
	const logPrefix = `[${modelGroup}_${runIndex}]`;

	// Run the AI call
	let result: { rawOutput: unknown; webQueries: string[]; textContent: string };
	if (modelGroup === "openai") {
		result = await runWithOpenAI(promptValue);
	} else if (modelGroup === "anthropic") {
		result = await runWithAnthropic(promptValue);
	} else {
		result = await runWithDataForSEO(promptValue);
	}

	const { rawOutput, webQueries, textContent } = result;
	console.log(`${logPrefix} AI call completed, textContent length: ${textContent?.length ?? "null"}`);

	// Ensure textContent is a string
	const safeTextContent = typeof textContent === "string" ? textContent : "";

	// Analyze mentions
	const { brandMentioned, competitorsMentioned } = analyzeMentions(safeTextContent, brand, competitorsList);

	// Save to database
	const { id: promptRunId, createdAt } = await savePromptRun(
		promptId,
		brand.id,
		modelGroup,
		model,
		webSearchEnabled,
		rawOutput,
		webQueries,
		brandMentioned,
		competitorsMentioned,
	);
	console.log(`${logPrefix} Saved prompt run ${promptRunId}`);

	// Save citations to Postgres
	await saveCitations(promptRunId, promptId, brand.id, modelGroup, rawOutput, createdAt);

	// Send to Tinybird
	await sendToTinybird(
		promptRunId,
		promptId,
		brand.id,
		modelGroup,
		model,
		webSearchEnabled,
		rawOutput,
		webQueries,
		brandMentioned,
		competitorsMentioned,
		safeTextContent,
		createdAt,
	);
	console.log(`${logPrefix} Sent to Tinybird`);
}

/**
 * Process a prompt - runs AI models and saves results.
 * This is a pg-boss job handler, called when a scheduled job fires.
 * After successful completion, schedules the next run.
 */
export async function processPromptJob(jobs: Job<ProcessPromptData>[]): Promise<void> {
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

		console.log(`Processing prompt "${prompt.value}" for brand "${brand.name}"`);

		// Run all model iterations in parallel
		const runPromises: Promise<void>[] = [];

		for (let i = 0; i < RUNS_PER_PROMPT; i++) {
			runPromises.push(
				runModelIteration({
					promptId,
					promptValue: prompt.value,
					brand,
					competitorsList,
					modelGroup: "openai",
					model: AI_MODELS.OPENAI.MODEL,
					webSearchEnabled: true,
					runIndex: i + 1,
				}),
			);
		}

		for (let i = 0; i < RUNS_PER_PROMPT; i++) {
			runPromises.push(
				runModelIteration({
					promptId,
					promptValue: prompt.value,
					brand,
					competitorsList,
					modelGroup: "anthropic",
					model: AI_MODELS.ANTHROPIC.MODEL,
					webSearchEnabled: false,
					runIndex: i + 1,
				}),
			);
		}

		for (let i = 0; i < RUNS_PER_PROMPT; i++) {
			runPromises.push(
				runModelIteration({
					promptId,
					promptValue: prompt.value,
					brand,
					competitorsList,
					modelGroup: "google",
					model: "dataforseo",
					webSearchEnabled: true,
					runIndex: i + 1,
				}),
			);
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

		console.log(
			`Completed prompt ${promptId}: ${runPromises.length - failures.length}/${runPromises.length} successful runs`,
		);

		// Schedule the next run
		await scheduleNextRun(promptId, cadenceHours);
	}
}
