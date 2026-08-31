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
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import {
	deletePrompt,
	findPrompt,
	PromptNotFoundError,
	requirePrompt,
	updatePrompt,
	updatePromptInputSchema,
} from "@/server/prompts-core";

// z.guid(), not z.uuid(): matches the loose 8-4-4-4-12 hex check this API has
// always used; z.uuid() enforces RFC version bits and rejects existing IDs.
const promptParams = z.object({ promptId: z.guid("Invalid prompt ID format") });

function notFound(promptId: string): ApiError {
	return new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
}

/** A prompt outside the caller's brands reads exactly as one that isn't there. */
const mapNotFound = (err: unknown) => (err instanceof PromptNotFoundError ? notFound(err.promptId) : undefined);

export const Route = createFileRoute("/api/v1/prompts/$promptId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: promptParams,
				scopes: ["prompts:read"],
				mapError: mapNotFound,
				handle: async ({ params, auth }) => {
					const prompt = await findPrompt(params.promptId);
					if (!prompt) throw notFound(params.promptId);
					// Out of scope reads as not-found, so a key cannot confirm that
					// another tenant's prompt id exists.
					await requireBrandInScope(auth, prompt.brandId).catch(() => {
						throw notFound(params.promptId);
					});
					return prompt;
				},
			}),

			PATCH: createApiHandler({
				params: promptParams,
				body: updatePromptInputSchema,
				scopes: ["prompts:write"],
				mapError: mapNotFound,
				handle: async ({ params, body, auth }) => {
					const existing = await requirePrompt(params.promptId).catch(() => {
						throw notFound(params.promptId);
					});
					const brand = await requireBrandInScope(auth, existing.brandId).catch(() => {
						throw notFound(params.promptId);
					});
					return updatePrompt(brand, params.promptId, body);
				},
			}),

			DELETE: createApiHandler({
				params: promptParams,
				scopes: ["prompts:delete"],
				mapError: mapNotFound,
				handle: async ({ params, auth }) => {
					const existing = await requirePrompt(params.promptId).catch(() => {
						throw notFound(params.promptId);
					});
					await requireBrandInScope(auth, existing.brandId).catch(() => {
						throw notFound(params.promptId);
					});

					const { prompt, deletedRunsCount } = await deletePrompt(params.promptId);
					return { ...prompt, deletedRunsCount };
				},
			}),
		}),
	},
});
