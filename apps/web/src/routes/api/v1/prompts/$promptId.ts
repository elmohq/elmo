import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brands, citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { createPromptJobScheduler, removePromptJobScheduler } from "@/lib/job-scheduler";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";

function isValidUUID(id: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(id);
}

function getPromptIdFromPath(request: Request): string {
	const segments = new URL(request.url).pathname.split("/").filter(Boolean);
	return decodeURIComponent(segments[segments.length - 1] || "");
}

export const Route = createFileRoute("/api/v1/prompts/$promptId")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const promptId = getPromptIdFromPath(request);
					if (!isValidUUID(promptId)) {
						return Response.json({ error: "Validation Error", message: "Invalid prompt ID format" }, { status: 400 });
					}

					const prompt = await db
						.select({
							id: prompts.id,
							brandId: prompts.brandId,
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
						return Response.json({ error: "Not Found", message: `Prompt with ID '${promptId}' not found` }, { status: 404 });
					}

					return Response.json(prompt[0]);
				} catch (error) {
					console.error("Error fetching prompt:", error);
					return Response.json({ error: "Internal Server Error", message: "Failed to fetch prompt" }, { status: 500 });
				}
			},

			PATCH: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const promptId = getPromptIdFromPath(request);
					if (!isValidUUID(promptId)) {
						return Response.json({ error: "Validation Error", message: "Invalid prompt ID format" }, { status: 400 });
					}

					const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
					if (existingPrompt.length === 0) {
						return Response.json({ error: "Not Found", message: `Prompt with ID '${promptId}' not found` }, { status: 404 });
					}

					const brandInfo = await db.select().from(brands).where(eq(brands.id, existingPrompt[0].brandId)).limit(1);
					if (brandInfo.length === 0) {
						return Response.json({ error: "Internal Server Error", message: "Brand not found for prompt" }, { status: 500 });
					}
					const brand = brandInfo[0];

					const body = await request.json();
					const { value, enabled, tags } = body as {
						value?: unknown;
						enabled?: unknown;
						tags?: unknown;
					};

					const updateData: Partial<typeof prompts.$inferInsert> = {};
					if (value !== undefined) {
						if (typeof value !== "string" || !value.trim()) {
							return Response.json(
								{ error: "Validation Error", message: "value must be a non-empty string" },
								{ status: 400 },
							);
						}
						updateData.value = value.trim();
						updateData.systemTags = computeSystemTags(value.trim(), brand.name, brand.website);
					}

					if (enabled !== undefined) {
						if (typeof enabled !== "boolean") {
							return Response.json({ error: "Validation Error", message: "enabled must be a boolean" }, { status: 400 });
						}
						updateData.enabled = enabled;
					}

					if (tags !== undefined) {
						if (!Array.isArray(tags)) {
							return Response.json({ error: "Validation Error", message: "tags must be an array of strings" }, { status: 400 });
						}
						updateData.tags = sanitizeUserTags(tags);
					}

					const [updatedPrompt] = await db.update(prompts).set(updateData).where(eq(prompts.id, promptId)).returning();

					if (enabled !== undefined && updatedPrompt) {
						const wasEnabled = existingPrompt[0].enabled;
						const isNowEnabled = enabled;

						if (!wasEnabled && isNowEnabled) {
							await createPromptJobScheduler(promptId);
						} else if (wasEnabled && !isNowEnabled) {
							await removePromptJobScheduler(promptId);
						}
					}

					return Response.json(updatedPrompt);
				} catch (error) {
					console.error("Error updating prompt:", error);
					return Response.json({ error: "Internal Server Error", message: "Failed to update prompt" }, { status: 500 });
				}
			},

			DELETE: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const promptId = getPromptIdFromPath(request);
					if (!isValidUUID(promptId)) {
						return Response.json({ error: "Validation Error", message: "Invalid prompt ID format" }, { status: 400 });
					}

					const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
					if (existingPrompt.length === 0) {
						return Response.json({ error: "Not Found", message: `Prompt with ID '${promptId}' not found` }, { status: 404 });
					}

					await removePromptJobScheduler(promptId);

				const result = await db.transaction(async (tx) => {
					await tx.delete(citations).where(eq(citations.promptId, promptId));
					const deletedRuns = await tx
						.delete(promptRuns)
						.where(eq(promptRuns.promptId, promptId))
						.returning({ id: promptRuns.id });
					const deletedPrompt = await tx.delete(prompts).where(eq(prompts.id, promptId)).returning();
					return { deletedRuns, deletedPrompt };
				});

					return Response.json({
						message: "Prompt deleted successfully",
						data: {
							deletedPrompt: result.deletedPrompt[0],
							deletedRunsCount: result.deletedRuns.length,
						},
					});
				} catch (error) {
					console.error("Error deleting prompt:", error);
					return Response.json({ error: "Internal Server Error", message: "Failed to delete prompt" }, { status: 500 });
				}
			},
		},
	},
});
