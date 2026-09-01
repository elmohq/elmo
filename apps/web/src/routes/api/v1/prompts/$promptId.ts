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
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requirePromptInScope } from "@/lib/api/scope";
import { deletePrompt, PromptNotFoundError, updatePrompt, updatePromptInputSchema } from "@/server/prompts-core";

// z.guid(), not z.uuid(): matches the loose 8-4-4-4-12 hex check this API has
// always used; z.uuid() enforces RFC version bits and rejects existing IDs.
const promptParams = z.object({ promptId: z.guid("Invalid prompt ID format") });

/** The writes re-check under their own lock, so a prompt that a concurrent
 * delete takes between the scope check and the write reads as 404 here rather
 * than as a 500. */
const mapPromptNotFound = (err: unknown) =>
	err instanceof PromptNotFoundError ? new ApiError(404, "Not Found", err.message) : undefined;

export const Route = createFileRoute("/api/v1/prompts/$promptId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: promptParams,
				scopes: ["prompts:read"],
				handle: async ({ params, auth }) => (await requirePromptInScope(auth, params.promptId)).prompt,
			}),

			PATCH: createApiHandler({
				params: promptParams,
				body: updatePromptInputSchema,
				scopes: ["prompts:write"],
				mapError: mapPromptNotFound,
				handle: async ({ params, body, auth }) => {
					const { brand } = await requirePromptInScope(auth, params.promptId);
					return await updatePrompt(brand, params.promptId, body);
				},
			}),

			// Takes every run and citation with it, and no dashboard control does it
			// at any role — so no scope grants it. Disabling frees the plan slot
			// just the same and keeps the history.
			DELETE: createApiHandler({
				params: promptParams,
				adminOnly: true,
				adminOnlyHint: "Send PATCH with `enabled: false` to stop tracking this prompt without losing its history.",
				mapError: mapPromptNotFound,
				handle: async ({ params, auth }) => {
					await requirePromptInScope(auth, params.promptId);
					const { prompt, deletedRunsCount } = await deletePrompt(params.promptId);
					return { ...prompt, deletedRunsCount };
				},
			}),
		}),
	},
});
