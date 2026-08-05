import { describe, expect, it } from "vitest";
import {
	CLOUD_API_KEY_CONFIG_ID,
	CLOUD_API_KEY_PREFIX,
	CLOUD_API_KEY_RATE_LIMIT_MAX_REQUESTS,
	CLOUD_API_KEY_RATE_LIMIT_WINDOW_MS,
	cloudApiKeyConfiguration,
	cloudOrganizationRoles,
} from "./api-key";

describe("cloud API-key configuration", () => {
	it("uses hashed organization-owned keys without session impersonation", () => {
		expect(cloudApiKeyConfiguration).toMatchObject({
			configId: CLOUD_API_KEY_CONFIG_ID,
			references: "organization",
			storage: "database",
			disableKeyHashing: false,
			enableSessionForAPIKeys: false,
			defaultPrefix: CLOUD_API_KEY_PREFIX,
			requireName: true,
		});
	});

	it("stores read/write defaults behind an explicit per-key rate limit", () => {
		expect(cloudApiKeyConfiguration.permissions.defaultPermissions).toEqual({
			elmoApi: ["read", "write"],
		});
		expect(cloudApiKeyConfiguration.rateLimit).toEqual({
			enabled: true,
			timeWindow: CLOUD_API_KEY_RATE_LIMIT_WINDOW_MS,
			maxRequests: CLOUD_API_KEY_RATE_LIMIT_MAX_REQUESTS,
		});
	});
});

describe("cloud organization API-key management roles", () => {
	it.each(["owner", "admin"] as const)("lets %s roles create, read, and delete keys", (role) => {
		for (const action of ["create", "read", "delete"] as const) {
			expect(cloudOrganizationRoles[role].authorize({ apiKey: [action] }).success).toBe(true);
		}
	});

	it("does not grant API-key management to members", () => {
		for (const action of ["create", "read", "update", "delete"] as const) {
			expect(cloudOrganizationRoles.member.authorize({ apiKey: [action] }).success).toBe(false);
		}
	});
});
