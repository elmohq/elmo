import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";

export async function POST(request: NextRequest) {
	try {
		const { brandId, competitors, personaGroups, keywords, customPrompts, products } = await request.json();

		if (!brandId) {
			return NextResponse.json({ error: "Brand ID is required" }, { status: 400 });
		}

		// Verify user has access to this brand
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		const promptsToCreate = [];

		// Add product categories as non-reputation prompts (with "best " prefix)
		if (products && Array.isArray(products)) {
			for (const product of products) {
				promptsToCreate.push({
					brandId,
					group: "Product Categories",
					value: `best ${product}`,
					reputation: false,
					enabled: true,
				});
			}
		}

		// Add product categories + personas as reputation prompts (cross-product)
		if (products && Array.isArray(products) && personaGroups && Array.isArray(personaGroups)) {
			for (const product of products) {
				for (const group of personaGroups) {
					if (group && group.name && Array.isArray(group.personas)) {
						for (const persona of group.personas) {
							promptsToCreate.push({
								brandId,
								group: group.name,
								value: `best ${product} for ${persona}`,
								reputation: true,
								enabled: true,
							});
						}
					}
				}
			}
		}

		// Add custom prompts (with reputation set to false)
		if (customPrompts && Array.isArray(customPrompts)) {
			for (const prompt of customPrompts) {
				promptsToCreate.push({
					brandId,
					group: "Custom Prompts",
					value: prompt,
					reputation: false,
					enabled: true,
				});
			}
		}

		// Add competitors
		if (competitors && Array.isArray(competitors)) {
			for (const competitor of competitors) {
				promptsToCreate.push({
					brandId,
					group: "Competitors",
					value: competitor,
					reputation: false,
					enabled: true,
				});
			}
		}

		// Add keywords from DataForSEO (no group, non-reputation)
		if (keywords && Array.isArray(keywords)) {
			for (const keywordData of keywords) {
				promptsToCreate.push({
					brandId,
					group: "SEO Keywords",
					value: keywordData.keyword,
					reputation: false,
					enabled: true,
				});
			}
		}

		// Insert all prompts
		if (promptsToCreate.length > 0) {
			await db.insert(prompts).values(promptsToCreate);
		}

		return NextResponse.json({
			success: true,
			promptsCreated: promptsToCreate.length,
		});
	} catch (error) {
		console.error("Error creating prompts:", error);
		return NextResponse.json({ error: "Failed to create prompts" }, { status: 500 });
	}
}
