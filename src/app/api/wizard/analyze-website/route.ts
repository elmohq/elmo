import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
	try {
		const { website } = await request.json();

		if (!website) {
			return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
		}

		const prompt = `What kinds of products does ${website} sell? 

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
		const products = match
			? match[1]
					.split(",")
					.map((p) => p.trim())
					.filter((p) => p.length > 0)
					.slice(0, 4)
			: [];

		console.log("ANALYZE-WEBSITE OUTPUT:", { products });

		return NextResponse.json({ products });
	} catch (error) {
		console.error("Error analyzing website:", error);
		return NextResponse.json({ error: "Failed to analyze website" }, { status: 500 });
	}
}
