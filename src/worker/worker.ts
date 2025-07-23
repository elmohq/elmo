import { promptQueue, reportQueue, queueConnectionConfig } from "./queues";
import { Job, QueueEvents, Worker } from "bullmq";
import { db } from "../lib/db/db";
import { prompts, brands, competitors, promptRuns, reports, type Prompt, type Brand, type Competitor } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { RUNS_PER_PROMPT, AI_MODELS } from "../lib/constants";
import Anthropic from "@anthropic-ai/sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { dfsSerpApi } from "../lib/dataforseo";
import * as client from "dataforseo-client";
import { extractTextContent } from "../lib/text-extraction";

// Initialize Anthropic client for direct API calls (for tool usage)
const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface JobData {
	promptId: string;
}

interface ReportJobData {
	reportId: string;
	brandName: string;
	brandWebsite: string;
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

// Function to run prompt with OpenAI using Vercel AI SDK with web search
async function runWithOpenAI(promptValue: string): Promise<{
	rawOutput: any;
	webQueries: string[];
	textContent: string;
}> {
	try {
		// Generate text with web search using OpenAI Responses API
		const result = await generateText({
			model: openai.responses(AI_MODELS.OPENAI.MODEL),
			prompt: promptValue,
			// if tool choice is required, it always just uses the input prompt instead of generating a relevant query
			toolChoice: "auto",
			tools: {
				web_search_preview: openai.tools.webSearchPreview({
					searchContextSize: "low",
				}),
			},
		});

		// Extract web search queries from OpenAI Responses API output
		const webQueries: string[] = [];

		const responseBody = result.response?.body as any;
		if (responseBody?.output) {
			for (const outputItem of responseBody.output) {
				if (outputItem.type === "web_search_call" && outputItem.action?.query) {
					webQueries.push(outputItem.action.query);
				}
			}
		}

		return {
			rawOutput: responseBody,
			webQueries,
			textContent: extractTextContent(responseBody, "openai"), // Extract text content for mention analysis
		};
	} catch (error) {
		console.error("Error running OpenAI prompt:", error);
		throw error;
	}
}

// Function to run prompt with Anthropic
async function runWithAnthropic(promptValue: string): Promise<{
	rawOutput: any;
	webQueries: string[];
	textContent: string;
}> {
	try {
		const response = await anthropic.messages.create({
			model: AI_MODELS.ANTHROPIC.MODEL,
			max_tokens: 4000,
			messages: [
				{
					role: "user",
					content: promptValue,
				},
			],
			tools: [
				{
					type: "web_search_20250305",
					name: "web_search",
					max_uses: 1,
				},
			],
		});

		// Extract text content from response using helper
		const textContent = extractTextContent(response, "anthropic");

		// Extract web search queries
		const webQueries = response.content
			.filter((block) => block.type === "server_tool_use" && block.name === "web_search")
			.map((block) => (block as any).input?.query)
			.filter(Boolean);

		return {
			rawOutput: response,
			webQueries,
			textContent,
		};
	} catch (error) {
		console.error("Error running Anthropic prompt:", error);
		throw error;
	}
}

// Function to run prompt with DataForSEO (simulating a search query)
async function runWithDataForSEO(promptValue: string): Promise<{
	rawOutput: any;
	webQueries: string[];
	textContent: string;
}> {
	try {
		// Use DataForSEO AI Mode Live Advanced endpoint to get AI-powered search results
		const requestInfo = new client.SerpGoogleAiModeLiveAdvancedRequestInfo({
			keyword: promptValue,
			location_code: 2840, // United States
			language_code: "en",
			depth: 10,
		});

		const response = await dfsSerpApi.googleAiModeLiveAdvanced([requestInfo]);

		console.log("response", JSON.stringify(response, null, 2));

		if (!response || !response.tasks || response.tasks.length === 0) {
			throw new Error("DataForSEO API Error: No response or tasks");
		}

		const task = response.tasks[0];
		if (task.status_code !== 20000 || !task.result || task.result.length === 0) {
			throw new Error(`DataForSEO API Error: ${task.status_message}`);
		}

		const textContent = extractTextContent(response, "google");

		// There aren't separate web queries for Google AI Mode
		const webQueries = [promptValue];

		return {
			rawOutput: response,
			webQueries,
			textContent,
		};
	} catch (error) {
		console.error("Error running DataForSEO search:", error);
		throw error;
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

	// Check for brand mention
	const brandMentioned = contentLower.includes(brandName);

	// Check for competitor mentions
	const competitorsMentioned = competitors
		.filter((competitor) => contentLower.includes(competitor.name.toLowerCase()))
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

			// Create Anthropic promises (with web search)
			for (let i = 0; i < RUNS_PER_PROMPT; i++) {
				anthropicPromises.push(
					runWithAnthropic(prompt.value).then(async ({ rawOutput, webQueries, textContent }) => {
						job.log(`Completed Anthropic with web search iteration ${i + 1}/${RUNS_PER_PROMPT}`);
						const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brand, competitors);

						await savePromptRun(
							promptId,
							AI_MODELS.ANTHROPIC.GROUP,
							AI_MODELS.ANTHROPIC.MODEL,
							true,
							rawOutput,
							webQueries,
							brandMentioned,
							competitorsMentioned,
						);

						updateProgress();
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
			job.log(`Error processing prompt ${promptId}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
const reportQueueEvents = new QueueEvents(reportQueue.name, { connection: queueConnectionConfig });

const reportWorker = new Worker(
	reportQueue.name,
	async (job: Job<ReportJobData>) => {
		const { reportId, brandName, brandWebsite } = job.data;

		job.log(`Processing report ID: ${reportId} for brand: ${brandName}`);

		try {
			// Update report status to processing
			await db
				.update(reports)
				.set({ status: "processing", updatedAt: new Date() })
				.where(eq(reports.id, reportId));

			job.log(`Report ${reportId} marked as processing`);
			job.updateProgress(25);

			// Simulate report generation work
			// TODO: Replace with actual report generation logic
			job.log(`Analyzing website: ${brandWebsite}`);
			await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate 5 seconds of work
			job.updateProgress(50);

			job.log(`Gathering brand data for: ${brandName}`);
			await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate 5 seconds of work
			job.updateProgress(75);

			job.log(`Generating final report for: ${brandName}`);
			await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate 3 seconds of work
			job.updateProgress(100);

			// Update report status to completed
			await db
				.update(reports)
				.set({ 
					status: "completed", 
					completedAt: new Date(),
					updatedAt: new Date() 
				})
				.where(eq(reports.id, reportId));

			job.log(`Successfully completed report ${reportId}`);
			return { success: true, reportId };
		} catch (error) {
			job.log(`Error processing report ${reportId}: ${error instanceof Error ? error.message : "Unknown error"}`);
			
			// Update report status to failed
			await db
				.update(reports)
				.set({ status: "failed", updatedAt: new Date() })
				.where(eq(reports.id, reportId));

			throw error;
		}
	},
	{ connection: queueConnectionConfig, concurrency: 2 }
);

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
