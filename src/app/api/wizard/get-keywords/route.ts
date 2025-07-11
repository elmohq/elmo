import { NextRequest, NextResponse } from "next/server";
import * as client from 'dataforseo-client'
import { dfsLabsApi } from "@/lib/dataforseo";

// Helper function to perform stratified random sampling
function stratifiedSample(keywords: any[], targetSize: number) {
	if (keywords.length <= targetSize) {
		return keywords;
	}

	// Find min/max for search volume and difficulty
	const searchVolumes = keywords.map(k => k.search_volume);
	const difficulties = keywords.map(k => k.difficulty);
	
	const minVolume = Math.min(...searchVolumes);
	const maxVolume = Math.max(...searchVolumes);
	const minDifficulty = Math.min(...difficulties);
	const maxDifficulty = Math.max(...difficulties);

	// Create 3x3 grid of buckets (9 total)
	const buckets: any[][] = Array(9).fill(null).map(() => []);
	
	// Assign each keyword to a bucket based on its position in the ranges
	keywords.forEach(keyword => {
		const volumeIndex = maxVolume === minVolume ? 0 : 
			Math.min(2, Math.floor((keyword.search_volume - minVolume) / (maxVolume - minVolume) * 3));
		const difficultyIndex = maxDifficulty === minDifficulty ? 0 : 
			Math.min(2, Math.floor((keyword.difficulty - minDifficulty) / (maxDifficulty - minDifficulty) * 3));
		
		const bucketIndex = volumeIndex * 3 + difficultyIndex;
		buckets[bucketIndex].push(keyword);
	});

	// Calculate how many keywords to sample from each bucket
	const nonEmptyBuckets = buckets.filter(bucket => bucket.length > 0);
	const samplesPerBucket = Math.floor(targetSize / nonEmptyBuckets.length);
	let remainingSamples = targetSize - (samplesPerBucket * nonEmptyBuckets.length);

	const sampledKeywords: any[] = [];

	// Sample from each bucket
	nonEmptyBuckets.forEach(bucket => {
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
		const remaining = keywords.filter(k => !sampledKeywords.includes(k));
		const shuffled = remaining.sort(() => Math.random() - 0.5);
		sampledKeywords.push(...shuffled.slice(0, targetSize - sampledKeywords.length));
	}

	return sampledKeywords.slice(0, targetSize);
}

export async function POST(request: NextRequest) {
	try {
		const { domain } = await request.json();

		if (!domain) {
			return NextResponse.json(
				{ error: "Domain is required" },
				{ status: 400 }
			);
		}

		// Clean domain (remove protocol and www)
		const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replaceAll('/', '');

		// Create request for DataForSEO Labs Keywords for Site API
		const requestInfo = new client.DataforseoLabsGoogleKeywordsForSiteLiveRequestInfo();
		requestInfo.target = cleanDomain;
		requestInfo.location_code = 2840; // United States
		requestInfo.language_code = "en"; // English
		requestInfo.include_serp_info = false;
		requestInfo.include_subdomains = true;
		requestInfo.ignore_synonyms = false;
		requestInfo.include_clickstream_data = false;
		requestInfo.limit = 200; // Increased from 100 to 200
		requestInfo.filters = [
			["keyword_info.competition", ">", 0], // Exclude competition = 0
			"and",
			["keyword_info.competition", "<", 0.6], // Relaxed from 0.4 to 0.6
			"and",
			["keyword_info.search_volume", ">", 500], // Lowered from 1000 to 500
			// "and",
			// ["search_intent_info.main_intent", "=", "commercial"] // Filter for commercial intent - doesn't quite do what we want
		];

		console.log("DataForSEO Request Config:", {
			target: requestInfo.target,
			location_code: requestInfo.location_code,
			language_code: requestInfo.language_code,
			filters: requestInfo.filters,
			limit: requestInfo.limit,
			include_subdomains: requestInfo.include_subdomains,
			ignore_synonyms: requestInfo.ignore_synonyms,
			include_clickstream_data: requestInfo.include_clickstream_data,
			include_serp_info: requestInfo.include_serp_info
		});

		// Use DataForSEO Labs API endpoint
		const response = await dfsLabsApi.googleKeywordsForSiteLive([requestInfo]);

		if (!response || !response.tasks || response.tasks.length === 0) {
			console.error("DataForSEO API Error: No response or tasks");
			return NextResponse.json(
				{ error: "Failed to fetch keywords from DataForSEO" },
				{ status: 500 }
			);
		}

		const task = response.tasks[0];
		console.log("Task Status:", task.status_code, task.status_message);
		
		if (task.status_code === 20000 && task.result && task.result.length > 0) {
			const result = task.result[0];
			console.log("Number of results before filtering:", result.items?.length || 0);
			
			if (result.items && result.items.length > 0) {
				console.log("Sample result item:", result.items[0]);
				
				const keywords = result.items.map((item: any) => {
					console.log("Processing item:", {
						keyword: item.keyword,
						search_volume: item.keyword_info?.search_volume,
						competition_level: item.keyword_info?.competition_level,
						competition: item.keyword_info?.competition,
						competition_index: item.keyword_info?.competition_index
					});
					
					// Convert competition (0-1) to difficulty percentage
					const competition = item.keyword_info?.competition || 0;
					const difficulty = Math.round(competition * 100);
					
					return {
						keyword: item.keyword,
						search_volume: item.keyword_info?.search_volume || 0,
						difficulty: difficulty
					};
				});

				console.log("Total keywords before sampling:", keywords.length);
				
				// Apply stratified sampling if we have more than 30 keywords
				const finalKeywords = stratifiedSample(keywords, 30);
				
				console.log("Final keywords after sampling:", finalKeywords.length);
				console.log("Sample of final keywords:", finalKeywords.slice(0, 5));
				
				return NextResponse.json({ keywords: finalKeywords });
			}
		}
		
		console.log("API Error - Status:", task.status_code, "Message:", task.status_message);
		console.log("Task data:", task);
		
		// Return empty array for non-successful status codes
		return NextResponse.json({ keywords: [] });
	} catch (error) {
		console.error("Error getting keywords:", error);
		return NextResponse.json(
			{ error: "Failed to get keywords" },
			{ status: 500 }
		);
	}
} 