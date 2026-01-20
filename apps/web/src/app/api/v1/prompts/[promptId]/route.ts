import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { prompts, promptRuns, brands } from "@workspace/lib/db/schema";
import { removePromptJobScheduler, createPromptJobScheduler } from "@/lib/job-scheduler";
import { eq } from "drizzle-orm";
import { sanitizeUserTags, computeSystemTags } from "@workspace/lib/tag-utils";

type Params = {
	promptId: string;
};

// Validate UUID format
function isValidUUID(id: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(id);
}

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { promptId } = await params;

		if (!isValidUUID(promptId)) {
			return NextResponse.json(
				{
					error: "Validation Error",
					message: "Invalid prompt ID format",
				},
				{ status: 400 },
			);
		}

		const prompt = await db
			.select({
				id: prompts.id,
				brandId: prompts.brandId,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				value: prompts.value,
				enabled: prompts.enabled,
				tags: prompts.tags,
				systemTags: prompts.systemTags,
				createdAt: prompts.createdAt,
				updatedAt: prompts.updatedAt,
			})
			.from(prompts)
			.where(eq(prompts.id, promptId))
			.limit(1);

		if (prompt.length === 0) {
			return NextResponse.json(
				{
					error: "Not Found",
					message: `Prompt with ID '${promptId}' not found`,
				},
				{ status: 404 },
			);
		}

		return NextResponse.json(prompt[0]);
	} catch (error) {
		console.error("Error fetching prompt:", error);
		return NextResponse.json({ error: "Internal Server Error", message: "Failed to fetch prompt" }, { status: 500 });
	}
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { promptId } = await params;

		if (!isValidUUID(promptId)) {
			return NextResponse.json(
				{
					error: "Validation Error",
					message: "Invalid prompt ID format",
				},
				{ status: 400 },
			);
		}

		// Check if prompt exists
		const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);

		if (existingPrompt.length === 0) {
			return NextResponse.json(
				{
					error: "Not Found",
					message: `Prompt with ID '${promptId}' not found`,
				},
				{ status: 404 },
			);
		}

		// Get brand info for computing system tags
		const brandInfo = await db.select().from(brands).where(eq(brands.id, existingPrompt[0].brandId)).limit(1);
		if (brandInfo.length === 0) {
			return NextResponse.json(
				{ error: "Internal Server Error", message: "Brand not found for prompt" },
				{ status: 500 },
			);
		}
		const brand = brandInfo[0];

		const body = await request.json();
		const { value, groupCategory, groupPrefix, enabled, tags } = body;

		// Build update object with only provided fields
		const updateData: Partial<typeof prompts.$inferInsert> = {};

		if (value !== undefined) {
			if (typeof value !== "string" || !value.trim()) {
				return NextResponse.json(
					{ error: "Validation Error", message: "value must be a non-empty string" },
					{ status: 400 },
				);
			}
			updateData.value = value.trim();
		}

		if (groupCategory !== undefined) {
			updateData.groupCategory = groupCategory ? groupCategory.trim() : null;
		}

		if (groupPrefix !== undefined) {
			updateData.groupPrefix = groupPrefix ? groupPrefix.trim() : null;
		}

		if (enabled !== undefined) {
			if (typeof enabled !== "boolean") {
				return NextResponse.json(
					{ error: "Validation Error", message: "enabled must be a boolean" },
					{ status: 400 },
				);
			}
			updateData.enabled = enabled;
		}

		// Handle user tags if provided
		if (tags !== undefined) {
			if (!Array.isArray(tags)) {
				return NextResponse.json(
					{ error: "Validation Error", message: "tags must be an array of strings" },
					{ status: 400 },
				);
			}
			updateData.tags = sanitizeUserTags(tags);
		}

		// Update system tags if value changed
		if (value !== undefined) {
			updateData.systemTags = computeSystemTags(value.trim(), brand.name, brand.website);
		}

		// Update the prompt
		const [updatedPrompt] = await db
			.update(prompts)
			.set(updateData)
			.where(eq(prompts.id, promptId))
			.returning();

		// Handle job scheduler changes if enabled status was updated
		if (enabled !== undefined && updatedPrompt) {
			const wasEnabled = existingPrompt[0].enabled;
			const isNowEnabled = enabled;

			if (!wasEnabled && isNowEnabled) {
				// Prompt was disabled, now enabled - create job scheduler
				const success = await createPromptJobScheduler(promptId);
				if (!success) {
					console.warn(`Failed to create job scheduler for prompt ${promptId}`);
				}
			} else if (wasEnabled && !isNowEnabled) {
				// Prompt was enabled, now disabled - remove job scheduler
				const success = await removePromptJobScheduler(promptId);
				if (!success) {
					console.warn(`Failed to remove job scheduler for prompt ${promptId}`);
				}
			}
		}

		return NextResponse.json(updatedPrompt);
	} catch (error) {
		console.error("Error updating prompt:", error);
		return NextResponse.json({ error: "Internal Server Error", message: "Failed to update prompt" }, { status: 500 });
	}
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { promptId } = await params;

		if (!isValidUUID(promptId)) {
			return NextResponse.json(
				{
					error: "Validation Error",
					message: "Invalid prompt ID format",
				},
				{ status: 400 },
			);
		}

		// Check if prompt exists
		const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);

		if (existingPrompt.length === 0) {
			return NextResponse.json(
				{
					error: "Not Found",
					message: `Prompt with ID '${promptId}' not found`,
				},
				{ status: 404 },
			);
		}

		// Remove job scheduler before deletion
		const jobSchedulerRemoved = await removePromptJobScheduler(promptId);
		if (!jobSchedulerRemoved) {
			console.warn(`Failed to remove job scheduler for prompt ${promptId} during deletion`);
		}

		// Perform deletion operations in a transaction
		const result = await db.transaction(async (tx) => {
			// Delete associated prompt runs first (cascading delete)
			const deletedRuns = await tx
				.delete(promptRuns)
				.where(eq(promptRuns.promptId, promptId))
				.returning({ id: promptRuns.id });

			// Delete the prompt
			const deletedPrompt = await tx.delete(prompts).where(eq(prompts.id, promptId)).returning();

			return { deletedRuns, deletedPrompt };
		});

		return NextResponse.json({
			message: "Prompt deleted successfully",
			data: {
				deletedPrompt: result.deletedPrompt[0],
				deletedRunsCount: result.deletedRuns.length,
				jobSchedulerRemoved,
			},
		});
	} catch (error) {
		console.error("Error deleting prompt:", error);
		return NextResponse.json({ error: "Internal Server Error", message: "Failed to delete prompt" }, { status: 500 });
	}
}
