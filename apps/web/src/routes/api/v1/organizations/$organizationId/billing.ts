/**
 * GET /api/v1/organizations/:organizationId/billing — plan, limits, usage.
 *
 * Read-only by construction: there is no billing write endpoint and no billing
 * write scope, so no key of any kind can change a subscription, an add-on
 * quantity, or a payment method. Payment-provider identifiers, invoices, and
 * payment methods are never returned — anything a customer needs to *change*
 * lives in the provider's own portal.
 *
 * Deployments without billing answer 200 with `billingEnabled: false`, a null
 * plan and null limits, so a caller needs no special case for self-hosting.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireOrganizationInScope } from "@/lib/api/scope";
import { OrganizationNotFoundError, organizationBilling } from "@/server/billing-core";

export const Route = createFileRoute("/api/v1/organizations/$organizationId/billing")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["billing:read"],
				mapError: (err) =>
					err instanceof OrganizationNotFoundError ? new ApiError(404, "Not Found", err.message) : undefined,
				handle: async ({ params, auth }) => {
					requireOrganizationInScope(auth, params.organizationId);
					return organizationBilling(params.organizationId);
				},
			}),
		}),
	},
});
