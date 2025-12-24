import { promptQueue, reportQueue, queueConnectionConfig } from "./queues";
import { Job, QueueEvents, Worker } from "bullmq";
import { db } from "../lib/db/db";
import {
	prompts,
	brands,
	competitors,
	promptRuns,
	type Prompt,
	type Brand,
	type Competitor,
} from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { RUNS_PER_PROMPT, AI_MODELS } from "../lib/constants";
import { runWithOpenAI, runWithAnthropic, runWithDataForSEO } from "../lib/ai-providers";

interface JobData {
	promptId: string;
}

interface PromptContext {
	prompt: Prompt;
	brand: Brand;
	competitors: Competitor[];
}

// Function to fetch prompt context from database
async function getPromptContext(promptId: string): Promise<PromptContext | null> {
	try {
		// Get the prompt
		const prompt = await db.query.prompts.findFirst({
			where: eq(prompts.id, promptId),
		});

		if (!prompt) {
			console.error(`Prompt not found: ${promptId}`);
			return null;
		}

		// Get the brand
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, prompt.brandId),
		});

		if (!brand) {
			console.error(`Brand not found: ${prompt.brandId}`);
			return null;
		}

		// Get competitors for this brand
		const brandCompetitors = await db.query.competitors.findMany({
			where: eq(competitors.brandId, prompt.brandId),
		});

		return {
			prompt,
			brand,
			competitors: brandCompetitors,
		};
	} catch (error) {
		console.error("Error fetching prompt context:", error);
		return null;
	}
}

