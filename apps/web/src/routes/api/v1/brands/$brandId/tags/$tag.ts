/**
 * PATCH  /api/v1/brands/:brandId/tags/:tag — rename it across the brand.
 * DELETE /api/v1/brands/:brandId/tags/:tag — drop it from every prompt.
 *
 * Both take `prompts:write` rather than `prompts:delete`: relabelling destroys
 * no tracked data, and a caller holding `prompts:write` could already do the
 * same thing one `PATCH /prompts/:promptId` at a time.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { removeBrandTag, renameBrandTag } from "@/server/tags-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/tags/$tag")({
	server: {
		handlers: withMethodGuard({
			PATCH: createApiHandler({
				body: z.object({ name: z.string().trim().min(1, "name must be a non-empty string") }),
				scopes: ["prompts:write"],
				handle: async ({ params, body, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const promptsUpdated = await renameBrandTag(brand.id, params.tag, body.name);
					return { brandId: brand.id, name: body.name.trim().toLowerCase(), promptsUpdated };
				},
			}),

			DELETE: createApiHandler({
				scopes: ["prompts:write"],
				handle: async ({ params, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const promptsUpdated = await removeBrandTag(brand.id, params.tag);
					return { brandId: brand.id, name: null, promptsUpdated };
				},
			}),
		}),
	},
});
