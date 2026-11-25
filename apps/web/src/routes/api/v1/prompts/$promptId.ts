/**
 * /api/v1/prompts/:promptId — single prompt resource.
 *
 * GET     fetch one prompt
 * PATCH   update value / enabled / tags / parent / country / language
 * DELETE  remove the prompt (cascades to runs + citations) — admin key only
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { promptWriteError } from "@/lib/api/prompt-errors";
import { deletedPromptSchema, promptSchema } from "@/lib/api/schemas/prompts";
import { requirePromptInScope } from "@/lib/api/scope";
import { deletePrompt, toPromptSummary, updatePrompt, updatePromptInputSchema } from "@/server/prompts-core";

const promptParams = z.object({ promptId: z.uuid("Invalid prompt ID format") });

export const Route = createFileRoute("/api/v1/prompts/$promptId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: promptSchema,
				params: promptParams,
				scopes: ["read"],
				handle: async ({ params, auth }) => {
					const { prompt, brand } = await requirePromptInScope(auth, params.promptId);
					return toPromptSummary(prompt, brand);
				},
			}),

			PATCH: createApiHandler({
				response: promptSchema,
				params: promptParams,
				body: updatePromptInputSchema,
				scopes: ["write"],
				mapError: promptWriteError,
				handle: async ({ params, body, auth }) => {
					const { brand } = await requirePromptInScope(auth, params.promptId);
					return toPromptSummary(await updatePrompt(brand, params.promptId, body), brand);
				},
			}),

			// Takes every run and citation with it, and no dashboard control does it
			// at any role — so no scope grants it. Disabling frees the plan slot
			// just the same and keeps the history.
			DELETE: createApiHandler({
				response: deletedPromptSchema,
				params: promptParams,
				adminOnly: true,
				adminOnlyHint: "Send PATCH with `enabled: false` to stop tracking this prompt without losing its history.",
				mapError: promptWriteError,
				handle: async ({ params, auth }) => {
					const { brand } = await requirePromptInScope(auth, params.promptId);
					const { prompt, deletedRunsCount } = await deletePrompt(params.promptId);
					return { ...toPromptSummary(prompt, brand), deletedRunsCount };
				},
			}),
		}),
	},
});
