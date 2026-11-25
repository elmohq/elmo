/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { prompts } from "@workspace/lib/db/schema";
import { z } from "zod";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { clampedCount, DEFAULT_LIMIT, offsetOf, page, paginationOf } from "@/lib/api/query";
import { promptListSchema, promptSchema } from "@/lib/api/schemas/prompts";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { createPrompts, listPrompts, toPromptSummary } from "@/server/prompts-core";

const listPromptsQuery = z.object({
	brandId: z.string().optional(),
	page,
	limit: clampedCount(1000, DEFAULT_LIMIT),
	// Anything but `true` or `false` filters nothing, rather than being refused.
	enabled: z.preprocess((raw) => (raw === "true" ? true : raw === "false" ? false : undefined), z.boolean().optional()),
	tags: z.string().optional(),
	q: z.string().optional(),
});

const createPromptBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	value: z.string().trim().min(1, "value must be a non-empty string"),
	tags: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/prompts/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: promptListSchema,
				query: listPromptsQuery,
				scopes: ["read"],
				handle: async ({ query, auth }) => {
					const { data, total } = await listPrompts({
						scope: await brandScopeCondition(auth, prompts.brandId),
						brandId: query.brandId,
						enabled: query.enabled,
						tags: (query.tags ?? "").split(","),
						q: query.q,
						limit: query.limit,
						offset: offsetOf(query),
					});

					// Both keys hold the same array while callers move to `data`, which
					// every other list in this API answers with.
					return {
						data,
						prompts: data,
						pagination: paginationOf(query, total),
					};
				},
			}),

			POST: createApiHandler({
				response: promptSchema,
				body: createPromptBody,
				status: 201,
				scopes: ["write"],
				handle: async ({ body, auth }) => {
					const brand = await requireBrandInScope(auth, body.brandId, "body");
					const [created] = await createPrompts(brand, {
						prompts: [{ value: body.value, tags: body.tags, enabled: true }],
					});
					return toPromptSummary(created);
				},
			}),
		}),
	},
});
