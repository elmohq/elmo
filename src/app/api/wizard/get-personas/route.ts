import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import * as client from 'dataforseo-client'
import { dfsSerpApi } from "@/lib/dataforseo";

export async function POST(request: NextRequest) {
	try {
		const { products } = await request.json();

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json(
				{ error: "Products array is required" },
				{ status: 400 }
			);
		}

		// Take the first 2-3 product categories for autocomplete queries
		const topProducts = products.slice(0, 3);
		const allSuggestions: string[] = [];

		// Get autocomplete suggestions for each product
		for (const product of topProducts) {
			try {
				const task = new client.SerpGoogleAutocompleteTaskPostRequestInfo();
				task.keyword = `best ${product} for`;
				task.location_code = 2840;
				task.language_code = "en";

				const response = await dfsSerpApi.googleAutocompleteTaskPost([task]);

				if (response && response.tasks && response.tasks[0] && response.tasks[0].result) {
					const items = response.tasks[0].result[0]?.items || [];
					
					// Extract suggestions and get the suffixes after "for"
					items.forEach((item: any) => {
						if (item.suggestion && item.suggestion.includes(' for ')) {
							const parts = item.suggestion.split(' for ');
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

		// Remove duplicates and empty strings
		const uniqueSuffixes = [...new Set(allSuggestions.filter(s => s && s.length > 0))];

		console.log("Unique autocomplete suffixes:", uniqueSuffixes);

		// Use Claude to group the suffixes into strategic categories
		const suffixList = uniqueSuffixes.slice(0, 20).join(', '); // Limit to first 20 to avoid token limits
		const prompt = `You have collected Google autocomplete suggestions for "best [product] for" queries. Here are the unique suffixes (the parts that come after "for"):

${suffixList}

Your task is to group these suffixes into 1-3 strategic category groups that would be useful for comparison tracking and market analysis. Each category should represent a key dimension for business decisions and competitive positioning.

Think about broad dimensions that matter for ecommerce brands, such as:
- Customer type (startups, enterprises, small businesses, etc.)
- Use case or purpose (marketing, sales, analytics, etc.) 
- Industry or vertical (healthcare, fashion, technology, etc.)
- Business model (B2B, B2C, subscription, etc.)
- Company size or stage (startup, SMB, enterprise, etc.)

Create up to 3 strategic category groups with up to 5 items each. Focus on the most common and strategically valuable groupings from the suffixes provided.

Format your response as:
<group name="Strategic Category Name"><out>item1,item2,item3,item4,item5</out></group>

Only include suffixes that clearly fit into strategic categories. Ignore overly specific or unclear terms.`;

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

		// If Claude didn't return proper groups, create a fallback
		if (personaGroups.length === 0) {
			console.warn("Claude didn't return proper groups, creating fallback from suffixes");
			const fallbackGroup = {
				name: "Target Segments",
				personas: uniqueSuffixes.slice(0, 5) // Take first 5 unique suffixes
			};
			personaGroups.push(fallbackGroup);
		}

		console.log("GET-PERSONAS OUTPUT (DATAFORSEO + CLAUDE):", { personaGroups });

		return NextResponse.json({ personaGroups });
	} catch (error) {
		console.error("Error getting personas:", error);
		return NextResponse.json(
			{ error: "Failed to get personas" },
			{ status: 500 }
		);
	}
} 