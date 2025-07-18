import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createPromptJobScheduler } from "@/lib/job-scheduler";

type Params = {
	id: string;
};

// Maximum limits
const MAX_PROMPTS = 150;

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
			.orderBy(prompts.groupCategory, prompts.createdAt);

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

		const { value, groupCategory, groupPrefix, enabled = true } = body;

		if (!value || typeof value !== "string") {
			return NextResponse.json({ error: "Prompt value is required" }, { status: 400 });
		}

		// Check current prompt count for this brand
		const currentCountResult = await db.select({ count: count() }).from(prompts).where(eq(prompts.brandId, brandId));

		const currentCount = currentCountResult[0]?.count || 0;

		if (currentCount >= MAX_PROMPTS) {
			return NextResponse.json(
				{
					error: `Maximum limit reached. You can only have ${MAX_PROMPTS} prompts.`,
				},
				{ status: 400 },
			);
		}

		// Create new prompt
		const newPrompt = await db
			.insert(prompts)
			.values({
				brandId,
				value: value.trim(),
				groupCategory: groupCategory || null,
				groupPrefix: groupPrefix || null,
				enabled,
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
		revalidatePath(`/app/${brandId}/prompts`);
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
