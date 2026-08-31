/**
 * /api/v1/prompts - External API endpoint for prompt management
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { prompts } from "@workspace/lib/db/schema";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { brandScopeCondition, requireBrandInScope } from "@/lib/api/scope";
import { createPrompt, createPromptInputSchema, listPrompts } from "@/server/prompts-core";

export const Route = createFileRoute("/api/v1/prompts/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["prompts:read"],
				handle: async ({ request, auth }) => {
					const { searchParams } = new URL(request.url);
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					// Clamped rather than rejected, so an existing caller asking for
					// more keeps working instead of starting to 400.
					const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
					const enabled = searchParams.get("enabled");

					const { data, total } = await listPrompts({
						scope: await brandScopeCondition(auth, prompts.brandId),
						brandId: searchParams.get("brandId") ?? undefined,
						enabled: enabled === "true" || enabled === "false" ? enabled === "true" : undefined,
						tags: (searchParams.get("tags") ?? "").split(","),
						q: searchParams.get("q") ?? undefined,
						limit,
						offset: (page - 1) * limit,
					});

					// Both keys hold the same array while callers move to `data`, which
					// every list in this API answers with. `prompts` is documented as
					// deprecated and goes in a later release.
					return {
						data,
						prompts: data,
						pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
					};
				},
			}),

			POST: createApiHandler({
				body: createPromptInputSchema,
				status: 201,
				scopes: ["prompts:write"],
				handle: async ({ body, auth }) => {
					const brand = await requireBrandInScope(auth, body.brandId, "body");
					return createPrompt(brand, { value: body.value, tags: body.tags });
				},
			}),
		}),
	},
});
