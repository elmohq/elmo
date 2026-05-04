import * as client from "dataforseo-client";
import { z } from "zod";
import { dfsLabsApi } from "./dataforseo";
import { getWebsiteExcerpt } from "./website-excerpt";
import { MAX_COMPETITORS } from "./constants";
import { isPromptBranded } from "./tag-utils";
import { runStructuredResearchPrompt } from "./onboarding/llm";

export interface AnalyzeWebsiteResult {
	products: string[];
	domainTraffic: number;
	skipDetailedAnalysis?: boolean;
}

export interface CompetitorResult {
	name: string;
	domain: string;
}

export interface PromptData {
	brandId: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
}

// Helper function to retry async operations with exponential backoff
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3,
	initialDelayMs: number = 1000,
): Promise<T> {
	let lastError: any;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			if (attempt < maxRetries - 1) {
				const delayMs = initialDelayMs * Math.pow(2, attempt);
				console.log(`Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}

	throw lastError;
}

// Function to check domain traffic using DataForSEO Labs Bulk Traffic Estimation API
export async function checkDomainTraffic(domain: string): Promise<number> {
	if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
		console.log("Skipping domain traffic check — DATAFORSEO_LOGIN/PASSWORD not configured.");
		return 0;
	}
	try {
		return await retryWithBackoff(async () => {
			// Clean domain (remove protocol and www)
			const cleanDomain = domain
				.replace(/^https?:\/\//, "")
				.replace(/^www\./, "")
				.split("/")[0];

			// Create request object for bulk traffic estimation
			const requestInfo = new client.DataforseoLabsGoogleBulkTrafficEstimationLiveRequestInfo({
				targets: [cleanDomain],
				location_code: 2840, // United States
				language_code: "en",
			});

			const response = await dfsLabsApi.googleBulkTrafficEstimationLive([requestInfo]);

			if (!response || !response.tasks || response.tasks.length === 0) {
				console.error("DataForSEO Labs Bulk Traffic Estimation API Error: No response or tasks");
				return 0;
			}

			const task = response.tasks[0];
			console.log("Task Status:", task.status_code, task.status_message);

			if (task.status_code === 20000 && task.result && task.result.length > 0) {
				const result = task.result[0];
				if (result.items && result.items.length > 0) {
					const item = result.items[0];
					// Use organic estimated traffic volume as the metric
					const trafficVolume = item.metrics?.organic?.etv || 0;
					console.log(`Domain organic traffic volume for ${cleanDomain}: ${trafficVolume}`);
					return trafficVolume;
				}
			}

			console.log("No traffic data found for domain:", cleanDomain);
			return 0;
		}, 3, 1000);
	} catch (error) {
		console.error("Error checking domain traffic after retries:", error);
		return 0; // Default to 0 if there's an error after all retries
	}
}

async function extractProducts(website: string): Promise<string[]> {
	const websiteExcerpt = await getWebsiteExcerpt(website);
	const excerptContext = websiteExcerpt
		? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
		: "\n\n";

	const prompt = `What kinds of products does ${website} sell? Use general categories, not branded names. For example, converse.com would be ["shoes", "hi-tops", "casual shoes"]. Return up to 4 short lowercase categories.${excerptContext}`;

	const result = await runStructuredResearchPrompt(
		prompt,
		z.object({
			products: z.array(z.string()).describe("Up to 4 short, lowercase, generic product categories"),
		}),
	);
	return result.products.slice(0, 4);
}

// Analyze website to get products
export async function analyzeWebsite(website: string): Promise<AnalyzeWebsiteResult> {
	const domainTraffic = await checkDomainTraffic(website);
	const TRAFFIC_THRESHOLD = 400;

	if (domainTraffic < TRAFFIC_THRESHOLD) {
		console.log(`Domain traffic ${domainTraffic} is below threshold ${TRAFFIC_THRESHOLD}. Skipping detailed analysis.`);

		const products = await extractProducts(website);

		console.log("ANALYZE-WEBSITE OUTPUT (low traffic):", { products, domainTraffic, skipDetailedAnalysis: true });

		return {
			products,
			domainTraffic,
			skipDetailedAnalysis: true,
		};
	}

	const products = await extractProducts(website);

	console.log("ANALYZE-WEBSITE OUTPUT:", { products, domainTraffic });

	return { products, domainTraffic };
}

// Clean domain helper function
function cleanDomain(domain: string): string {
	if (!domain) return "";

	try {
		// Add protocol if missing for URL constructor
		const urlString = domain.startsWith("http") ? domain : `https://${domain}`;
		const url = new URL(urlString);

		// Get hostname and remove www. prefix if present
		let hostname = url.hostname.toLowerCase();
		if (hostname.startsWith("www.")) {
			hostname = hostname.substring(4);
		}

		return hostname;
	} catch (error) {
		// Fallback for invalid URLs - just clean up basic cases
		return domain
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.split("/")[0]
			.toLowerCase()
			.trim();
	}
}

export async function getCompetitors(products: string[], website: string): Promise<CompetitorResult[]> {
	const productList = products.join(", ");
	const websiteExcerpt = await getWebsiteExcerpt(website);
	const excerptContext = websiteExcerpt
		? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
		: "\n\n";

	const prompt = `Identify up to ${MAX_COMPETITORS} direct competitors of ${website}, which sells ${productList}. Competitors should sell similar products in a similar way to a similar audience. Use web search if available to verify current market information. If ${website} is very small or has no clear direct competitors, return an empty array. Do not include competitors that sell similar types of products but would not be considered direct competitors.${excerptContext}`;

	let competitors: CompetitorResult[] = [];
	try {
		const result = await runStructuredResearchPrompt(
			prompt,
			z.object({
				competitors: z
					.array(
						z.object({
							name: z.string().describe("Company name"),
							domain: z
								.string()
								.describe(`Primary website hostname only — no protocol, no www, no path (e.g. "example.com")`),
						}),
					)
					.describe(`Up to ${MAX_COMPETITORS} direct competitors`),
			}),
		);
		competitors = result.competitors
			.filter((c) => c.name && c.domain)
			.map((c) => ({ name: c.name.trim(), domain: cleanDomain(c.domain.trim()) }))
			.slice(0, MAX_COMPETITORS);
	} catch (err) {
		console.error("Failed to fetch competitors:", err);
	}

	console.log("GET-COMPETITORS OUTPUT:", { competitors });
	return competitors;
}

// Generate candidate prompts for reports.
export async function generateCandidatePromptsForReports(
	brandName: string,
	brandWebsite: string,
	products: string[],
	competitors: CompetitorResult[],
): Promise<{ prompt: string; brandedPrompt: boolean }[]> {
	const productList = products.join(", ");
	const competitorNames = competitors.map((c) => c.name).join(", ");
	const websiteExcerpt = await getWebsiteExcerpt(brandWebsite);
	const excerptContext = websiteExcerpt
		? `\n\nWebsite excerpt:\n---\n${websiteExcerpt}\n---\n\n`
		: "\n";

	const prompt = `Generate a set of 70 short purchasing-decision prompts related to the brand ${brandName} (${brandWebsite}, sells ${productList}). The goal is for 14-28 of these prompts, when evaluated in ChatGPT/Claude/similar, to mention ${brandName} in the response. Ideally each prompt should also tend to surface a major competitor (${competitorNames}). Prompts should be short fragments, not full sentences, lowercase, in the style of "best X", "best X for Y", "good X alternative", "where to buy X". Most prompts should NOT include competitor names directly.

Then add 14 "fallback" branded prompts that contain "${brandName.toLowerCase()}" directly (e.g. "${brandName.toLowerCase()} alternatives", "best ${brandName.toLowerCase()} products"), guaranteed to surface the brand.${excerptContext}`;

	try {
		const result = await runStructuredResearchPrompt(
			prompt,
			z.object({
				prompts: z
					.array(
						z.object({
							prompt: z.string().describe("Lowercase short prompt fragment"),
						}),
					)
					.describe("84 prompts total: 70 unbranded + 14 branded fallbacks"),
			}),
		);

		const candidatePrompts = result.prompts
			.map((p) => p.prompt.trim())
			.filter((p) => p.length > 0)
			.map((p) => ({
				prompt: p.toLowerCase(),
				brandedPrompt: isPromptBranded(p, brandName, brandWebsite),
			}));

		if (candidatePrompts.length === 0) {
			throw new Error("LLM returned no candidate prompts");
		}

		console.log(
			`Generated ${candidatePrompts.length} candidate prompts (${candidatePrompts.filter((p) => p.brandedPrompt).length} branded)`,
		);
		return candidatePrompts;
	} catch (error) {
		console.error("Error generating candidate prompts:", error);
		throw error;
	}
}
