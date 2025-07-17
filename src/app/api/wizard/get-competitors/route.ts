import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getWebsiteExcerpt } from "@/lib/website-excerpt";

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

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
		// todo: actually error here
		// Fallback for invalid URLs - just clean up basic cases
		return domain
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.split("/")[0]
			.toLowerCase()
			.trim();
	}
}

export async function POST(request: NextRequest) {
	try {
		const { products, website } = await request.json();

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json({ error: "Products array is required" }, { status: 400 });
		}

		if (!website || typeof website !== "string") {
			return NextResponse.json({ error: "Website is required" }, { status: 400 });
		}

		const productList = products.join(", ");

		// Get website excerpt for additional context
		const websiteExcerpt = await getWebsiteExcerpt(website);
		const excerptContext = websiteExcerpt
			? `\n\nHere is an excerpt of the first 200 lines of text from ${website}:\n\n${websiteExcerpt}\n\n`
			: "\n\n";

		const prompt = `What are up to 3 direct to consumer competitors of ${website} (which sells ${productList}). 
		${excerptContext}
The competitors should sell similar products in a similar way to a similar audience.

Please search for current market information to identify direct competitors. 
For each competitor, provide both the company name and their website domain. 
Format the output as a JSON array where each competitor is an object with "name" and "domain" fields. 
The domain should be the main website domain (e.g., "example.com") without "https://" or "www.". 
Contain the JSON within <out> xml tags. List up to 3 competitors.

Do not include competitors that sell similar types of products but would not be considered as direct competitors to ${website}.
If ${website} is very small, it may not have any direct competitors. In this case, return an empty array.

Example format:
<out>
[
  {"name": "Company Name", "domain": "example.com"},
  {"name": "Another Company", "domain": "another.com"}
]
</out>`;

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
					max_uses: 2,
				},
			],
		});

		// Extract and log search queries used
		const searchQueries = response.content
			.filter((block) => block.type === "server_tool_use" && block.name === "web_search")
			.map((block) => (block as any).input?.query)
			.filter(Boolean);

		if (searchQueries.length > 0) {
			console.log("Search queries used:", searchQueries);
		}

		// Extract text content from all text blocks in response
		const textBlocks = response.content.filter((block) => block.type === "text");
		const allTextContent = textBlocks.map((block) => block.text).join("\n");

		// Extract content between <out> tags
		const match = allTextContent.match(/<out>([\s\S]*?)<\/out>/);
		let competitors: Array<{ name: string; domain: string }> = [];

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
						.slice(0, 3);
				}
			} catch (parseError) {
				// Log error and return empty list
				console.error("Failed to parse competitors JSON:", parseError);
				console.error("Raw content:", match[1]);
				competitors = [];
			}
		}

		console.log("GET-COMPETITORS OUTPUT:", { competitors });

		return NextResponse.json({ competitors });
	} catch (error) {
		console.error("Error getting competitors:", error);
		return NextResponse.json({ error: "Failed to get competitors" }, { status: 500 });
	}
}
