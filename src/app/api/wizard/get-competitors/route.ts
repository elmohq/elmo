import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

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

Please search for current market information to identify real competitors. Be concise and output to a comma separated list contained within <out> xml tags. List up to 4.`;

		const response = await anthropic.messages.create({
			model: "claude-sonnet-4-20250514",
			max_tokens: 1000,
			messages: [
				{
					role: "user",
					content: prompt,
				}
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
		const competitors = match
			? match[1]
					.split(",")
					.map((c) => c.trim())
					.filter((c) => c.length > 0)
					.slice(0, 4)
			: [];

		console.log("GET-COMPETITORS OUTPUT:", { competitors });

		return NextResponse.json({ competitors });
	} catch (error) {
		console.error("Error getting competitors:", error);
		return NextResponse.json({ error: "Failed to get competitors" }, { status: 500 });
	}
}
