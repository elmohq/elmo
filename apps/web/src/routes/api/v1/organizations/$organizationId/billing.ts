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
