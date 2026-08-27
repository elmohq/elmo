/**
 * GET /api/v1/brands/:brandId/tags — the tags in use on a brand's prompts.
 *
 * Tags are derived, not stored: one exists exactly as long as some prompt
 * carries it. This saves a caller paging every prompt in the brand just to
 * build the filter the dashboard shows.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { listBrandTags } from "@/server/tags-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/tags/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["prompts:read"],
				handle: async ({ params, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					return { brandId: brand.id, data: await listBrandTags(brand.id) };
				},
			}),
		}),
	},
});
