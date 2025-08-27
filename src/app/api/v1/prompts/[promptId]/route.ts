import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns } from "@/lib/db/schema";
import { removePromptJobScheduler } from "@/lib/job-scheduler";
import { eq } from "drizzle-orm";

type Params = {
	promptId: string;
};

export async function DELETE(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { promptId } = await params;

		// Validate promptId format (UUID)
		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(promptId)) {
			return NextResponse.json(
				{
					error: "Validation Error",
					message: "Invalid prompt ID format",
				},
				{ status: 400 }
			);
		}

		// Check if prompt exists
		const existingPrompt = await db
			.select()
			.from(prompts)
			.where(eq(prompts.id, promptId))
			.limit(1);

		if (existingPrompt.length === 0) {
			return NextResponse.json(
				{
					error: "Not Found",
					message: `Prompt with ID '${promptId}' not found`,
				},
				{ status: 404 }
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
			const deletedPrompt = await tx
				.delete(prompts)
				.where(eq(prompts.id, promptId))
				.returning();

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
		return NextResponse.json(
			{ error: "Internal Server Error", message: "Failed to delete prompt" },
			{ status: 500 }
		);
	}
}
