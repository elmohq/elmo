import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { prompts, brands } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createPromptJobScheduler } from "@/lib/job-scheduler";
import { sanitizeUserTags, computeSystemTags } from "@workspace/lib/tag-utils";

type Params = {
	id: string;
};

// GET all prompts for a brand
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Fetch prompts for this brand
		const brandPrompts = await db
			.select()
			.from(prompts)
			.where(eq(prompts.brandId, brandId))
			.orderBy(prompts.createdAt);

		return NextResponse.json(brandPrompts);
	} catch (error) {
		console.error("Error fetching prompts:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

// POST - Create a new prompt
export async function POST(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;
		const body = await request.json();

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		const { value, enabled = true, tags } = body;

		if (!value || typeof value !== "string") {
			return NextResponse.json({ error: "Prompt value is required" }, { status: 400 });
		}

	// Get brand info for computing system tags
	const brandInfo = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (brandInfo.length === 0) {
		return NextResponse.json({ error: "Brand not found" }, { status: 404 });
	}
	const brand = brandInfo[0];

		// Compute tags
		const userTags = tags ? sanitizeUserTags(tags) : [];
		const systemTags = computeSystemTags(value.trim(), brand.name, brand.website);

		// Create new prompt
		const newPrompt = await db
			.insert(prompts)
			.values({
				brandId,
				value: value.trim(),
				enabled,
				tags: userTags,
				systemTags,
			})
			.returning();

		// Create job scheduler if prompt is enabled
		let jobSchedulerCreated = false;
		if (enabled && newPrompt[0]) {
			jobSchedulerCreated = await createPromptJobScheduler(newPrompt[0].id);
			if (!jobSchedulerCreated) {
				console.warn(`Failed to create job scheduler for prompt ${newPrompt[0].id}`);
			}
		}

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/visibility`);
		revalidatePath(`/app/${brandId}/reputation`);

		return NextResponse.json(
			{
				...newPrompt[0],
				jobSchedulerCreated,
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error("Error creating prompt:", error);
		return NextResponse.json({ error: "Failed to create prompt" }, { status: 500 });
	}
}
