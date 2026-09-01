/**
 * /api/v1/prompts/:promptId — single prompt resource.
 *
 * GET     fetch one prompt
 * PATCH   update value / enabled / tags
 * DELETE  remove the prompt (cascades to runs + citations) — admin key only
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { selectPremiumModels } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { assertPromptSaveAllowed, withQuotaLock } from "@workspace/lib/entitlements";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { createPromptJobScheduler, removePromptJobScheduler } from "@/lib/job-scheduler";

// z.guid(), not z.uuid(): matches the loose 8-4-4-4-12 hex check this API has
// always used; z.uuid() enforces RFC version bits and rejects existing IDs.
const promptParams = z.object({ promptId: z.guid("Invalid prompt ID format") });

const updatePromptBody = z
	.object({
		value: z.string().trim().min(1, "value must be a non-empty string").optional(),
		enabled: z.boolean().optional(),
		tags: z.array(z.string()).optional(),
		premiumModels: z.array(z.string()).optional(),
	})
	.refine(
		(body) => Object.keys(body).length > 0,
		"At least one of value, enabled, tags, or premiumModels must be provided",
	);

function promptUpdateData(
	body: z.infer<typeof updatePromptBody>,
	brand: { name: string; website: string },
	nextPremium: string[],
): Partial<typeof prompts.$inferInsert> {
	const update: Partial<typeof prompts.$inferInsert> = {};
	if (body.value !== undefined) {
		update.value = body.value;
		update.systemTags = computeSystemTags(body.value, brand.name, brand.website);
	}
	if (body.enabled !== undefined) update.enabled = body.enabled;
	if (body.tags !== undefined) update.tags = sanitizeUserTags(body.tags);
	if (body.premiumModels !== undefined) update.premiumModels = nextPremium;
	return update;
}

export const Route = createFileRoute("/api/v1/prompts/$promptId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: promptParams,
				scopes: ["prompts:read"],
				handle: async ({ params, auth }) => {
					const prompt = await db
						.select({
							id: prompts.id,
							brandId: prompts.brandId,
							value: prompts.value,
							enabled: prompts.enabled,
							tags: prompts.tags,
							systemTags: prompts.systemTags,
							premiumModels: prompts.premiumModels,
							createdAt: prompts.createdAt,
							updatedAt: prompts.updatedAt,
						})
						.from(prompts)
						.where(eq(prompts.id, params.promptId))
						.limit(1);

					if (prompt.length === 0) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${params.promptId}' not found`);
					}
					// Out of scope reads as not-found, so a key cannot confirm that
					// another tenant's prompt id exists.
					await requireBrandInScope(auth, prompt[0].brandId).catch(() => {
						throw new ApiError(404, "Not Found", `Prompt with ID '${params.promptId}' not found`);
					});

					return prompt[0];
				},
			}),

			PATCH: createApiHandler({
				params: promptParams,
				body: updatePromptBody,
				scopes: ["prompts:write"],
				handle: async ({ params, body, auth }) => {
					const { promptId } = params;
					const { enabled, premiumModels } = body;

					const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
					if (existingPrompt.length === 0) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}
					const brand = await requireBrandInScope(auth, existingPrompt[0].brandId).catch(() => {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					});

					const updatedPrompt = await withQuotaLock(brand.organizationId, async (tx, afterCommit) => {
						const [existing] = await tx.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
						if (!existing || existing.brandId !== brand.id) {
							throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
						}
						const wasEnabled = existing.enabled;
						const willBeEnabled = enabled ?? wasEnabled;
						const nextPremium = premiumModels ? selectPremiumModels(premiumModels) : existing.premiumModels;
						const updateData = promptUpdateData(body, brand, nextPremium);
						await assertPromptSaveAllowed(
							brand.organizationId,
							{
								prompts: (willBeEnabled ? 1 : 0) - (wasEnabled ? 1 : 0),
								premiumPairings:
									(willBeEnabled ? nextPremium.length : 0) - (wasEnabled ? existing.premiumModels.length : 0),
							},
							tx,
						);
						const [updated] = await tx.update(prompts).set(updateData).where(eq(prompts.id, promptId)).returning();
						if (enabled !== undefined && wasEnabled !== enabled) {
							afterCommit(() => (enabled ? createPromptJobScheduler(promptId) : removePromptJobScheduler(promptId)));
						}
						return updated;
					});
					// The existence check above can race with a concurrent delete;
					// the update's returning() is the source of truth.
					if (!updatedPrompt) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}

					return updatedPrompt;
				},
			}),

			// Takes every run and citation with it, and no dashboard control does it
			// at any role — so no scope grants it. Disabling frees the plan slot
			// just the same and keeps the history.
			DELETE: createApiHandler({
				params: promptParams,
				adminOnly: true,
				adminOnlyHint: "Send PATCH with `enabled: false` to stop tracking this prompt without losing its history.",
				handle: async ({ params, auth }) => {
					const { promptId } = params;

					const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
					if (existingPrompt.length === 0) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}
					await requireBrandInScope(auth, existingPrompt[0].brandId).catch(() => {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					});

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
		}),
	},
});
