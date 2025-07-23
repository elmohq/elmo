import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import * as client from "dataforseo-client";
import { dfsLabsApi, dfsSerpApi } from "@/lib/dataforseo";
import { getWebsiteExcerpt } from "@/lib/website-excerpt";
import { MAX_COMPETITORS } from "@/lib/constants";

const anthropicClient = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AnalyzeWebsiteResult {
	products: string[];
	domainTraffic: number;
	skipDetailedAnalysis?: boolean;
}

export interface CompetitorResult {
	name: string;
	domain: string;
}

export interface KeywordResult {
	keyword: string;
	search_volume: number;
	difficulty: number;
}

export interface PersonaGroup {
	name: string;
	personas: string[];
}

export interface PromptData {
	brandId: string;
	groupCategory: string | null;
	groupPrefix: string | null;
	value: string;
	enabled: boolean;
}

// Function to check domain traffic using DataForSEO Labs Bulk Traffic Estimation API
async function checkDomainTraffic(domain: string): Promise<number> {
	try {
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
	} catch (error) {
		console.error("Error checking domain traffic:", error);
		return 0; // Default to 0 if there's an error
	}
}

// Extract products from website analysis
async function extractProducts(website: string): Promise<string[]> {
	// Get website excerpt for additional context
	const websiteExcerpt = await getWebsiteExcerpt(website);
	const excerptContext = websiteExcerpt
		? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
		: "\n\n";

	const prompt = `What kinds of products does ${website} sell? 
${excerptContext}
Use general categories, not branded names. For example, converse.com should return:
<out>shoes,hi-tops,casual shoes</out>

Be concise and output to a comma separated list contained within <out> xml tags. List up to 4.`;

	const response = await anthropicClient.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 1000,
		messages: [
			{
				role: "user",
				content: prompt,
			},
		],
		tools: [
			{
				type: "web_search_20250305",
				name: "web_search",
				max_uses: 5,
			},
		],
	});

	// Extract text content from all text blocks in response
	const textBlocks = response.content.filter((block) => block.type === "text");
	const allTextContent = textBlocks.map((block) => block.text).join("\n");

	// Extract content between <out> tags
	const match = allTextContent.match(/<out>([\s\S]*?)<\/out>/);
	const products = match
		? match[1]
				.split(",")
				.map((p) => p.trim())
				.filter((p) => p.length > 0)
				.slice(0, 4)
		: [];

	return products;
}

// Analyze website to get products
export async function analyzeWebsite(website: string): Promise<AnalyzeWebsiteResult> {
	const domainTraffic = await checkDomainTraffic(website);
	const TRAFFIC_THRESHOLD = 400;

	if (domainTraffic < TRAFFIC_THRESHOLD) {
		console.log(
			`Domain traffic ${domainTraffic} is below threshold ${TRAFFIC_THRESHOLD}. Skipping detailed analysis.`,
		);

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

// Get competitors for products and website
export async function getCompetitors(products: string[], website: string): Promise<CompetitorResult[]> {
	const productList = products.join(", ");

	// Get website excerpt for additional context
	const websiteExcerpt = await getWebsiteExcerpt(website);
	const excerptContext = websiteExcerpt
		? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
		: "\n\n";

	const prompt = `What are up to ${MAX_COMPETITORS} direct to consumer competitors of ${website} (which sells ${productList}). 
		${excerptContext}
The competitors should sell similar products in a similar way to a similar audience.

Please search for current market information to identify direct competitors. 
For each competitor, provide both the company name and their website domain. 
Format the output as a JSON array where each competitor is an object with "name" and "domain" fields. 
The domain should be the main website domain (e.g., "example.com") without "https://" or "www.". 
Contain the JSON within <out> xml tags. List up to ${MAX_COMPETITORS} competitors.

Do not include competitors that sell similar types of products but would not be considered as direct competitors to ${website}.
If ${website} is very small, it may not have any direct competitors. In this case, return an empty array.

Example format:
<out>
[
  {"name": "Company Name", "domain": "example.com"},
  {"name": "Another Company", "domain": "another.com"}
]
</out>`;

	const response = await anthropicClient.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 10000,
		messages: [
			{
				role: "user",
				content: prompt,
			},
		],
		tools: [
			{
				type: "web_search_20250305",
				name: "web_search",
				max_uses: 2,
			},
		],
	});

	// Extract text content from all text blocks in response
	const textBlocks = response.content.filter((block) => block.type === "text");
	const allTextContent = textBlocks.map((block) => block.text).join("\n");

	// Extract content between <out> tags
	const match = allTextContent.match(/<out>([\s\S]*?)<\/out>/);
	let competitors: CompetitorResult[] = [];

	if (match) {
		try {
			// Parse as JSON
			const parsedCompetitors = JSON.parse(match[1].trim());
			if (Array.isArray(parsedCompetitors)) {
				competitors = parsedCompetitors
					.filter((c) => c && typeof c === "object" && c.name && c.domain)
					.map((c) => ({
						name: c.name.trim(),
						domain: cleanDomain(c.domain.trim()),
					}))
					.slice(0, MAX_COMPETITORS);
			}
		} catch (parseError) {
			// Log error and return empty list
			console.error("Failed to parse competitors JSON:", parseError);
			console.error("Raw content:", match[1]);
			competitors = [];
		}
	}

	console.log("GET-COMPETITORS OUTPUT:", { competitors });

	return competitors;
}

