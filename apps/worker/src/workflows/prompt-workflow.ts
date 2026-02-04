import { DBOS } from "@dbos-inc/dbos-sdk";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	competitors,
	promptRuns,
	prompts,
	type Brand,
	type Competitor,
	type Prompt,
} from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { AI_MODELS, RUNS_PER_PROMPT, DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";
import { promptsQueue } from "../queues";
import { runWithAnthropic, runWithDataForSEO, runWithOpenAI } from "@workspace/lib/ai-providers";
import {
	ingestPromptRuns,
	ingestPromptRunsV2,
	ingestToTinybird,
	type TinybirdCitationItem,
	type TinybirdPromptRunEvent,
} from "@workspace/lib/tinybird";
import { extractCitations } from "@workspace/lib/text-extraction";

interface PromptContext {
	prompt: Prompt;
	brand: Brand;
	competitors: Competitor[];
}

const getPromptContextStep = DBOS.registerStep(
	async (promptId: string): Promise<PromptContext | null> => {
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			DBOS.logger.error(`Prompt not found: ${promptId}`);
			return null;
		}

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});

		if (!brand) {
			DBOS.logger.error(`Brand not found: ${prompt.brandId}`);
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
	},
	{ name: "getPromptContext", retriesAllowed: true, maxAttempts: 3, intervalSeconds: 2 },
);

const isPromptEnabledStep = DBOS.registerStep(
	async (promptId: string): Promise<boolean> => {
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});
		return Boolean(prompt?.enabled);
	},
	{ name: "isPromptEnabled", retriesAllowed: true, maxAttempts: 3, intervalSeconds: 2 },
);

const getDelayHoursStep = DBOS.registerStep(
	async (promptId: string): Promise<number> => {
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			return DEFAULT_DELAY_HOURS;
		}

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});

		return brand?.delayOverrideHours ?? DEFAULT_DELAY_HOURS;
	},
	{ name: "getDelayHours", retriesAllowed: true, maxAttempts: 3, intervalSeconds: 2 },
);

/**
 * Sanitize an object to ensure it's plain JSON-serializable.
 * This handles DBOS serialization stubs that can appear in recovered workflow data.
 */
function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
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

const savePromptRunStep = DBOS.registerStep(
	async (
		promptId: string,
		modelGroup: "openai" | "anthropic" | "google",
		model: string,
		webSearchEnabled: boolean,
		rawOutput: any,
		webQueries: string[],
		brandMentioned: boolean,
		competitorsMentioned: string[],
	): Promise<{ id: string; createdAt: Date }> => {
		const [result] = await db
			.insert(promptRuns)
			.values({
				promptId,
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
	},
	{ name: "savePromptRun", retriesAllowed: true, maxAttempts: 3, intervalSeconds: 2 },
);

const sendToTinybirdStep = DBOS.registerStep(
	async (
		promptRunId: string,
		promptId: string,
		brandId: string,
		modelGroup: "openai" | "anthropic" | "google",
		model: string,
		webSearchEnabled: boolean,
		rawOutput: any,
		webQueries: string[],
		brandMentioned: boolean,
		competitorsMentioned: string[],
		textContent: string,
		createdAt: Date,
	): Promise<void> => {
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

		await Promise.all([
			ingestToTinybird(ingestPromptRuns, [event]),
			ingestToTinybird(ingestPromptRunsV2, [event]),
		]);
	},
	{ name: "sendToTinybird" },
);

const nowEpochMsStep = DBOS.registerStep(async () => Date.now(), { name: "nowEpochMs" });

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
}) {
	const stepName =
		modelGroup === "google"
			? `runGoogle_${runIndex}`
			: modelGroup === "openai"
				? `runOpenAI_${runIndex}`
				: `runAnthropic_${runIndex}`;

	const { rawOutput, webQueries, textContent } = await DBOS.runStep(
		async () => {
			if (modelGroup === "openai") {
				return runWithOpenAI(promptValue);
			}
			if (modelGroup === "anthropic") {
				return runWithAnthropic(promptValue);
			}
			return runWithDataForSEO(promptValue);
		},
		{ name: stepName, retriesAllowed: true, maxAttempts: 3, intervalSeconds: 5, backoffRate: 2 },
	);

	// Sanitize rawOutput to ensure it's plain JSON (DBOS serialization can leave stubs
	// for functions which cause issues when saving to database on workflow recovery)
	const sanitizedRawOutput = sanitizeForJson(rawOutput);

	const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brand, competitorsList);

	const { id: promptRunId, createdAt } = await savePromptRunStep(
		promptId,
		modelGroup,
		model,
		webSearchEnabled,
		sanitizedRawOutput,
		webQueries,
		brandMentioned,
		competitorsMentioned,
	);

	await sendToTinybirdStep(
		promptRunId,
		promptId,
		brand.id,
		modelGroup,
		model,
		webSearchEnabled,
		sanitizedRawOutput,
		webQueries,
		brandMentioned,
		competitorsMentioned,
		textContent,
		createdAt,
	);
}

async function processPromptWorkflow(promptId: string, initialDelayHours?: number) {
	if (initialDelayHours && initialDelayHours > 0) {
		DBOS.logger.info(`Sleeping ${initialDelayHours} hours before processing prompt ${promptId}`);
		await DBOS.sleep(initialDelayHours * 60 * 60 * 1000);
	}

	const isEnabled = await isPromptEnabledStep(promptId);
	if (!isEnabled) {
		return { status: "disabled", processed: false };
	}

	const context = await getPromptContextStep(promptId);
	if (!context) {
		throw new Error(`Failed to fetch context for prompt ${promptId}`);
	}

	const { prompt, brand, competitors: competitorsList } = context;
	DBOS.logger.info(`Processing prompt "${prompt.value}" for brand "${brand.name}"`);

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
		throw new Error(`Prompt ${promptId} had ${failures.length} failed runs: ${errorMessages}`);
	}

	const stillEnabled = await isPromptEnabledStep(promptId);
	if (stillEnabled) {
		const delayHours = await getDelayHoursStep(promptId);
		const nowEpochMs = await nowEpochMsStep();
		const workflowId = `prompt-${promptId}-${nowEpochMs}`;

		await DBOS.startWorkflow(processPrompt, {
			queueName: promptsQueue.name,
			workflowID: workflowId,
		})(promptId, delayHours);

		return { status: "completed", nextRunInHours: delayHours, failures: failures.length };
	}

	return { status: "completed", nextRunInHours: null, failures: failures.length };
}

export const processPrompt = DBOS.registerWorkflow(processPromptWorkflow, {
	name: "processPrompt",
	maxRecoveryAttempts: 3,
});
