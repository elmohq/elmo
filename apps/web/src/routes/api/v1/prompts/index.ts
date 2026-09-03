/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { prompts } from "@workspace/lib/db/schema";
import { z } from "zod";
import { clampedPaging } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { createPrompts, listPrompts } from "@/server/prompts-core";

const createPromptBody = z.object({
	brandId: z.string().trim().min(1, "brandId is required"),
	value: z.string().trim().min(1, "value must be a non-empty string"),
	tags: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/prompts/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["prompts:read"],
				handle: async ({ request, auth }) => {
					const { searchParams } = new URL(request.url);
					const { page, limit, offset } = clampedPaging(searchParams, 1000);

					const enabled = searchParams.get("enabled");
					const { data, total } = await listPrompts({
						scope: await brandScopeCondition(auth, prompts.brandId),
						brandId: searchParams.get("brandId") ?? undefined,
						enabled: enabled === "true" ? true : enabled === "false" ? false : undefined,
						tags: (searchParams.get("tags") ?? "").split(","),
						q: searchParams.get("q") ?? undefined,
						limit,
						offset,
					});

					// Both keys hold the same array while callers move to `data`, which
					// every other list in this API answers with.
					return {
						data,
						prompts: data,
						pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
					};
				},
			}),

			POST: createApiHandler({
				body: createPromptBody,
				status: 201,
				scopes: ["prompts:write"],
				handle: async ({ body, auth }) => {
					const brand = await requireBrandInScope(auth, body.brandId, "body");
					const [created] = await createPrompts(brand, {
						prompts: [{ value: body.value, tags: body.tags, enabled: true }],
					});
					return created;
				},
			}),
		}),
	},
});