// Helper function to perform stratified random sampling
function stratifiedSample(keywords: any[], targetSize: number) {
	if (keywords.length <= targetSize) {
		return keywords;
	}

	// Find min/max for search volume and difficulty
	const searchVolumes = keywords.map((k) => k.search_volume);
	const difficulties = keywords.map((k) => k.difficulty);

	const minVolume = Math.min(...searchVolumes);
	const maxVolume = Math.max(...searchVolumes);
	const minDifficulty = Math.min(...difficulties);
	const maxDifficulty = Math.max(...difficulties);

	// Create 3x3 grid of buckets (9 total)
	const buckets: any[][] = Array(9)
		.fill(null)
		.map(() => []);

	// Assign each keyword to a bucket based on its position in the ranges
	keywords.forEach((keyword) => {
		const volumeIndex =
			maxVolume === minVolume
				? 0
				: Math.min(2, Math.floor(((keyword.search_volume - minVolume) / (maxVolume - minVolume)) * 3));
		const difficultyIndex =
			maxDifficulty === minDifficulty
				? 0
				: Math.min(2, Math.floor(((keyword.difficulty - minDifficulty) / (maxDifficulty - minDifficulty)) * 3));

		const bucketIndex = volumeIndex * 3 + difficultyIndex;
		buckets[bucketIndex].push(keyword);
	});

	// Calculate how many keywords to sample from each bucket
	const nonEmptyBuckets = buckets.filter((bucket) => bucket.length > 0);
	const samplesPerBucket = Math.floor(targetSize / nonEmptyBuckets.length);
	let remainingSamples = targetSize - samplesPerBucket * nonEmptyBuckets.length;

	const sampledKeywords: any[] = [];

	// Sample from each bucket
	nonEmptyBuckets.forEach((bucket) => {
		let sampleCount = samplesPerBucket;

		// Distribute remaining samples
		if (remainingSamples > 0) {
			sampleCount++;
			remainingSamples--;
		}

		// Randomly sample from this bucket
		const shuffled = [...bucket].sort(() => Math.random() - 0.5);
		sampledKeywords.push(...shuffled.slice(0, Math.min(sampleCount, bucket.length)));
	});

	// If we still need more samples (edge case), add random ones
	if (sampledKeywords.length < targetSize) {
		const remaining = keywords.filter((k) => !sampledKeywords.includes(k));
		const shuffled = remaining.sort(() => Math.random() - 0.5);
		sampledKeywords.push(...shuffled.slice(0, targetSize - sampledKeywords.length));
	}

	return sampledKeywords.slice(0, targetSize);
}

// Helper function to configure common DataForSEO request properties
function configureDataForSEORequest(requestInfo: any) {
	requestInfo.location_code = 2840; // United States
	requestInfo.language_code = "en"; // English
	requestInfo.limit = 150; // Maximum allowed

	// Add filters for informational intent keywords suitable for articles
	requestInfo.filters = [
		["keyword_info.search_volume", ">", 100],
		"and",
		["keyword_info.search_volume", "<", 20000],
		"and",
		["keyword_info.competition", ">", 0],
		"and",
		["keyword_info.competition", "<", 0.8],
		"and",
		["search_intent_info.main_intent", "in", ["informational", "commercial", "transactional"]],
	];

	return requestInfo;
}

