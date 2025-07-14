import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

function cleanDomain(domain: string): string {
	if (!domain) return '';
	
	try {
		// Add protocol if missing for URL constructor
		const urlString = domain.startsWith('http') ? domain : `https://${domain}`;
		const url = new URL(urlString);
		
		// Get hostname and remove www. prefix if present
		let hostname = url.hostname.toLowerCase();
		if (hostname.startsWith('www.')) {
			hostname = hostname.substring(4);
		}
		
		return hostname;
	} catch (error) {
		// Fallback for invalid URLs - just clean up basic cases
		return domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase().trim();
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
		const prompt = `What are the top 4 competitors of a company with website ${website} that sells the following types of products:
${productList}

Please search for current market information to identify real competitors. For each competitor, provide both the company name and their website domain. Format the output as a JSON array where each competitor is an object with "name" and "domain" fields. The domain should be the main website domain (e.g., "example.com") without "https://" or "www.". Contain the JSON within <out> xml tags. List up to 4 competitors.

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
		let competitors: Array<{ name: string; domain: string }> = [];

		if (match) {
			try {
				// Parse as JSON
				const parsedCompetitors = JSON.parse(match[1].trim());
				if (Array.isArray(parsedCompetitors)) {
					competitors = parsedCompetitors
						.filter((c) => c && typeof c === 'object' && c.name && c.domain)
						.map((c) => ({
							name: c.name.trim(),
							domain: cleanDomain(c.domain.trim())
						}))
						.slice(0, 4);
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
