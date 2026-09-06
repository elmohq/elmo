/**
 * No POST to regenerate: producing a report spends provider budget with nothing
 * metering it per call. Elmo decides when one is stale.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { publishedOpportunities } from "@/server/opportunities-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/opportunities")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					return publishedOpportunities(brand.id);
				},
			}),
		}),
	},
});
