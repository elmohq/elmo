import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createPromptJobScheduler, removePromptJobScheduler } from "@/lib/job-scheduler";
import { sanitizeUserTags, computeSystemTags } from "@/lib/tag-utils";

type Params = {
	id: string;
	promptId: string;
};

// GET a specific prompt
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, promptId } = await params;

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Fetch the specific prompt
		const prompt = await db
			.select()
			.from(prompts)
			.where(and(eq(prompts.id, promptId), eq(prompts.brandId, brandId)))
			.limit(1);

		if (prompt.length === 0) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		return NextResponse.json(prompt[0]);
	} catch (error) {
		console.error("Error fetching prompt:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

// PUT - Update a specific prompt
export async function PUT(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, promptId } = await params;
		const body = await request.json();

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Get brand info for computing system tags
		const brandInfo = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
		if (brandInfo.length === 0) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}
		const brand = brandInfo[0];

		// Check if prompt exists and belongs to the brand
		const existingPrompt = await db
			.select()
			.from(prompts)
			.where(and(eq(prompts.id, promptId), eq(prompts.brandId, brandId)))
			.limit(1);

		if (existingPrompt.length === 0) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		const { value, groupCategory, groupPrefix, enabled, tags } = body;

		// Build update object with only provided fields
		const updateData: Partial<typeof prompts.$inferInsert> = {};

		if (value !== undefined) {
			if (typeof value !== "string" || !value.trim()) {
				return NextResponse.json({ error: "Prompt value must be a non-empty string" }, { status: 400 });
			}
			updateData.value = value.trim();
		}

		if (groupCategory !== undefined) {
			updateData.groupCategory = groupCategory || null;
		}

		if (groupPrefix !== undefined) {
			updateData.groupPrefix = groupPrefix || null;
		}

		if (enabled !== undefined) {
			if (typeof enabled !== "boolean") {
				return NextResponse.json({ error: "Enabled must be a boolean" }, { status: 400 });
			}
			updateData.enabled = enabled;
		}

		// Handle user tags if provided
		if (tags !== undefined) {
			if (!Array.isArray(tags)) {
				return NextResponse.json({ error: "Tags must be an array of strings" }, { status: 400 });
			}
			updateData.tags = sanitizeUserTags(tags);
		}

		// Update system tags if value changed
		if (value !== undefined) {
			updateData.systemTags = computeSystemTags(value.trim(), brand.name, brand.website);
		}

		// Update the prompt
		const updatedPrompt = await db
			.update(prompts)
			.set(updateData)
			.where(and(eq(prompts.id, promptId), eq(prompts.brandId, brandId)))
			.returning();

		// Handle job scheduler changes if enabled status was updated
		let jobSchedulerResult: { action: string; success: boolean } | null = null;
		if (enabled !== undefined && updatedPrompt[0]) {
			const wasEnabled = existingPrompt[0].enabled;
			const isNowEnabled = enabled;

			if (!wasEnabled && isNowEnabled) {
				// Prompt was disabled, now enabled - create job scheduler
				const success = await createPromptJobScheduler(promptId);
				jobSchedulerResult = { action: "created", success };
				if (!success) {
					console.warn(`Failed to create job scheduler for prompt ${promptId}`);
				}
			} else if (wasEnabled && !isNowEnabled) {
				// Prompt was enabled, now disabled - remove job scheduler
				const success = await removePromptJobScheduler(promptId);
				jobSchedulerResult = { action: "removed", success };
				if (!success) {
					console.warn(`Failed to remove job scheduler for prompt ${promptId}`);
				}
			}
		}

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/prompts`);
		revalidatePath(`/app/${brandId}/reputation`);

		return NextResponse.json({
			...updatedPrompt[0],
			...(jobSchedulerResult ? { jobScheduler: jobSchedulerResult } : {}),
		});
	} catch (error) {
		console.error("Error updating prompt:", error);
		return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
	}
}

// DELETE a specific prompt
export async function DELETE(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, promptId } = await params;

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Check if prompt exists and belongs to the brand
		const existingPrompt = await db
			.select()
			.from(prompts)
			.where(and(eq(prompts.id, promptId), eq(prompts.brandId, brandId)))
			.limit(1);

		if (existingPrompt.length === 0) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		// Remove job scheduler before disabling the prompt
		const jobSchedulerRemoved = await removePromptJobScheduler(promptId);
		if (!jobSchedulerRemoved) {
			console.warn(`Failed to remove job scheduler for prompt ${promptId} during soft deletion`);
		}

		// Soft delete the prompt by disabling it
		const updatedPrompt = await db
			.update(prompts)
			.set({ enabled: false })
			.where(and(eq(prompts.id, promptId), eq(prompts.brandId, brandId)))
			.returning();

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/prompts`);
		revalidatePath(`/app/${brandId}/reputation`);

		return NextResponse.json({
			message: "Prompt disabled successfully",
			jobSchedulerRemoved,
			prompt: updatedPrompt[0],
		});
	} catch (error) {
		console.error("Error deleting prompt:", error);
		return NextResponse.json({ error: "Failed to delete prompt" }, { status: 500 });
	}
}
