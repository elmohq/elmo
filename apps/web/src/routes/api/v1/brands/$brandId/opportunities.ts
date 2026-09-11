/**
 * No POST to regenerate, and the GET doesn't either: producing a report spends
 * provider budget with nothing metering it per call. Elmo decides when one is
 * stale, so this endpoint only ever reads what it already wrote.
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
