/**
 * GET /api/v1/me — what the calling key is.
 *
 * Requires no scope, so it is always safe to call first when wiring up an
 * integration: it answers which organization and brands the key reaches, which
 * scopes it holds, and what kind of deployment answered.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler } from "@/lib/api/handler";
import { API_SCOPES } from "@/lib/api/scopes";
import { getDeployment } from "@/lib/config/server";

export const Route = createFileRoute("/api/v1/me")({
	server: {
		handlers: {
			GET: createApiHandler({
				handle: async ({ auth }) => {
					const deployment = getDeployment();
					const shared = {
						deployment: {
							mode: deployment.mode,
							billingEnabled: deployment.features.billing,
							readOnly: deployment.features.readOnly,
						},
					};

					if (auth.kind === "admin") {
						return {
							keyType: "admin",
							organizationId: null,
							organizationName: null,
							scopes: [...API_SCOPES],
							brandIds: null,
							createdBy: null,
							createdAt: null,
							lastUsedAt: null,
							expiresAt: null,
							rateLimit: null,
							...shared,
						};
					}

					return {
						keyType: "organization",
						organizationId: auth.organizationId,
						organizationName: auth.organizationName,
						scopes: [...auth.scopes].sort(),
						brandIds: auth.brandIds,
						createdBy: auth.name,
						createdAt: auth.createdAt,
						lastUsedAt: auth.lastUsedAt,
						expiresAt: auth.expiresAt,
						rateLimit: auth.rateLimit,
						...shared,
					};
				},
			}),
		},
	},
});
