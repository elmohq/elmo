/**
 * Server functions for "Suggest prompts" on the prompts page. Server-fn-only
 * for the same reason as ./onboarding: anything else exported here would drag
 * the db into the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import {
	cancelPromptSuggestions,
	enqueuePromptSuggestions,
	getPromptSuggestionsStatus,
	type PromptSuggestionsStatus,
} from "@/lib/suggest-prompts-job";

export const startPromptSuggestionsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string().min(1),
			// Room for a full list plus a few runs' worth of passed-over suggestions.
			exclude: z
				.array(z.string().max(500))
				.max(MAX_PROMPTS * 2)
				.default([]),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return enqueuePromptSuggestions(data);
	});

/** POST so nothing between here and the browser caches an early `pending`. */
export const getPromptSuggestionsStatusFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }): Promise<PromptSuggestionsStatus> => {
		await requireBrandSession(data.brandId);
		return getPromptSuggestionsStatus(data.brandId);
	});

export const cancelPromptSuggestionsFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await cancelPromptSuggestions(data.brandId);
		return { ok: true };
	});
