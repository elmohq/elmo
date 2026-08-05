/**
 * /api/v1/prompts/:promptId — single prompt resource.
 *
 * GET     fetch one prompt
 * PATCH   update value / enabled / tags
 * DELETE  remove the prompt in noncloud deployments; cloud retains audit history
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
	getOrganizationApiPrompt,
	rejectOrganizationApiPromptDeletion,
	updateOrganizationApiPrompt,
} from "@workspace/lib/cloud/api-resources";
import { db } from "@workspace/lib/db/db";
import { brands, citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { mapOrganizationResourceError } from "@/lib/api/organization-resources.server";
import { createPromptJobScheduler, removePromptJobScheduler } from "@/lib/job-scheduler";

// z.guid(), not z.uuid(): matches the loose 8-4-4-4-12 hex check this API has
// always used; z.uuid() enforces RFC version bits and rejects existing IDs.
const promptParams = z.object({ promptId: z.guid("Invalid prompt ID format") });

const updatePromptBody = z
	.object({
		value: z.string().trim().min(1, "value must be a non-empty string").optional(),
		enabled: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
	})
	.refine((body) => Object.keys(body).length > 0, "At least one of value, enabled, or tags must be provided");

export const Route = createFileRoute("/api/v1/prompts/$promptId")({
	server: {
		handlers: {
			GET: createApiHandler({
				cloudOrganizationScoped: true,
				params: promptParams,
				mapError: mapOrganizationResourceError,
				handle: async ({ params, scope }) => {
					if (scope.kind === "organization") {
						return getOrganizationApiPrompt(scope.organizationId, params.promptId);
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
						.where(eq(prompts.id, params.promptId))
						.limit(1);

					if (prompt.length === 0) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${params.promptId}' not found`);
					}

					return prompt[0];
				},
			}),

			PATCH: createApiHandler({
				cloudOrganizationScoped: true,
				params: promptParams,
				body: updatePromptBody,
				mapError: mapOrganizationResourceError,
				handle: async ({ params, body, scope }) => {
					const { promptId } = params;
					const { value, enabled, tags } = body;
					if (scope.kind === "organization") {
						return updateOrganizationApiPrompt({
							organizationId: scope.organizationId,
							promptId,
							value,
							enabled,
							tags: tags === undefined ? undefined : sanitizeUserTags(tags),
						});
					}

					const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
					if (existingPrompt.length === 0) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}

					const brandInfo = await db.select().from(brands).where(eq(brands.id, existingPrompt[0].brandId)).limit(1);
					if (brandInfo.length === 0) {
						throw new ApiError(500, "Internal Server Error", "Brand not found for prompt");
					}
					const brand = brandInfo[0];

					const updateData: Partial<typeof prompts.$inferInsert> = {};
					if (value !== undefined) {
						updateData.value = value;
						updateData.systemTags = computeSystemTags(value, brand.name, brand.website);
					}
					if (enabled !== undefined) {
						updateData.enabled = enabled;
					}
					if (tags !== undefined) {
						updateData.tags = sanitizeUserTags(tags);
					}

					const [updatedPrompt] = await db.update(prompts).set(updateData).where(eq(prompts.id, promptId)).returning();
					// The existence check above can race with a concurrent delete;
					// the update's returning() is the source of truth.
					if (!updatedPrompt) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}

					if (enabled !== undefined) {
						const wasEnabled = existingPrompt[0].enabled;
						const isNowEnabled = enabled;

						if (!wasEnabled && isNowEnabled) {
							await createPromptJobScheduler(promptId);
						} else if (wasEnabled && !isNowEnabled) {
							await removePromptJobScheduler(promptId);
						}
					}

					return updatedPrompt;
				},
			}),

			DELETE: createApiHandler({
				cloudOrganizationScoped: true,
				params: promptParams,
				mapError: mapOrganizationResourceError,
				handle: async ({ params, scope }) => {
					const { promptId } = params;
					if (scope.kind === "organization") {
						return rejectOrganizationApiPromptDeletion(scope.organizationId, promptId);
					}

					const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
					if (existingPrompt.length === 0) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
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

					// The pre-transaction existence check can race with a concurrent
					// delete; the transaction's returning() is the source of truth.
					const deleted = result.deletedPrompt[0];
					if (!deleted) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}

					return { ...deleted, deletedRunsCount: result.deletedRuns.length };
				},
			}),
		},
	},
});
