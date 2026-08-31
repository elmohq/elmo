/**
 * GET /api/v1/brands/:brandId/opportunities — the latest report.
 *
 * Read-only, and deliberately no POST to regenerate: producing a report spends
 * provider budget with nothing metering it per call, the same reason
 * /tools/analyze stays admin-only. Elmo decides when one is stale; this returns
 * the newest row of an append-only history.
 *
 * `status` says why the lists are empty when they are, so a caller never has to
 * tell "no opportunities" from "not enough data yet".
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
