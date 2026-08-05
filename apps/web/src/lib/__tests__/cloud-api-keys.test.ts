import { describe, expect, it } from "vitest";
import { createWorkspaceApiKeyInputSchema, workspaceApiKeyCreateBody } from "../cloud-api-keys";

describe("cloud API-key creation boundary", () => {
	it("rejects caller-controlled key policy", () => {
		const callerPolicy = {
			organizationId: "org-1",
			name: "Production",
			permissions: { elmoApi: ["write"] },
			rateLimitEnabled: false,
			rateLimitMax: 1_000_000,
			prefix: "custom_",
		};

		expect(createWorkspaceApiKeyInputSchema.safeParse(callerPolicy).success).toBe(false);
	});

	it("builds only the server-owned Better Auth fields", () => {
		const input = createWorkspaceApiKeyInputSchema.parse({ organizationId: "org-1", name: "Production" });
		expect(workspaceApiKeyCreateBody(input)).toEqual({
			configId: "elmo-cloud-v1",
			organizationId: "org-1",
			name: "Production",
		});
	});
});