// Function to check for brand and competitor mentions
function analyzeMentions(
	content: string,
	brand: Brand,
	competitors: Competitor[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();
	const brandName = brand.name.toLowerCase();

	// Extract domain from brand website using URL constructor
	const url = new URL(brand.website.startsWith('http') ? brand.website : `https://${brand.website}`);
	const domain = url.hostname.replace(/^www\./, '').toLowerCase();

	// Check for brand mention (brand name or domain)
	const brandMentioned = contentLower.includes(brandName) || contentLower.includes(domain);

	// Check for competitor mentions (by name or domain)
	const competitorsMentioned = competitors
		.filter((competitor) => {
			const nameMatch = contentLower.includes(competitor.name.toLowerCase());
			
			// Extract domain from competitor website
			const competitorUrl = new URL(competitor.domain.startsWith('http') ? competitor.domain : `https://${competitor.domain}`);
			const competitorDomain = competitorUrl.hostname.replace(/^www\./, '').toLowerCase();
			
			const domainMatch = contentLower.includes(competitorDomain);
			return nameMatch || domainMatch;
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}

// Function to save prompt run to database
async function savePromptRun(
	promptId: string,
	modelGroup: "openai" | "anthropic" | "google",
	model: string,
	webSearchEnabled: boolean,
	rawOutput: any,
	webQueries: string[],
	brandMentioned: boolean,
	competitorsMentioned: string[],
): Promise<void> {
	try {
		await db.insert(promptRuns).values({
			promptId,
			modelGroup,
			model,
			webSearchEnabled,
			rawOutput,
			webQueries,
			brandMentioned,
			competitorsMentioned,
		});
	} catch (error) {
		console.error("Error saving prompt run:", error);
		throw error;
	}
}

const queueEvents = new QueueEvents(promptQueue.name, { connection: queueConnectionConfig });

// Track running prompt jobs to prevent overlaps
const runningPromptJobs = new Set<string>();

const worker = new Worker(
	promptQueue.name,
	async (job: Job<JobData>) => {
		const { promptId } = job.data;

		// Check if this prompt is already being processed
		if (runningPromptJobs.has(promptId)) {
			job.log(`Skipping job for prompt ${promptId} - already running`);
			return { success: false, reason: "Job already running for this prompt" };
		}

		// Mark this prompt as running
		runningPromptJobs.add(promptId);
		job.log(`Processing prompt ID: ${promptId}`);

		try {
			// Get prompt context from database
			const context = await getPromptContext(promptId);
			if (!context) {
				throw new Error(`Failed to fetch context for prompt ID: ${promptId}`);
			}

			const { prompt, brand, competitors } = context;
			job.log(`Processing prompt "${prompt.value}" for brand "${brand.name}"`);

			// Run all AI models in parallel for better performance
			// RUNS_PER_PROMPT * 3 (with web search) + 5 OpenAI + 5 Anthropic (without web search)
			const totalRuns = RUNS_PER_PROMPT * 3 + 10;
			let completedRuns = 0;

			// Progress tracking function
			const updateProgress = () => {
				completedRuns++;
				job.updateProgress((completedRuns / totalRuns) * 100);
			};

			// Create arrays of promises for parallel execution
			const openaiPromises = [];
			const anthropicPromises = [];
			const dataforSeoPromises = [];
			// const openaiNoWebPromises = [];
			// const anthropicNoWebPromises = [];

			// Create OpenAI promises (with web search)
			for (let i = 0; i < RUNS_PER_PROMPT; i++) {
				openaiPromises.push(
					runWithOpenAI(prompt.value).then(async ({ rawOutput, webQueries, textContent }) => {
						job.log(`Completed OpenAI with web search iteration ${i + 1}/${RUNS_PER_PROMPT}`);
						const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brand, competitors);

						await savePromptRun(
							promptId,
							AI_MODELS.OPENAI.GROUP,
							AI_MODELS.OPENAI.MODEL,
							true,
							rawOutput,
							webQueries,
							brandMentioned,
							competitorsMentioned,
						);

						updateProgress();
					}).catch((error) => {
						job.log(`Failed OpenAI iteration ${i + 1}/${RUNS_PER_PROMPT}: ${error instanceof Error ? error.message : "Unknown error"}`);
						throw error;
					}),
				);
			}

			// // Create OpenAI promises (without web search)
			// for (let i = 0; i < 5; i++) {
			// 	openaiNoWebPromises.push(
			// 		runWithOpenAINoWebSearch(prompt.value).then(async ({ rawOutput, webQueries, textContent }) => {
			// 			job.log(`Completed OpenAI without web search iteration ${i + 1}/5`);
			// 			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brand, competitors);

			// 			await savePromptRun(
			// 				promptId,
			// 				AI_MODELS.OPENAI.GROUP,
			// 				AI_MODELS.OPENAI.MODEL,
			// 				false,
			// 				rawOutput,
			// 				webQueries,
			// 				brandMentioned,
			// 				competitorsMentioned,
			// 			);

			// 			updateProgress();
			// 		}),
			// 	);
			// }

			// Create Anthropic promises (without web search)
			for (let i = 0; i < RUNS_PER_PROMPT; i++) {
				anthropicPromises.push(
					runWithAnthropic(prompt.value).then(async ({ rawOutput, webQueries, textContent }) => {
						job.log(`Completed Anthropic without web search iteration ${i + 1}/${RUNS_PER_PROMPT}`);
						const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brand, competitors);

						await savePromptRun(
							promptId,
							AI_MODELS.ANTHROPIC.GROUP,
							AI_MODELS.ANTHROPIC.MODEL,
							false,
							rawOutput,
							webQueries,
							brandMentioned,
							competitorsMentioned,
						);

						updateProgress();
					}).catch((error) => {
						job.log(`Failed Anthropic iteration ${i + 1}/${RUNS_PER_PROMPT}: ${error instanceof Error ? error.message : "Unknown error"}`);
						throw error;
					}),
				);
			}

			// // Create Anthropic promises (without web search)
			// for (let i = 0; i < 5; i++) {
			// 	anthropicNoWebPromises.push(
			// 		runWithAnthropicNoWebSearch(prompt.value).then(async ({ rawOutput, webQueries, textContent }) => {
			// 			job.log(`Completed Anthropic without web search iteration ${i + 1}/5`);
			// 			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brand, competitors);

			// 			await savePromptRun(
			// 				promptId,
			// 				AI_MODELS.ANTHROPIC.GROUP,
			// 				AI_MODELS.ANTHROPIC.MODEL,
			// 				false,
			// 				rawOutput,
			// 				webQueries,
			// 				brandMentioned,
			// 				competitorsMentioned,
			// 			);

			// 			updateProgress();
			// 		}),
			// 	);
			// }

			// Create DataForSEO promises (with web search)
			for (let i = 0; i < RUNS_PER_PROMPT; i++) {
				dataforSeoPromises.push(
					runWithDataForSEO(prompt.value).then(async ({ rawOutput, webQueries, textContent }) => {
						job.log(`Completed DataForSEO iteration ${i + 1}/${RUNS_PER_PROMPT}`);
						const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brand, competitors);

						await savePromptRun(
							promptId,
							"google",
							"dataforseo",
							true,
							rawOutput,
							webQueries,
							brandMentioned,
							competitorsMentioned,
						);

						updateProgress();
					}).catch((error) => {
						job.log(`Failed DataForSEO iteration ${i + 1}/${RUNS_PER_PROMPT}: ${error instanceof Error ? error.message : "Unknown error"}`);
						throw error;
					}),
				);
			}

			// Execute all promises in parallel
			await Promise.all([
				...openaiPromises,
				// ...openaiNoWebPromises,
				...anthropicPromises,
				// ...anthropicNoWebPromises,
				...dataforSeoPromises,
			]);

			job.log(`Successfully completed all ${totalRuns} runs for prompt ${promptId}`);
			return { success: true, totalRuns: completedRuns };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			const errorStack = error instanceof Error ? error.stack : undefined;
			
			job.log(`Error processing prompt ${promptId}: ${errorMessage}`);
			if (errorStack) {
				job.log(`Stack trace: ${errorStack}`);
			}
			
			// Log additional error details if available
			if (error && typeof error === 'object') {
				const errorObj = error as any;
				if (errorObj.cause) {
					job.log(`Error cause: ${JSON.stringify(errorObj.cause, null, 2)}`);
				}
				if (errorObj.response) {
					job.log(`Response status: ${errorObj.response.status}`);
					if (errorObj.response.data) {
						job.log(`Response data: ${JSON.stringify(errorObj.response.data, null, 2)}`);
					}
				}
			}
			
			throw error;
		} finally {
			// Always remove from running set when job completes (success or failure)
			runningPromptJobs.delete(promptId);
		}
	},
	{ connection: queueConnectionConfig, concurrency: 5 },
);

queueEvents.on("completed", ({ jobId }) => {
	console.log("Completed job:", jobId);
});

queueEvents.on("failed", ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
	console.error("Job failed:", jobId, "Reason:", failedReason);
});

// Report worker
import { processReportJob, type ReportJobData } from "./report-worker";

const reportQueueEvents = new QueueEvents(reportQueue.name, { connection: queueConnectionConfig });

const reportWorker = new Worker(reportQueue.name, processReportJob, {
	connection: queueConnectionConfig,
	concurrency: 2,
});

reportQueueEvents.on("completed", ({ jobId }) => {
	console.log("Completed report job:", jobId);
});

reportQueueEvents.on("failed", ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
	console.error("Report job failed:", jobId, "Reason:", failedReason);
});

const gracefulShutdown = async (signal: string) => {
	console.log(`Received ${signal}, closing server...`);
	await worker.close();
	await reportWorker.close();
	// Other asynchronous closings
	process.exit(0);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
