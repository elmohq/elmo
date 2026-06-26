/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { BrandNotFoundError } from "@/server/onboarding-core";
import { createPrompt, listPrompts } from "@/server/prompts-core";

const createPromptBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	value: z.string().trim().min(1, "value must be a non-empty string"),
	tags: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/prompts/")({
	server: {
		handlers: {
			GET: createApiHandler({
				handle: async ({ request }) => {
					const { searchParams } = new URL(request.url);
					const brandId = searchParams.get("brandId");
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, parseInt(searchParams.get("limit") || "20"));

					return listPrompts({ brandId: brandId ?? undefined, page, limit });
				},
			}),

			POST: createApiHandler({
				body: createPromptBody,
				status: 201,
				handle: async ({ body }) => {
					return createPrompt(body);
				},
				mapError: (err) =>
					err instanceof BrandNotFoundError
						? new ApiError(400, "Validation Error", `Brand with ID '${err.brandId}' not found`)
						: undefined,
			}),
		},
	},
});
