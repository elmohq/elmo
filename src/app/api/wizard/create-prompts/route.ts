import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, count } from "drizzle-orm";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

// Maximum limits
const MAX_PROMPTS = 150;
const MAX_COMPETITORS = 3;
const MAX_PERSONA_GROUP_MEMBERS = 4;

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

		// Validate persona groups before processing
		if (personaGroups && Array.isArray(personaGroups)) {
			for (const group of personaGroups) {
				if (group && group.personas && Array.isArray(group.personas)) {
					if (group.personas.length > MAX_PERSONA_GROUP_MEMBERS) {
						return NextResponse.json({ 
							error: `Persona group "${group.name || 'Unnamed'}" has too many members. Maximum allowed: ${MAX_PERSONA_GROUP_MEMBERS}` 
						}, { status: 400 });
					}
				}
			}
		}

		// Validate competitors before processing
		if (competitorData && Array.isArray(competitorData) && competitorData.length > MAX_COMPETITORS) {
			return NextResponse.json({ 
				error: `Too many competitors provided. Maximum allowed: ${MAX_COMPETITORS}` 
			}, { status: 400 });
		}

		// Check current counts for limits
		const [currentPromptCountResult, currentCompetitorCountResult] = await Promise.all([
			db.select({ count: count() })
				.from(prompts)
				.where(eq(prompts.brandId, brandId)),
			db.select({ count: count() })
				.from(competitors)
				.where(eq(competitors.brandId, brandId))
		]);

		const currentPromptCount = currentPromptCountResult[0]?.count || 0;
		const currentCompetitorCount = currentCompetitorCountResult[0]?.count || 0;

		const promptsToCreate = [];
		const competitorsToCreate = [];

		// Add product categories as basic prompts (with "best " prefix)
		if (products && Array.isArray(products)) {
			for (const product of products) {
				promptsToCreate.push({
					brandId,
					groupCategory: null,
					groupPrefix: null,
					value: `best ${product}`,
					enabled: true,
				});
			}
		}

		// Add product categories + personas as grouped prompts (cross-product)
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
								enabled: true,
							});
						}
					}
				}
			}
		}

		// Add custom prompts
		if (customPrompts && Array.isArray(customPrompts)) {
			for (const prompt of customPrompts) {
				promptsToCreate.push({
					brandId,
					groupCategory: null,
					groupPrefix: null,
					value: prompt,
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

		// Add keywords from DataForSEO (no group)
		if (keywords && Array.isArray(keywords)) {
			for (const keywordData of keywords) {
				promptsToCreate.push({
					brandId,
					groupCategory: null,
					groupPrefix: null,
					value: keywordData.keyword,
					enabled: true,
				});
			}
		}

		// Check limits before creating
		if (currentPromptCount + promptsToCreate.length > MAX_PROMPTS) {
			return NextResponse.json({ 
				error: `Cannot create prompts. This would exceed the maximum limit of ${MAX_PROMPTS} prompts. Current: ${currentPromptCount}, Attempting to create: ${promptsToCreate.length}` 
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
		let jobSchedulersCreated = 0;
		const createdPromptIds: string[] = [];

		if (promptsToCreate.length > 0) {
			const insertedPrompts = await db.insert(prompts).values(promptsToCreate).returning({ id: prompts.id });
			promptsCreated = insertedPrompts.length;
			createdPromptIds.push(...insertedPrompts.map(p => p.id));
		}

		if (competitorsToCreate.length > 0) {
			await db.insert(competitors).values(competitorsToCreate);
			competitorsCreated = competitorsToCreate.length;
		}

		// Create job schedulers for enabled prompts
		if (createdPromptIds.length > 0) {
			const jobSchedulerResults = await createMultiplePromptJobSchedulers(createdPromptIds);
			jobSchedulersCreated = jobSchedulerResults.filter(Boolean).length;
			
			// Log any failures
			jobSchedulerResults.forEach((success, index) => {
				if (!success) {
					console.warn(`Failed to create job scheduler for prompt ${createdPromptIds[index]}`);
				}
			});
		}

		// Mark brand as onboarded after successful prompt creation
		await db.update(brands).set({ onboarded: true }).where(eq(brands.id, brandId));

		return NextResponse.json({
			success: true,
			promptsCreated,
			competitorsCreated,
			jobSchedulersCreated,
		});
	} catch (error) {
		console.error("Error creating prompts:", error);
		return NextResponse.json({ error: "Failed to create prompts" }, { status: 500 });
	}
}
