import { NextRequest, NextResponse } from "next/server";
import * as client from "dataforseo-client";
import { dfsLabsApi } from "@/lib/dataforseo";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

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

	const requestInfo = configureDataForSEORequest(
		new client.DataforseoLabsGoogleKeywordIdeasLiveRequestInfo()
	);
	requestInfo.keywords = products.slice(0, 200); // Maximum 200 keywords

	console.log("DataForSEO Keyword Ideas Request Config:", {
		keywords: requestInfo.keywords,
		location_code: requestInfo.location_code,
		language_code: requestInfo.language_code,
		filters: requestInfo.filters,
		limit: requestInfo.limit,
		include_serp_info: requestInfo.include_serp_info,
	});

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

	const requestInfo = configureDataForSEORequest(
		new client.DataforseoLabsGoogleKeywordsForSiteLiveRequestInfo()
	);
	requestInfo.target = cleanDomain;

	console.log("DataForSEO Keywords for Site Request Config:", {
		target: requestInfo.target,
		location_code: requestInfo.location_code,
		language_code: requestInfo.language_code,
		filters: requestInfo.filters,
		limit: requestInfo.limit,
		include_serp_info: requestInfo.include_serp_info,
	});

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

async function getRelevantKeywords(allKeywords: any[], domain: string, products: string[]): Promise<{ keyword: string; search_volume: number; difficulty: number }[]> {
	if (!allKeywords || allKeywords.length === 0) {
		return [];
	}

	const productList = products.join(", ");
	const keywordList = allKeywords.map(k => k.keyword).join("\n");

	const prompt = `You are a content marketing expert helping to identify relevant keywords for article writing.

Given the following information:
- Website domain: ${domain}
- Products/services: ${productList}
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
		const response = await anthropic.messages.create({
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
		let relevantKeywords: { keyword: string; search_volume: number; difficulty: number }[] = [];

		if (match) {
			try {
				// Parse as JSON
				const selectedKeywords = JSON.parse(match[1].trim());
				if (Array.isArray(selectedKeywords)) {
					// Map selected keywords back to original objects with volume/difficulty
					relevantKeywords = selectedKeywords
						.filter((keyword) => typeof keyword === 'string')
						.map((keyword) => {
							const originalKeyword = allKeywords.find(k => k.keyword === keyword.trim());
							return originalKeyword ? {
								keyword: originalKeyword.keyword,
								search_volume: originalKeyword.search_volume,
								difficulty: originalKeyword.difficulty
							} : null;
						})
						.filter((k) => k !== null);
				}
			} catch (parseError) {
				console.error("Failed to parse relevant keywords JSON:", parseError);
				console.error("Raw content:", match[1]);
				relevantKeywords = allKeywords;
			}
		}

		console.log("GET-RELEVANT-KEYWORDS OUTPUT:", { count: relevantKeywords.length, sample: relevantKeywords.slice(0, 3) });

		return relevantKeywords;
	} catch (error) {
		console.error("Error getting relevant keywords from Anthropic:", error);
		return [];
	}
}

export async function POST(request: NextRequest) {
	try {
		const { domain, products } = await request.json();

		if (!domain) {
			return NextResponse.json({ error: "Domain is required" }, { status: 400 });
		}

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json({ error: "Products array is required" }, { status: 400 });
		}

		console.log("Getting keyword ideas for domain:", domain, "with products:", products);

		const [keywordIdeas, keywordsForSite] = await Promise.all([
			getKeywordIdeas(products),
			getKeywordsForSite(domain)
		]);
		const allKeywords = [...keywordIdeas, ...keywordsForSite];
		
		const keywords: { keyword: string; search_volume: number; difficulty: number }[] = await getRelevantKeywords(allKeywords, domain, products);

		console.log("Total keywords before sampling:", keywords.length);

		// Apply stratified sampling if we have more than 30 keywords
		const finalKeywords = stratifiedSample(keywords, 30);

		console.log("Final keywords after sampling:", finalKeywords.length);
		console.log("Sample of final keywords:", finalKeywords.slice(0, 5));

		return NextResponse.json({ keywords: finalKeywords });
	} catch (error) {
		console.error("Error getting keywords:", error);
		return NextResponse.json({ error: "Failed to get keywords" }, { status: 500 });
	}
}