// Function to get keyword ideas using the keyword ideas endpoint
async function getKeywordIdeas(products: string[]) {
	console.log("Using DataForSEO Keyword Ideas API with products:", products);

	const requestInfo = configureDataForSEORequest(new client.DataforseoLabsGoogleKeywordIdeasLiveRequestInfo());
	requestInfo.keywords = products.slice(0, 200); // Maximum 200 keywords

	try {
		const response = await dfsLabsApi.googleKeywordIdeasLive([requestInfo]);

		if (!response || !response.tasks || response.tasks.length === 0) {
			console.error("DataForSEO Keyword Ideas API Error: No response or tasks");
			return [];
		}

		const task = response.tasks[0];
		console.log("Task Status:", task.status_code, task.status_message);

		if (task.status_code === 20000 && task.result && task.result.length > 0) {
			const result = task.result[0];
			console.log("Number of keyword ideas returned:", result.items?.length || 0);

			if (result.items && result.items.length > 0) {
				return result.items.map((item: any) => {
					const competition = item.keyword_info?.competition || 0;
					const difficulty = Math.round(competition * 100);

					return {
						keyword: item.keyword,
						search_volume: item.keyword_info?.search_volume || 0,
						difficulty: difficulty,
					};
				});
			}
		}

		console.log("No keyword ideas found or API error:", task.status_code, task.status_message);
		return [];
	} catch (error) {
		console.error("Error calling DataForSEO Keyword Ideas API:", error);
		return [];
	}
}

// Function to get keywords for site using the original site-based endpoint
async function getKeywordsForSite(domain: string) {
	console.log("Using DataForSEO Keywords for Site API with domain:", domain);

	// Clean domain (remove protocol and www)
	const cleanDomain = domain
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replaceAll("/", "");

	const requestInfo = configureDataForSEORequest(new client.DataforseoLabsGoogleKeywordsForSiteLiveRequestInfo());
	requestInfo.target = cleanDomain;

	try {
		const response = await dfsLabsApi.googleKeywordsForSiteLive([requestInfo]);

		if (!response || !response.tasks || response.tasks.length === 0) {
			console.error("DataForSEO Keywords for Site API Error: No response or tasks");
			return [];
		}

		const task = response.tasks[0];
		console.log("Task Status:", task.status_code, task.status_message);

		if (task.status_code === 20000 && task.result && task.result.length > 0) {
			const result = task.result[0];
			console.log("Number of site keywords returned:", result.items?.length || 0);

			if (result.items && result.items.length > 0) {
				return result.items.map((item: any) => {
					const competition = item.keyword_info?.competition || 0;
					const difficulty = Math.round(competition * 100);

					return {
						keyword: item.keyword,
						search_volume: item.keyword_info?.search_volume || 0,
						difficulty: difficulty,
					};
				});
			}
		}

		console.log("No site keywords found or API error:", task.status_code, task.status_message);
		return [];
	} catch (error) {
		console.error("Error calling DataForSEO Keywords for Site API:", error);
		return [];
	}
}

// Get relevant keywords using AI filtering
async function getRelevantKeywords(
	allKeywords: any[],
	domain: string,
	products: string[],
): Promise<KeywordResult[]> {
	if (!allKeywords || allKeywords.length === 0) {
		return [];
	}

	const productList = products.join(", ");
	const keywordList = allKeywords.map((k) => k.keyword).join("\n");

	// Get website excerpt for additional context
	const websiteExcerpt = await getWebsiteExcerpt(domain);
	const excerptContext = websiteExcerpt
		? `\n\nHere is an excerpt of the first 200 lines of text from ${domain}:\n\n${websiteExcerpt}\n\n`
		: "\n\n";

	const prompt = `You are a content marketing expert helping to identify relevant keywords for article writing.

Given the following information:
- Website domain: ${domain}
- Products/services: ${productList}
${excerptContext}
- Available keywords:

${keywordList}

Please analyze these keywords and select the most relevant ones for writing articles that would:
1. Attract readers who are potential customers for the products/services
2. Be suitable for content marketing and SEO article writing
3. Have good potential for driving qualified traffic to the website
4. Cover different aspects of the business (educational, comparison, how-to, etc.)

Focus on keywords that would make sense for articles like:
- "How to choose the right [product]"
- "Benefits of [product/service]"
- "Best practices for [topic related to products]"
- "[Product] vs alternatives"
- "Guide to [product category]"

Select up to 100 of the most relevant keywords and return them as a JSON array of keyword strings.

Format the output as JSON within <out> xml tags.

<out>
[
  "example keyword",
  "another keyword",
  "third keyword"
]
</out>`;

	try {
		const response = await anthropicClient.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 4000,
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
		});

		// Extract text content from all text blocks in response
		const textBlocks = response.content.filter((block) => block.type === "text");
		const allTextContent = textBlocks.map((block) => block.text).join("\n");

		// Extract content between <out> tags
		const match = allTextContent.match(/<out>([\s\S]*?)<\/out>/);
		let relevantKeywords: KeywordResult[] = [];

		if (match) {
			try {
				// Parse as JSON
				const selectedKeywords = JSON.parse(match[1].trim());
				if (Array.isArray(selectedKeywords)) {
					// Map selected keywords back to original objects with volume/difficulty
					relevantKeywords = selectedKeywords
						.filter((keyword) => typeof keyword === "string")
						.map((keyword) => {
							const originalKeyword = allKeywords.find((k) => k.keyword === keyword.trim());
							return originalKeyword
								? {
										keyword: originalKeyword.keyword,
										search_volume: originalKeyword.search_volume,
										difficulty: originalKeyword.difficulty,
									}
								: null;
						})
						.filter((k) => k !== null);
				}
			} catch (parseError) {
				console.error("Failed to parse relevant keywords JSON:", parseError);
				console.error("Raw content:", match[1]);
				relevantKeywords = allKeywords;
			}
		}

		console.log("GET-RELEVANT-KEYWORDS OUTPUT:", {
			count: relevantKeywords.length,
			sample: relevantKeywords.slice(0, 3),
		});

		return relevantKeywords;
	} catch (error) {
		console.error("Error getting relevant keywords from Anthropic:", error);
		return [];
	}
}

