import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

export const dynamic = "force-dynamic";

interface UpdateDelayOverrideRequest {
	delayOverrideMs: number | null; // null to remove override
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const { id: brandId } = await params;
		const body: UpdateDelayOverrideRequest = await request.json();

		// Validate the delay override
		if (body.delayOverrideMs !== null && typeof body.delayOverrideMs !== "number") {
			return NextResponse.json({ error: "Invalid delay override value" }, { status: 400 });
		}

		if (body.delayOverrideMs !== null && body.delayOverrideMs < 0) {
			return NextResponse.json({ error: "Delay override must be a positive number" }, { status: 400 });
		}

		// Update the brand
		const result = await db
			.update(brands)
			.set({
				delayOverrideMs: body.delayOverrideMs,
				updatedAt: new Date(),
			})
			.where(eq(brands.id, brandId))
			.returning();

		if (!result || result.length === 0) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}

		// Recreate job schedulers for all enabled prompts of this brand
		// This ensures the new delay override is applied to all existing schedulers
		const enabledPrompts = await db
			.select({ id: prompts.id })
			.from(prompts)
			.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true)));

		if (enabledPrompts.length > 0) {
			const promptIds = enabledPrompts.map((p) => p.id);
			console.log(`Updating job schedulers for ${promptIds.length} prompts in brand ${brandId}`);
			
			// Update job schedulers with the new delay
			const results = await createMultiplePromptJobSchedulers(promptIds);
			const successCount = results.filter((success) => success).length;
			const failureCount = results.length - successCount;
			
			console.log(`Job scheduler update: ${successCount} succeeded, ${failureCount} failed`);
			
			if (failureCount > 0) {
				console.warn(`Some job schedulers failed to update for brand ${brandId}`);
			}
		} else {
			console.log(`No enabled prompts found for brand ${brandId}, skipping job scheduler update`);
		}

		return NextResponse.json({ brand: result[0] });
	} catch (error) {
		console.error("Error updating brand delay override:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

