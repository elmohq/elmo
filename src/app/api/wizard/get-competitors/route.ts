import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export async function POST(request: NextRequest) {
	try {
		const { products } = await request.json();

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json(
				{ error: "Products array is required" },
				{ status: 400 }
			);
		}

		const productList = products.join(', ');
		const prompt = `What are competitors of a company that sells the following types of products:
${productList}

Be concise and output to a comma separated list contained within <out> xml tags. List up to 10.`;

		const { text } = await generateText({
			model: anthropic("claude-3-5-sonnet-20241022"),
			prompt,
			maxTokens: 500,
		});

		// Extract content between <out> tags
		const match = text.match(/<out>([\s\S]*?)<\/out>/);
		const competitors = match 
			? match[1].split(',').map(c => c.trim()).filter(c => c.length > 0)
			: [];

		console.log("GET-COMPETITORS OUTPUT:", { competitors });

		return NextResponse.json({ competitors });
	} catch (error) {
		console.error("Error getting competitors:", error);
		return NextResponse.json(
			{ error: "Failed to get competitors" },
			{ status: 500 }
		);
	}
} 