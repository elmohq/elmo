/**
 * /api/v1/prompts/:promptId — single prompt resource.
 *
 * GET     fetch one prompt
 * PATCH   update value / enabled / tags
 * DELETE  remove the prompt (cascades to runs + citations)
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
					const { value, enabled, tags, premiumModels } = body;

					const existingPrompt = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
					if (existingPrompt.length === 0) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}
					const brand = await requireBrandInScope(auth, existingPrompt[0].brandId).catch(() => {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					});

					// Both pools decided against one snapshot. Enabling and assigning
					// grounded models spend different budgets and a save can move both,
					// so checking them separately would let a save pass one limit
					// against a plan the other was denied under.
					const existing = existingPrompt[0];
					const wasEnabled = existing.enabled;
					const willBeEnabled = enabled ?? wasEnabled;
					// Normalized once, then used for both the quota decision and the
					// write. Counting the raw request would charge for duplicates and
					// unsupported names that selectPremiumModels drops before storing.
					const nextPremium = premiumModels ? selectPremiumModels(premiumModels) : existing.premiumModels;
					const promptDelta = (willBeEnabled ? 1 : 0) - (wasEnabled ? 1 : 0);
					const premiumDelta =
						(willBeEnabled ? nextPremium.length : 0) - (wasEnabled ? existing.premiumModels.length : 0);
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
					if (premiumModels !== undefined) {
						updateData.premiumModels = nextPremium;
					}

					// Check and write under one lock, so two saves can't each be the
					// one that fits.
					const [updatedPrompt] = await withQuotaLock(brand.organizationId, async (tx) => {
						await assertPromptSaveAllowed(
							brand.organizationId,
							{ prompts: promptDelta, premiumPairings: premiumDelta },
							tx,
						);
						return tx.update(prompts).set(updateData).where(eq(prompts.id, promptId)).returning();
					});
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
				params: promptParams,
				scopes: ["prompts:delete"],
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
