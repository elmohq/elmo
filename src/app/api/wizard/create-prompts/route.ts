import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";

export async function POST(request: NextRequest) {
	try {
		const { brandId, reputationTerms, competitors, personaGroups, keywords } = await request.json();

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

		// Add reputation terms (prefixed with "best")
		if (reputationTerms && Array.isArray(reputationTerms)) {
			for (const term of reputationTerms) {
				promptsToCreate.push({
					brandId,
					group: "Brand Reputation",
					value: term,
					reputation: true,
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

		// Add persona groups
		if (personaGroups && Array.isArray(personaGroups)) {
			for (const group of personaGroups) {
				if (group && group.name && Array.isArray(group.personas)) {
					for (const persona of group.personas) {
						promptsToCreate.push({
							brandId,
							group: group.name,
							value: persona,
							reputation: false,
							enabled: true,
						});
					}
				}
			}
		}

		// Add keywords from DataForSEO
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