// Get keywords for domain and products
export async function getKeywords(domain: string, products: string[]): Promise<KeywordResult[]> {
	console.log("Getting keyword ideas for domain:", domain, "with products:", products);

	const [keywordIdeas, keywordsForSite] = await Promise.all([getKeywordIdeas(products), getKeywordsForSite(domain)]);
	const allKeywords = [...keywordIdeas, ...keywordsForSite];

	const keywords = await getRelevantKeywords(allKeywords, domain, products);

	console.log("Total keywords before sampling:", keywords.length);

	// Apply stratified sampling if we have more than 30 keywords
	const finalKeywords = stratifiedSample(keywords, 30);

	console.log("Final keywords after sampling:", finalKeywords.length);
	console.log("Sample of final keywords:", finalKeywords.slice(0, 5));

	return finalKeywords;
}

// Get personas for products and website
export async function getPersonas(products: string[], website: string): Promise<PersonaGroup[]> {
	// Take the first 2-3 product categories for autocomplete queries
	const topProducts = products.slice(0, 5);
	const allSuggestions: string[] = [];

	// Get autocomplete suggestions for each product
	for (const product of topProducts) {
		try {
			const task = new client.SerpGoogleAutocompleteLiveAdvancedRequestInfo();
			task.keyword = `best ${product}`;
			task.location_code = 2840;
			task.language_code = "en";

			console.log("task.keyword", task.keyword);

			const response = await dfsSerpApi.googleAutocompleteLiveAdvanced([task]);

			console.log("response", response);

			if (response && response.tasks && response.tasks[0] && response.tasks[0].result) {
				const items = response.tasks[0].result[0]?.items || [];

				// Extract suggestions and get the suffixes after "for"
				items.forEach((item: any) => {
					if (item.suggestion && item.suggestion.includes(" for ")) {
						const parts = item.suggestion.split(" for ");
						if (parts.length > 1) {
							// Get the part after "for" and clean it up
							const suffix = parts[1].trim();
							if (suffix && suffix.length > 0) {
								allSuggestions.push(suffix);
							}
						}
					}
				});
			}
		} catch (error) {
			console.error(`Error getting autocomplete for "${product}":`, error);
			// Continue with other products even if one fails
		}
	}

	// Count occurrences of each suffix
	const suffixCounts = new Map<string, number>();
	allSuggestions
		.filter((s) => s && s.length > 0)
		.forEach((suffix) => {
			suffixCounts.set(suffix, (suffixCounts.get(suffix) || 0) + 1);
		});

	// Sort by count (descending) and get top 20
	const sortedSuffixes = Array.from(suffixCounts.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20)
		.map(([suffix, count]) => suffix);

	console.log(
		"Top autocomplete suffixes by frequency:",
		Array.from(suffixCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([suffix, count]) => `${suffix} (${count})`),
	);

	// Use Claude to group the suffixes into strategic categories
	const suffixList = sortedSuffixes.join(", ");

	// Get website excerpt for additional context
	const websiteExcerpt = await getWebsiteExcerpt(website);
	const excerptContext = websiteExcerpt
		? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
		: "\n\n";

	const prompt = `You have collected Google autocomplete suggestions for "best [product] for" queries. Here are the unique suffixes (the parts that come after "for"):

${suffixList}
${excerptContext}
Your task is to group these suffixes into 2-3 strategic category groups that would be useful for comparison tracking and market analysis. Each category should represent a key dimension for business decisions and competitive positioning.

Think about broad dimensions that matter for ecommerce brands, such as:
- Customers (startups, enterprises, small businesses, etc.)
- Purpose (marketing, sales, analytics, etc.) 
- Industries (healthcare, fashion, technology, etc.)
- Models (B2B, B2C, subscription, etc.)
- Sizes (startup, SMB, enterprise, etc.)

Create up to 3 strategic category groups with up to 4 items each. Focus on the most common and strategically valuable groupings from the suffixes provided.

The should be a good mix of personas that are relevant to the products for sale (which are ${products.join(", ")}) and the website ${website}.

IMPORTANT: Use only ONE NON-PLURAL WORD for each category group name. Examples: "Demographic", "Use", "Customer", "Industry", "Purpose", "Segment", "Market", "Type", "Role", "Stage".

If you are not confident a group is relevant, do not include it.
If you are not confident an item in a group is relevant, do not include it.
If the group or item does not make sense for all of the different products for sale, do not include it.
If you are not confident a group or item is relevant to the website ${website}, regardless of the products, do not include it.
If the brand is small and the product categories are very broad, do not include any groups.
If the groups are not specific to the brand ${website}, do not include them.

Format your response as:
<group name="Category1">item1,item2,item3,item4</group>
<group name="Category2">item1,item2,item3,item4</group>
<group name="Category3">item1,item2,item3,item4</group>

Only include suffixes that clearly fit into strategic categories. Ignore overly specific or unclear terms.`;

	const { text } = await generateText({
		model: anthropic("claude-sonnet-4-20250514"),
		prompt,
		maxTokens: 800,
	});

	console.log("text", text);

	// Extract groups with names
	const groupMatches = text.match(/<group name="([^"]*?)">([\s\S]*?)<\/group>/g);
	const personaGroups = groupMatches
		? groupMatches
				.map((groupMatch) => {
					const fullMatch = groupMatch.match(/<group name="([^"]*?)">([\s\S]*?)<\/group>/);
					if (fullMatch) {
						const groupName = fullMatch[1];
						const personas = fullMatch[2]
							.split(",")
							.map((p) => p.trim())
							.filter((p) => p.length > 0)
							.slice(0, 4);
						return {
							name: groupName,
							personas: personas,
						};
					}
					return null;
				})
				.filter((group) => group !== null)
		: [];

	console.log("GET-PERSONAS OUTPUT (DATAFORSEO + CLAUDE):", { personaGroups });

	return personaGroups;
}

