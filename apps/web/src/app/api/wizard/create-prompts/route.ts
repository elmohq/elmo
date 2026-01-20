import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { prompts, competitors, brands } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, count } from "drizzle-orm";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { createPromptsData } from "@workspace/lib/wizard-helpers";

// Maximum limits
const MAX_PROMPTS = 150;
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
						return NextResponse.json(
							{
								error: `Persona group "${group.name || "Unnamed"}" has too many members. Maximum allowed: ${MAX_PERSONA_GROUP_MEMBERS}`,
							},
							{ status: 400 },
						);
					}
				}
			}
		}

		// Validate competitors before processing
		if (competitorData && Array.isArray(competitorData) && competitorData.length > MAX_COMPETITORS) {
			return NextResponse.json(
				{
					error: `Too many competitors provided. Maximum allowed: ${MAX_COMPETITORS}`,
				},
				{ status: 400 },
			);
		}

		// Get brand info for computing system tags
		const brandInfo = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
		if (brandInfo.length === 0) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}
		const brand = brandInfo[0];

		// Check current counts for limits
		const [currentPromptCountResult, currentCompetitorCountResult] = await Promise.all([
			db.select({ count: count() }).from(prompts).where(eq(prompts.brandId, brandId)),
			db.select({ count: count() }).from(competitors).where(eq(competitors.brandId, brandId)),
		]);

		const currentPromptCount = currentPromptCountResult[0]?.count || 0;
		const currentCompetitorCount = currentCompetitorCountResult[0]?.count || 0;

		// Use helper function to create prompts data (includes system tags)
		const { prompts: promptsToCreate, competitors: competitorsFromHelper } = createPromptsData({
			brandId,
			brandName: brand.name,
			brandWebsite: brand.website,
			products: products || [],
			competitors: competitorData || [],
			personaGroups: personaGroups || [],
			keywords: keywords || [],
			customPrompts: customPrompts || [],
		});

		// Create competitors to insert into database
		const competitorsToCreate = [];
		for (const competitor of competitorsFromHelper) {
			competitorsToCreate.push({
				brandId,
				name: competitor.name,
				domain: competitor.domain || "",
			});
		}

		// Check limits before creating
		if (currentPromptCount + promptsToCreate.length > MAX_PROMPTS) {
			return NextResponse.json(
				{
					error: `Cannot create prompts. This would exceed the maximum limit of ${MAX_PROMPTS} prompts. Current: ${currentPromptCount}, Attempting to create: ${promptsToCreate.length}`,
				},
				{ status: 400 },
			);
		}

		if (currentCompetitorCount + competitorsToCreate.length > MAX_COMPETITORS) {
			return NextResponse.json(
				{
					error: `Cannot create competitors. This would exceed the maximum limit of ${MAX_COMPETITORS} competitors. Current: ${currentCompetitorCount}, Attempting to create: ${competitorsToCreate.length}`,
				},
				{ status: 400 },
			);
		}

		// Insert prompts and competitors
		let promptsCreated = 0;
		let competitorsCreated = 0;
		let jobSchedulersCreated = 0;
		const createdPromptIds: string[] = [];

		if (promptsToCreate.length > 0) {
			const insertedPrompts = await db.insert(prompts).values(promptsToCreate).returning({ id: prompts.id });
			promptsCreated = insertedPrompts.length;
			createdPromptIds.push(...insertedPrompts.map((p) => p.id));
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
