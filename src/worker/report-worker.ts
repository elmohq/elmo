import { Job } from "bullmq";
import { db } from "../lib/db/db";
import { reports, type Brand, brands } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { AI_MODELS } from "../lib/constants";
import Anthropic from "@anthropic-ai/sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { dfsSerpApi } from "../lib/dataforseo";
import * as client from "dataforseo-client";
import { extractTextContent } from "../lib/text-extraction";
import {
	analyzeWebsite,
	getCompetitors,
	getKeywords,
	getPersonas,
	createPromptsData,
	type AnalyzeWebsiteResult,
	type CompetitorResult,
	type KeywordResult,
	type PersonaGroup,
	type PromptData,
} from "../lib/wizard-helpers";

// Initialize Anthropic client for direct API calls (for tool usage)
const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface ReportJobData {
	reportId: string;
	brandName: string;
	brandWebsite: string;
}

interface PromptRunResult {
	promptValue: string;
	runs: Array<{
		modelGroup: "openai" | "anthropic" | "google";
		model: string;
		webSearchEnabled: boolean;
		rawOutput: any;
		webQueries: string[];
		textContent: string;
		brandMentioned: boolean;
		competitorsMentioned: string[];
	}>;
}

interface ReportData {
	websiteAnalysis: AnalyzeWebsiteResult;
	competitors: CompetitorResult[];
	keywords: KeywordResult[];
	personaGroups: PersonaGroup[];
	prompts: PromptData[];
	promptRuns: PromptRunResult[];
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
	brandName: string,
	competitors: CompetitorResult[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();
	const brandNameLower = brandName.toLowerCase();

	// Check for brand mention
	const brandMentioned = contentLower.includes(brandNameLower);

	// Check for competitor mentions
	const competitorsMentioned = competitors
		.filter((competitor) => contentLower.includes(competitor.name.toLowerCase()))
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}

// Function to run a prompt 5 times across different models and return results
async function runPrompt(
	promptValue: string,
	brandName: string,
	competitors: CompetitorResult[],
	job: Job,
): Promise<PromptRunResult> {
	const runs: Array<{
		modelGroup: "openai" | "anthropic" | "google";
		model: string;
		webSearchEnabled: boolean;
		rawOutput: any;
		webQueries: string[];
		textContent: string;
		brandMentioned: boolean;
		competitorsMentioned: string[];
	}> = [];

	// Run 2 OpenAI, 2 Anthropic, 1 Google for each prompt (5 total runs)
	const runPromises = [
		// 2 OpenAI runs
		runWithOpenAI(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, competitors);
			return {
				modelGroup: AI_MODELS.OPENAI.GROUP as "openai",
				model: AI_MODELS.OPENAI.MODEL,
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
		runWithOpenAI(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, competitors);
			return {
				modelGroup: AI_MODELS.OPENAI.GROUP as "openai",
				model: AI_MODELS.OPENAI.MODEL,
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
		// 2 Anthropic runs
		runWithAnthropic(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, competitors);
			return {
				modelGroup: AI_MODELS.ANTHROPIC.GROUP as "anthropic",
				model: AI_MODELS.ANTHROPIC.MODEL,
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
		runWithAnthropic(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, competitors);
			return {
				modelGroup: AI_MODELS.ANTHROPIC.GROUP as "anthropic",
				model: AI_MODELS.ANTHROPIC.MODEL,
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
		// 1 Google run
		runWithDataForSEO(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, competitors);
			return {
				modelGroup: "google" as "google",
				model: "dataforseo",
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
	];

	// Execute all runs in parallel
	const runResults = await Promise.all(runPromises);
	runs.push(...runResults);

	job.log(`Completed 5 runs for prompt: "${promptValue}"`);

	return {
		promptValue,
		runs,
	};
}

// Main report worker function
export async function processReportJob(job: Job<ReportJobData>) {
	const { reportId, brandName, brandWebsite } = job.data;

	job.log(`Processing report ID: ${reportId} for brand: ${brandName}`);

	try {
		// Update report status to processing
		await db.update(reports).set({ status: "processing", updatedAt: new Date() }).where(eq(reports.id, reportId));

		job.log(`Report ${reportId} marked as processing`);
		job.updateProgress(5);

		// Step 1: Analyze website
		job.log(`Analyzing website: ${brandWebsite}`);
		const websiteAnalysis = await analyzeWebsite(brandWebsite);
		job.updateProgress(15);

		// Check if we should skip detailed analysis
		if (websiteAnalysis.skipDetailedAnalysis) {
			job.log(`Skipping detailed analysis for low-traffic website`);

			// Create minimal report data
			const reportData: ReportData = {
				websiteAnalysis,
				competitors: [],
				keywords: [],
				personaGroups: [],
				prompts: [],
				promptRuns: [],
			};

			// Update report with completed status and minimal data
			await db
				.update(reports)
				.set({
					status: "completed",
					completedAt: new Date(),
					updatedAt: new Date(),
					rawOutput: JSON.stringify(reportData),
				})
				.where(eq(reports.id, reportId));

			job.log(`Successfully completed minimal report ${reportId}`);
			return { success: true, reportId, minimal: true };
		}

		// Step 2: Get competitors
		job.log(`Getting competitors for products: ${websiteAnalysis.products.join(", ")}`);
		const competitors = await getCompetitors(websiteAnalysis.products, brandWebsite);
		job.updateProgress(25);

		// Step 3: Get keywords
		job.log(`Getting keywords for domain and products`);
		const keywords = await getKeywords(brandWebsite, websiteAnalysis.products);
		job.updateProgress(35);

		// Step 4: Get personas
		job.log(`Getting personas for products and website`);
		const personaGroups = await getPersonas(websiteAnalysis.products, brandWebsite);
		job.updateProgress(45);

		// Step 5: Create prompt data
		job.log(`Creating prompts from wizard data`);
		const { prompts } = createPromptsData({
			brandId: reportId, // Use reportId as temporary brandId for data structure
			products: websiteAnalysis.products,
			competitors,
			personaGroups,
			keywords,
			customPrompts: [], // No custom prompts for reports
		});
		job.updateProgress(50);

		// Step 6: Run prompts
		job.log(`Running ${prompts.length} prompts, 5 times each`);
		const promptRuns: PromptRunResult[] = [];
		const totalPromptRuns = prompts.length;
		let completedPromptRuns = 0;

		// Run prompts in smaller batches to avoid overwhelming the APIs
		const batchSize = 6;
		for (let i = 0; i < prompts.length; i += batchSize) {
			const batch = prompts.slice(i, i + batchSize);
			const batchPromises = batch.map(async (prompt) => {
				try {
					const result = await runPrompt(prompt.value, brandName, competitors, job);
					completedPromptRuns++;
					const progress = 50 + (completedPromptRuns / totalPromptRuns) * 45; // 50-95% for prompt runs
					job.updateProgress(progress);
					return result;
				} catch (error) {
					job.log(
						`Error running prompt "${prompt.value}": ${error instanceof Error ? error.message : "Unknown error"}`,
					);
					completedPromptRuns++;
					const progress = 50 + (completedPromptRuns / totalPromptRuns) * 45;
					job.updateProgress(progress);
					// Return empty result for failed prompts
					return {
						promptValue: prompt.value,
						runs: [],
					};
				}
			});

			const batchResults = await Promise.all(batchPromises);
			promptRuns.push(...batchResults);

			// Small delay between batches to be respectful to APIs
			if (i + batchSize < prompts.length) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		job.updateProgress(95);

		// Create final report data
		const reportData: ReportData = {
			websiteAnalysis,
			competitors,
			keywords,
			personaGroups,
			prompts,
			promptRuns,
		};

		job.log(`Finalizing report with ${promptRuns.length} prompt run results`);

		// Update report status to completed
		await db
			.update(reports)
			.set({
				status: "completed",
				completedAt: new Date(),
				updatedAt: new Date(),
				rawOutput: JSON.stringify(reportData),
			})
			.where(eq(reports.id, reportId));

		job.updateProgress(100);
		job.log(`Successfully completed report ${reportId}`);
		return { success: true, reportId };
	} catch (error) {
		job.log(`Error processing report ${reportId}: ${error instanceof Error ? error.message : "Unknown error"}`);

		// Update report status to failed
		await db.update(reports).set({ status: "failed", updatedAt: new Date() }).where(eq(reports.id, reportId));

		throw error;
	}
}
