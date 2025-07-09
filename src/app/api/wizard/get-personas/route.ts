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
		const prompt = `For a company that sells the following types of products: ${productList}

Generate strategic categories that would be useful for comparison tracking and market analysis. Think about broad dimensions that matter for business decisions and competitive positioning.

Create up to 3 strategic category groups with up to 5 items each. Each category should represent a key dimension for comparison (like customer type, use case, business model, company size, role, industry vertical, etc.).

The category names should be broad strategic dimensions that make sense for tracking "best [product] for [dimension]" type comparisons.

Examples for context:
- For a headless CMS: "Framework" (next, react, vue, nuxt, gatsby), "User Type" (developers, agencies, marketers, enterprise, startups)
- For ecommerce tools: "Business Model" (dropshipping, wholesale, retail, subscription), "Company Size" (startup, SMB, enterprise, fortune 500)
- For marketing software: "Industry" (fashion, electronics, food, healthcare, saas), "Role" (founder, marketing manager, developer, analyst)

Format your response as:
<group name="Strategic Category Name"><out>item1,item2,item3,item4,item5</out></group>

Focus on dimensions that ecommerce brands would find valuable for competitive analysis and market positioning.`;

		const { text } = await generateText({
			model: anthropic("claude-3-5-sonnet-20241022"),
			prompt,
			maxTokens: 800,
		});

		// Extract groups with names
		const groupMatches = text.match(/<group name="([^"]*?)"><out>([\s\S]*?)<\/out><\/group>/g);
		const personaGroups = groupMatches 
			? groupMatches.map(groupMatch => {
					const fullMatch = groupMatch.match(/<group name="([^"]*?)"><out>([\s\S]*?)<\/out><\/group>/);
					if (fullMatch) {
						const groupName = fullMatch[1];
						const personas = fullMatch[2].split(',').map(p => p.trim()).filter(p => p.length > 0);
						return {
							name: groupName,
							personas: personas
						};
					}
					return null;
				}).filter(group => group !== null)
			: [];

		console.log("GET-PERSONAS OUTPUT:", { personaGroups });

		return NextResponse.json({ personaGroups });
	} catch (error) {
		console.error("Error getting personas:", error);
		return NextResponse.json(
			{ error: "Failed to get personas" },
			{ status: 500 }
		);
	}
} 