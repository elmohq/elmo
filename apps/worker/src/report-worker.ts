import { db } from "@workspace/lib/db/db";
import { reports, type Brand, brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { AI_MODELS } from "@workspace/lib/constants";
import Anthropic from "@anthropic-ai/sdk";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { dfsSerpApi } from "@workspace/lib/dataforseo";
import * as client from "dataforseo-client";
import { extractTextContent } from "@workspace/lib/text-extraction";
import {
	analyzeWebsite,
	getCompetitors,
	getKeywords,
	getPersonas,
	generateCandidatePromptsForReports,
	type AnalyzeWebsiteResult,
	type CompetitorResult,
	type KeywordResult,
	type PersonaGroup,
	type PromptData,
} from "@workspace/lib/wizard-helpers";
import { isPromptBranded, computeSystemTags } from "@workspace/lib/tag-utils";

// Initialize Anthropic client for direct API calls (for tool usage)
const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Report constants
const TARGET_PROMPTS_COUNT = 70;
const MIN_BRAND_MENTIONS = 14;
const MAX_BRAND_MENTIONS = 28;

export interface ReportJobData {
	reportId: string;
	brandName: string;
	brandWebsite: string;
	manualPrompts?: string[];
}

export interface ReportJobContext {
	data: ReportJobData;
	log: (message: string) => void;
	updateProgress: (progress: number) => void | Promise<void>;
}

interface PromptRunResult {
	promptValue: string;
	runs: Array<{
		model: string;
		version: string;
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
				}) as any,
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

// Function to select optimal prompts from candidates based on test results
function selectOptimalPrompts(
	candidateResults: Array<{
		promptValue: string;
		brandedPrompt: boolean;
		runs: Array<{
			brandMentioned: boolean;
			competitorsMentioned: string[];
		}>;
	}>,
	brandName: string,
	brandWebsite: string,
): string[] {
	// Calculate metrics for each candidate
	const scoredCandidates = candidateResults.map((candidate) => {
		const totalRuns = candidate.runs.length;
		const brandMentionCount = candidate.runs.filter((r) => r.brandMentioned).length;
		const competitorMentionCount = candidate.runs.filter((r) => r.competitorsMentioned.length > 0).length;
		
		const brandMentionRate = totalRuns > 0 ? brandMentionCount / totalRuns : 0;
		const competitorMentionRate = totalRuns > 0 ? competitorMentionCount / totalRuns : 0;
		
		// Check if prompt is actually branded (contains brand name/domain)
		const isActuallyBranded = isPromptBranded(candidate.promptValue, brandName, brandWebsite);
		
		return {
			promptValue: candidate.promptValue,
			brandedPrompt: candidate.brandedPrompt || isActuallyBranded,
			brandMentionRate,
			competitorMentionRate,
			hasBrandMention: brandMentionCount > 0,
			hasCompetitorMention: competitorMentionCount > 0,
		};
	});
	
	// Separate branded and non-branded prompts
	const nonBrandedPrompts = scoredCandidates.filter((c) => !c.brandedPrompt);
	const brandedPrompts = scoredCandidates.filter((c) => c.brandedPrompt);
	
	// Sort non-branded by: 1) has brand mention, 2) competitor mention rate, 3) brand mention rate
	nonBrandedPrompts.sort((a, b) => {
		if (a.hasBrandMention !== b.hasBrandMention) {
			return a.hasBrandMention ? -1 : 1;
		}
		if (Math.abs(a.competitorMentionRate - b.competitorMentionRate) > 0.1) {
			return b.competitorMentionRate - a.competitorMentionRate;
		}
		return b.brandMentionRate - a.brandMentionRate;
	});
	
	// Sort branded by: 1) brand mention rate, 2) competitor mention rate
	brandedPrompts.sort((a, b) => {
		if (Math.abs(a.brandMentionRate - b.brandMentionRate) > 0.1) {
			return b.brandMentionRate - a.brandMentionRate;
		}
		return b.competitorMentionRate - a.competitorMentionRate;
	});
	
	// Select prompts to meet brand mention requirements
	const selectedPrompts: string[] = [];
	let currentBrandMentions = 0;
	
	// First, add non-branded prompts with brand mentions
	for (const prompt of nonBrandedPrompts) {
		if (selectedPrompts.length >= TARGET_PROMPTS_COUNT) break;
		
		selectedPrompts.push(prompt.promptValue);
		if (prompt.hasBrandMention) {
			currentBrandMentions++;
		}
	}
	
	// If we need more prompts or more brand mentions, add branded prompts
	while (selectedPrompts.length < TARGET_PROMPTS_COUNT && brandedPrompts.length > 0) {
		const prompt = brandedPrompts.shift()!;
		selectedPrompts.push(prompt.promptValue);
		if (prompt.hasBrandMention) {
			currentBrandMentions++;
		}
	}
	
	// Log selection summary
	console.log(`Selected ${selectedPrompts.length} prompts with estimated ${currentBrandMentions} brand mentions`);
	
	return selectedPrompts;
}

// Function to check for brand and competitor mentions
function analyzeMentions(
	content: string,
	brandName: string,
	brandWebsite: string,
	competitors: CompetitorResult[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();
	const brandNameLower = brandName.toLowerCase();

	// Extract domain from brandWebsite using URL constructor
	const url = new URL(brandWebsite.startsWith('http') ? brandWebsite : `https://${brandWebsite}`);
	const domain = url.hostname.replace(/^www\./, '').toLowerCase();

	// Check for brand mention (brand name or domain)
	const brandMentioned = contentLower.includes(brandNameLower) || contentLower.includes(domain);

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

// Function to run a prompt across different models and return results
async function runPrompt(
	promptValue: string,
	brandName: string,
	brandWebsite: string,
	competitors: CompetitorResult[],
	job: ReportJobContext,
): Promise<PromptRunResult> {
	// Run 2 OpenAI, 1 Anthropic, 1 Google for each prompt (4 total runs)
	const runPromises = [
		// 2 OpenAI runs
		runWithOpenAI(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, brandWebsite, competitors);
			return {
				model: "chatgpt",
				version: AI_MODELS.OPENAI.MODEL,
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
		runWithOpenAI(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, brandWebsite, competitors);
			return {
				model: "chatgpt",
				version: AI_MODELS.OPENAI.MODEL,
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
		// 1 Anthropic run
		runWithAnthropic(promptValue).then(({ rawOutput, webQueries, textContent }) => {
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, brandWebsite, competitors);
			return {
				model: "claude",
				version: AI_MODELS.ANTHROPIC.MODEL,
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
			const { brandMentioned, competitorsMentioned } = analyzeMentions(textContent, brandName, brandWebsite, competitors);
			return {
				model: "google-ai-mode",
				version: "dataforseo",
				webSearchEnabled: true,
				rawOutput,
				webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
	];

	const runResults = await Promise.all(runPromises);

	job.log(`Completed ${runResults.length} runs for prompt: "${promptValue}"`);

	return {
		promptValue,
		runs: runResults,
	};
}

// Main report worker function
export async function processReportJob(job: ReportJobContext) {
	const { reportId, brandName, brandWebsite, manualPrompts } = job.data;

	job.log(`Processing report ID: ${reportId} for brand: ${brandName}`);
	
	// Determine if we're using manual prompts
	const useManualPrompts = manualPrompts && manualPrompts.length > 0;
	if (useManualPrompts) {
		job.log(`Using ${manualPrompts.length} manual prompts - skipping auto-generation`);
	}

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

		// Step 3: Get keywords (only if not using manual prompts)
		let keywords: KeywordResult[] = [];
		if (!useManualPrompts) {
			job.log(`Getting keywords for domain and products`);
			keywords = await getKeywords(brandWebsite, websiteAnalysis.products);
			job.updateProgress(35);
		} else {
			job.updateProgress(35);
		}

		// Step 4: Get personas (only if not using manual prompts)
		let personaGroups: PersonaGroup[] = [];
		if (!useManualPrompts) {
			job.log(`Getting personas for products and website`);
			personaGroups = await getPersonas(websiteAnalysis.products, brandWebsite);
			job.updateProgress(35);
		} else {
			job.updateProgress(35);
		}

		// Step 5: Generate or use provided prompts
		let candidatePrompts: { prompt: string; brandedPrompt: boolean }[];
		
		if (useManualPrompts) {
			// Use manual prompts directly
			job.log(`Using ${manualPrompts.length} manual prompts`);
			candidatePrompts = manualPrompts.map(prompt => ({
				prompt: prompt.toLowerCase().trim(),
				brandedPrompt: isPromptBranded(prompt, brandName, brandWebsite),
			}));
			job.updateProgress(40);
		} else {
			// Generate candidate prompts using Claude
			job.log(`Generating candidate prompts using Claude`);
			candidatePrompts = await generateCandidatePromptsForReports(
				brandName,
				brandWebsite,
				websiteAnalysis.products,
				competitors,
			);
			
			if (candidatePrompts.length === 0) {
				job.log(`Failed to generate candidate prompts, report cannot continue`);
				throw new Error("Failed to generate candidate prompts");
			}
			
			job.log(`Generated ${candidatePrompts.length} candidate prompts`);
			job.updateProgress(40);
		}

		// Step 6: Run all candidate prompts to test them
		job.log(`Testing ${candidatePrompts.length} candidate prompts`);
		const candidateResults: Array<{
			promptValue: string;
			brandedPrompt: boolean;
			runs: Array<{
				model: string;
				version: string;
				webSearchEnabled: boolean;
				rawOutput: any;
				webQueries: string[];
				textContent: string;
				brandMentioned: boolean;
				competitorsMentioned: string[];
			}>;
		}> = [];
		
		const totalCandidates = candidatePrompts.length;
		let completedCandidates = 0;

		// Run candidates in batches
		const batchSize = 20;
		for (let i = 0; i < candidatePrompts.length; i += batchSize) {
			const batch = candidatePrompts.slice(i, i + batchSize);
			const batchPromises = batch.map(async (candidate) => {
				try {
					const result = await runPrompt(candidate.prompt, brandName, brandWebsite, competitors, job);
					completedCandidates++;
					const progress = 40 + (completedCandidates / totalCandidates) * 30; // 40-70% for testing
					job.updateProgress(progress);
					return {
						promptValue: result.promptValue,
						brandedPrompt: candidate.brandedPrompt,
						runs: result.runs,
					};
				} catch (error) {
					job.log(
						`Error testing candidate "${candidate.prompt}": ${error instanceof Error ? error.message : "Unknown error"}`,
					);
					completedCandidates++;
					const progress = 40 + (completedCandidates / totalCandidates) * 30;
					job.updateProgress(progress);
					return {
						promptValue: candidate.prompt,
						brandedPrompt: candidate.brandedPrompt,
						runs: [],
					};
				}
			});

			const batchResults = await Promise.all(batchPromises);
			candidateResults.push(...batchResults);

			// Small delay between batches
			if (i + batchSize < candidatePrompts.length) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		job.updateProgress(70);

		// Step 7: Select optimal prompts from candidates
		job.log(`Selecting optimal ${TARGET_PROMPTS_COUNT} prompts from ${candidateResults.length} candidates`);
		const selectedPromptValues = selectOptimalPrompts(candidateResults, brandName, brandWebsite);
		job.updateProgress(75);

		// Step 8: Re-run selected prompts for final data
		job.log(`Running final ${selectedPromptValues.length} selected prompts`);
		const promptRuns: PromptRunResult[] = [];
		const totalFinalRuns = selectedPromptValues.length;
		let completedFinalRuns = 0;

		// Get the results for selected prompts from candidateResults
		const selectedPromptResults = candidateResults.filter((result) =>
			selectedPromptValues.includes(result.promptValue),
		);

		// Use existing results instead of re-running
		for (const result of selectedPromptResults) {
			promptRuns.push({
				promptValue: result.promptValue,
				runs: result.runs,
			});
			completedFinalRuns++;
			const progress = 75 + (completedFinalRuns / totalFinalRuns) * 20; // 75-95%
			job.updateProgress(progress);
		}

		job.updateProgress(95);

		// Create prompts data structure for storage
		const prompts: PromptData[] = selectedPromptValues.map((promptValue) => ({
			brandId: reportId,
			value: promptValue,
			enabled: true,
			tags: [],
			systemTags: computeSystemTags(promptValue, brandName, brandWebsite),
		}));

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
