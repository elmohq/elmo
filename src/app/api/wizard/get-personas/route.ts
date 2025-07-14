import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import * as client from "dataforseo-client";
import { dfsSerpApi } from "@/lib/dataforseo";

export async function POST(request: NextRequest) {
	try {
		const { products, website } = await request.json();

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json({ error: "Products array is required" }, { status: 400 });
		}

		if (!website || typeof website !== "string") {
			return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
		}

		// Take the first 2-3 product categories for autocomplete queries
		const topProducts = products.slice(0, 5);
		const allSuggestions: string[] = [];

		// Get autocomplete suggestions for each product
		for (const product of topProducts) {
			try {
				const task = new client.SerpGoogleAutocompleteLiveAdvancedRequestInfo();
				task.keyword = `best ${product}`;
				task.location_code = 2840;
				task.language_code = "en";

				console.log("task.keyword", task.keyword);

				const response = await dfsSerpApi.googleAutocompleteLiveAdvanced([task]);

				console.log("response", response);

				if (response && response.tasks && response.tasks[0] && response.tasks[0].result) {
					const items = response.tasks[0].result[0]?.items || [];

					// Extract suggestions and get the suffixes after "for"
					items.forEach((item: any) => {
						if (item.suggestion && item.suggestion.includes(" for ")) {
							const parts = item.suggestion.split(" for ");
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

		// Count occurrences of each suffix
		const suffixCounts = new Map<string, number>();
		allSuggestions
			.filter((s) => s && s.length > 0)
			.forEach((suffix) => {
				suffixCounts.set(suffix, (suffixCounts.get(suffix) || 0) + 1);
			});

		// Sort by count (descending) and get top 20
		const sortedSuffixes = Array.from(suffixCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([suffix, count]) => suffix);

		console.log(
			"Top autocomplete suffixes by frequency:",
			Array.from(suffixCounts.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 20)
				.map(([suffix, count]) => `${suffix} (${count})`),
		);

		// Use Claude to group the suffixes into strategic categories
		const suffixList = sortedSuffixes.join(", "); // Top 20 by frequency
		const prompt = `You have collected Google autocomplete suggestions for "best [product] for" queries. Here are the unique suffixes (the parts that come after "for"):

${suffixList}

Your task is to group these suffixes into 2-3 strategic category groups that would be useful for comparison tracking and market analysis. Each category should represent a key dimension for business decisions and competitive positioning.

Think about broad dimensions that matter for ecommerce brands, such as:
- Customers (startups, enterprises, small businesses, etc.)
- Purpose (marketing, sales, analytics, etc.) 
- Industries (healthcare, fashion, technology, etc.)
- Models (B2B, B2C, subscription, etc.)
- Sizes (startup, SMB, enterprise, etc.)

Create up to 3 strategic category groups with up to 4 items each. Focus on the most common and strategically valuable groupings from the suffixes provided.

The should be a good mix of personas that are relevant to the products for sale (which are ${products.join(", ")}) and the website ${website}.

IMPORTANT: Use only ONE NON-PLURAL WORD for each category group name. Examples: "Demographic", "Use", "Customer", "Industry", "Purpose", "Segment", "Market", "Type", "Role", "Stage".

If you are not confident a group is relevant, do not include it.
If you are not confident an item in a group is relevant, do not include it.
If the group or item does not make sense for all of the different products for sale, do not include it.
If you are not confident a group or item is relevant to the website ${website}, regardless of the products, do not include it.
If the brand is small and the product categories are very broad, do not include any groups.
If the groups are not specific to the brand ${website}, do not include them.

Format your response as:
<group name="Category1">item1,item2,item3,item4</group>
<group name="Category2">item1,item2,item3,item4</group>
<group name="Category3">item1,item2,item3,item4</group>

Only include suffixes that clearly fit into strategic categories. Ignore overly specific or unclear terms.`;

		const { text } = await generateText({
			model: anthropic("claude-3-5-sonnet-20241022"),
			prompt,
			maxTokens: 800,
		});

		console.log("text", text);

		// Extract groups with names
		const groupMatches = text.match(/<group name="([^"]*?)">([\s\S]*?)<\/group>/g);
		const personaGroups = groupMatches
			? groupMatches
					.map((groupMatch) => {
						const fullMatch = groupMatch.match(/<group name="([^"]*?)">([\s\S]*?)<\/group>/);
						if (fullMatch) {
							const groupName = fullMatch[1];
							const personas = fullMatch[2]
								.split(",")
								.map((p) => p.trim())
								.filter((p) => p.length > 0)
								.slice(0, 4);
							return {
								name: groupName,
								personas: personas,
							};
						}
						return null;
					})
					.filter((group) => group !== null)
			: [];

		console.log("GET-PERSONAS OUTPUT (DATAFORSEO + CLAUDE):", { personaGroups });

		return NextResponse.json({ personaGroups });
	} catch (error) {
		console.error("Error getting personas:", error);
		return NextResponse.json({ error: "Failed to get personas" }, { status: 500 });
	}
}
