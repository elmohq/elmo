/** Requires no scope, so it is safe to call first when wiring up an integration
 * — including by a key that turns out to hold nothing. */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { API_SCOPES } from "@/lib/api/scopes";

export const Route = createFileRoute("/api/v1/me")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				handle: async ({ auth }) => {
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
						};
					}

					return {
						keyType: "organization",
						organizationId: auth.organizationId,
						organizationName: auth.organizationName,
						scopes: [...auth.scopes].sort(),
						brandIds: auth.brandIds,
						// The key's label as issued: an org-referenced key stores no issuer,
						// so there is no person's name to claim.
						createdBy: auth.name,
						createdAt: auth.createdAt,
						lastUsedAt: auth.lastUsedAt,
						expiresAt: auth.expiresAt,
						rateLimit: auth.rateLimit,
					};
				},
			}),
		}),
	},
});
