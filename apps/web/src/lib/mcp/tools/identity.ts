/**
 * What this connection is, and what this deployment tracks. Neither needs a
 * scope: both are things a caller must be able to ask when something else has
 * just refused them and it is not clear why.
 */
import { principalLabel, principalScopes } from "@/lib/auth/api-auth";
import { getDeployment } from "@/lib/config/server";
import { platformCatalogue } from "@/server/platforms-core";
import { defineTool } from "./define";

export const whoami = defineTool({
	name: "whoami",
	title: "Identify this connection",
	description:
		"What this MCP connection is: who it acts as, which organizations and brands it reaches, and which tools it may call. Needs no permission, so it is always safe to call first when a request fails and it is not clear why.",
	readOnly: true,
	input: {},
	run: async ({ auth, toolNames }) => {
		const deployment = getDeployment();
		const shared = {
			identity: principalLabel(auth),
			scopes: [...principalScopes(auth)].sort(),
			deployment: {
				mode: deployment.mode,
				billingEnabled: deployment.features.billing,
				readOnly: deployment.features.readOnly,
			},
			tools: [...toolNames],
		};

		switch (auth.kind) {
			case "admin":
				return { ...shared, principal: "admin-key", organizationIds: null, brandIds: null };
			case "organization":
				return {
					...shared,
					principal: "organization-key",
					organizationIds: [auth.organizationId],
					organizationName: auth.organizationName,
					brandIds: auth.brandIds,
					expiresAt: auth.expiresAt,
				};
			case "user":
				return {
					...shared,
					principal: "oauth-session",
					userId: auth.userId,
					email: auth.email,
					organizationIds: auth.organizationIds,
					brandIds: null,
					expiresAt: auth.expiresAt,
				};
		}
	},
});

export const listPlatforms = defineTool({
	name: "list_platforms",
	title: "List answer engines",
	description:
		"The answer engines this deployment knows about, and which of them it is actually tracking. Use the returned ids for the `model` filter on any analytics tool.",
	readOnly: true,
	input: {},
	run: async () => ({ data: platformCatalogue() }),
});
