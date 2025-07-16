import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, count } from "drizzle-orm";

// Maximum limits
const MAX_REPUTATION_PROMPTS = 100;
const MAX_NON_REPUTATION_PROMPTS = 50;
const MAX_COMPETITORS = 5;

export async function POST(request: NextRequest) {
	try {
		const {
			brandId,
			competitors: competitorData,
			personaGroups,
			keywords,
			customPrompts,
			products,
		} = await request.json();

		if (!brandId) {
			return NextResponse.json({ error: "Brand ID is required" }, { status: 400 });
		}

		// Verify user has access to this brand
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Check current counts for limits
		const [currentReputationCountResult, currentNonReputationCountResult, currentCompetitorCountResult] = await Promise.all([
			db.select({ count: count() })
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), eq(prompts.reputation, true))),
			db.select({ count: count() })
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), eq(prompts.reputation, false))),
			db.select({ count: count() })
				.from(competitors)
				.where(eq(competitors.brandId, brandId))
		]);

		const currentReputationCount = currentReputationCountResult[0]?.count || 0;
		const currentNonReputationCount = currentNonReputationCountResult[0]?.count || 0;
		const currentCompetitorCount = currentCompetitorCountResult[0]?.count || 0;

		const promptsToCreate = [];
		const competitorsToCreate = [];

		// Add product categories as reputation prompts (with "best " prefix)
		if (products && Array.isArray(products)) {
			for (const product of products) {
				promptsToCreate.push({
					brandId,
					groupCategory: null,
					groupPrefix: null,
					value: `best ${product}`,
					reputation: true,
					enabled: true,
				});
			}
		}

		// Add product categories as non-reputation prompts (with "best " prefix)
		if (products && Array.isArray(products)) {
			for (const product of products) {
				promptsToCreate.push({
					brandId,
					groupCategory: null,
					groupPrefix: null,
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
								groupCategory: group.name,
								groupPrefix: `best ${product} for `,
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
					groupCategory: null,
					groupPrefix: null,
					value: prompt,
					reputation: false,
					enabled: true,
				});
			}
		}

		// Add competitors to competitors table
		if (competitorData && Array.isArray(competitorData)) {
			for (const competitor of competitorData) {
				// Handle both string format (legacy) and object format (new)
				if (typeof competitor === "string") {
					competitorsToCreate.push({
						brandId,
						name: competitor,
						domain: "", // Empty domain for legacy string format
					});
				} else if (competitor && typeof competitor === "object" && competitor.name) {
					competitorsToCreate.push({
						brandId,
						name: competitor.name,
						domain: competitor.domain || "",
					});
				}
			}
		}

		// Add keywords from DataForSEO (no group, non-reputation)
		if (keywords && Array.isArray(keywords)) {
			for (const keywordData of keywords) {
				promptsToCreate.push({
					brandId,
					groupCategory: null,
					groupPrefix: null,
					value: keywordData.keyword,
					reputation: false,
					enabled: true,
				});
			}
		}

		// Count reputation and non-reputation prompts to be created
		const reputationPromptsToCreate = promptsToCreate.filter(p => p.reputation).length;
		const nonReputationPromptsToCreate = promptsToCreate.filter(p => !p.reputation).length;

		// Check limits before creating
		if (currentReputationCount + reputationPromptsToCreate > MAX_REPUTATION_PROMPTS) {
			return NextResponse.json({ 
				error: `Cannot create prompts. This would exceed the maximum limit of ${MAX_REPUTATION_PROMPTS} reputation prompts. Current: ${currentReputationCount}, Attempting to create: ${reputationPromptsToCreate}` 
			}, { status: 400 });
		}

		if (currentNonReputationCount + nonReputationPromptsToCreate > MAX_NON_REPUTATION_PROMPTS) {
			return NextResponse.json({ 
				error: `Cannot create prompts. This would exceed the maximum limit of ${MAX_NON_REPUTATION_PROMPTS} non-reputation prompts. Current: ${currentNonReputationCount}, Attempting to create: ${nonReputationPromptsToCreate}` 
			}, { status: 400 });
		}

		if (currentCompetitorCount + competitorsToCreate.length > MAX_COMPETITORS) {
			return NextResponse.json({ 
				error: `Cannot create competitors. This would exceed the maximum limit of ${MAX_COMPETITORS} competitors. Current: ${currentCompetitorCount}, Attempting to create: ${competitorsToCreate.length}` 
			}, { status: 400 });
		}

		// Insert prompts and competitors
		let promptsCreated = 0;
		let competitorsCreated = 0;

		if (promptsToCreate.length > 0) {
			await db.insert(prompts).values(promptsToCreate);
			promptsCreated = promptsToCreate.length;
		}

		if (competitorsToCreate.length > 0) {
			await db.insert(competitors).values(competitorsToCreate);
			competitorsCreated = competitorsToCreate.length;
		}

		// Mark brand as onboarded after successful prompt creation
		await db.update(brands).set({ onboarded: true }).where(eq(brands.id, brandId));

		return NextResponse.json({
			success: true,
			promptsCreated,
			competitorsCreated,
		});
	} catch (error) {
		console.error("Error creating prompts:", error);
		return NextResponse.json({ error: "Failed to create prompts" }, { status: 500 });
	}
}
