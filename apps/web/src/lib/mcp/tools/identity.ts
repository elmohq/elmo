/** Neither needs a scope: both are what a caller asks when something else has
 * just refused it and it is not clear why. */
import { principalLabel, principalScopes } from "@/lib/auth/api-auth";
import { modelCatalogue } from "@/server/models-core";
import { defineTool } from "./define";

export const whoami = defineTool({
	name: "whoami",
	title: "Identify this connection",
	description:
		"What this MCP connection is: who it acts as, which organizations it reaches, and which tools it may call. Needs no permission, so it is always safe to call first when a request fails and it is not clear why.",
	readOnly: true,
	input: {},
	run: async ({ auth, toolNames }) => {
		const shared = {
			identity: principalLabel(auth),
			scopes: [...principalScopes(auth)].sort(),
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

export const listModels = defineTool({
	name: "list_models",
	title: "List models",
	description:
		"The models this deployment knows about, and which of them it is actually tracking. Use the returned ids for the `model` filter on any analytics tool.",
	readOnly: true,
	input: {},
	run: async () => ({ data: modelCatalogue() }),
});