// Create prompts from wizard data (without database operations)
export function createPromptsData(data: {
	brandId: string;
	products: string[];
	competitors: CompetitorResult[];
	personaGroups: PersonaGroup[];
	keywords: KeywordResult[];
	customPrompts: string[];
}): { prompts: PromptData[]; competitors: CompetitorResult[] } {
	const { brandId, products, competitors, personaGroups, keywords, customPrompts } = data;
	const promptsToCreate: PromptData[] = [];

	// Add product categories as basic prompts (with "best " prefix)
	if (products && Array.isArray(products)) {
		for (const product of products) {
			promptsToCreate.push({
				brandId,
				groupCategory: null,
				groupPrefix: null,
				value: `best ${product}`,
				enabled: true,
			});
		}
	}

	// Add product categories + personas as grouped prompts (cross-product)
	if (products && Array.isArray(products) && personaGroups && Array.isArray(personaGroups)) {
		for (const product of products) {
			for (const group of personaGroups) {
				if (group && group.name && Array.isArray(group.personas)) {
					for (const persona of group.personas) {
						promptsToCreate.push({
							brandId,
							groupCategory: group.name,
							groupPrefix: `best ${product} for `,
							value: `best ${product} for ${persona}`,
							enabled: true,
						});
					}
				}
			}
		}
	}

	// Add custom prompts
	if (customPrompts && Array.isArray(customPrompts)) {
		for (const prompt of customPrompts) {
			promptsToCreate.push({
				brandId,
				groupCategory: null,
				groupPrefix: null,
				value: prompt,
				enabled: true,
			});
		}
	}

	// Add keywords from DataForSEO (no group)
	if (keywords && Array.isArray(keywords)) {
		for (const keywordData of keywords) {
			promptsToCreate.push({
				brandId,
				groupCategory: null,
				groupPrefix: null,
				value: keywordData.keyword,
				enabled: true,
			});
		}
	}

	return {
		prompts: promptsToCreate,
		competitors: competitors || [],
	};
} 