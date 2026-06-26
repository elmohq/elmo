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
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { BrandNotFoundError } from "@/server/onboarding-core";
import { deletePrompt, getPromptById, PromptNotFoundError, updatePrompt } from "@/server/prompts-core";

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
				params: promptParams,
				handle: async ({ params }) => {
					return getPromptById(params.promptId);
				},
				mapError: (err) =>
					err instanceof PromptNotFoundError
						? new ApiError(404, "Not Found", `Prompt with ID '${err.promptId}' not found`)
						: undefined,
			}),

			PATCH: createApiHandler({
				params: promptParams,
				body: updatePromptBody,
				handle: async ({ params, body }) => {
					return updatePrompt(params.promptId, body);
				},
				mapError: (err) =>
					err instanceof PromptNotFoundError
						? new ApiError(404, "Not Found", `Prompt with ID '${err.promptId}' not found`)
						: err instanceof BrandNotFoundError
							? new ApiError(500, "Internal Server Error", "Brand not found for prompt")
							: undefined,
			}),

			DELETE: createApiHandler({
				params: promptParams,
				handle: async ({ params }) => {
					return deletePrompt(params.promptId);
				},
				mapError: (err) =>
					err instanceof PromptNotFoundError
						? new ApiError(404, "Not Found", `Prompt with ID '${err.promptId}' not found`)
						: undefined,
			}),
		},
	},
});
