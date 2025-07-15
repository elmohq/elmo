import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getWebsiteExcerpt } from "@/lib/website-excerpt";
import { dfsLabsApi } from "@/lib/dataforseo";
import * as client from "dataforseo-client";

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

// Function to check domain traffic using DataForSEO Labs Bulk Traffic Estimation API
async function checkDomainTraffic(domain: string): Promise<number> {
	try {
		// Clean domain (remove protocol and www)
		const cleanDomain = domain
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.split('/')[0];

		// Create request object for bulk traffic estimation
		const requestInfo = new client.DataforseoLabsGoogleBulkTrafficEstimationLiveRequestInfo({
			targets: [cleanDomain],
			location_code: 2840, // United States
			language_code: "en"
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

export async function POST(request: NextRequest) {
	try {
		const { website } = await request.json();

		if (!website) {
			return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
		}

		const domainTraffic = await checkDomainTraffic(website);
		
		const TRAFFIC_THRESHOLD = 250;
		
		if (domainTraffic < TRAFFIC_THRESHOLD) {
			console.log(`Domain traffic ${domainTraffic} is below threshold ${TRAFFIC_THRESHOLD}. Skipping detailed analysis.`);
			
			// Still try to get basic product categories, but signal that other steps should return empty
			const websiteExcerpt = await getWebsiteExcerpt(website);
			const excerptContext = websiteExcerpt 
				? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
				: '\n\n';

			const prompt = `What kinds of products does ${website} sell? 
${excerptContext}
Use general categories, not branded names. For example, converse.com should return:
<out>shoes,hi-tops,casual shoes</out>

Be concise and output to a comma separated list contained within <out> xml tags. List up to 4.`;

			const response = await anthropic.messages.create({
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

			console.log("ANALYZE-WEBSITE OUTPUT (low traffic):", { products, domainTraffic, skipDetailedAnalysis: true });

			return NextResponse.json({ 
				products, 
				domainTraffic, 
				skipDetailedAnalysis: true 
			});
		}

		// Get website excerpt for additional context
		const websiteExcerpt = await getWebsiteExcerpt(website);
		const excerptContext = websiteExcerpt 
			? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
			: '\n\n';

		const prompt = `What kinds of products does ${website} sell? 
${excerptContext}
Use general categories, not branded names. For example, converse.com should return:
<out>shoes,hi-tops,casual shoes</out>

Be concise and output to a comma separated list contained within <out> xml tags. List up to 4.`;

		const response = await anthropic.messages.create({
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

		console.log("response", response);

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

		console.log("ANALYZE-WEBSITE OUTPUT:", { products, domainTraffic });

		return NextResponse.json({ products, domainTraffic });
	} catch (error) {
		console.error("Error analyzing website:", error);
		return NextResponse.json({ error: "Failed to analyze website" }, { status: 500 });
	}
}
