import { describe, expect, it, vi } from "vitest";
import { authenticateApiAuthorization } from "../authentication.server";

function dependencies(
	overrides: Partial<Parameters<typeof authenticateApiAuthorization>[1]> = {},
): Parameters<typeof authenticateApiAuthorization>[1] {
	return {
		adminApiKeys: ["local-admin-key"],
		verifyCloudApiKey: vi.fn().mockResolvedValue({
			valid: true,
			error: null,
			key: { id: "key-1", configId: "elmo-cloud-v1", referenceId: "org-1" },
		}),
		resolveCloudEntitlements: vi.fn().mockResolvedValue({ mode: "cloud", access: "allowed" }),
		...overrides,
	};
}

describe("authenticateApiAuthorization", () => {
	it("preserves ADMIN_API_KEYS authentication outside cloud", async () => {
		const deps = dependencies();
		await expect(
			authenticateApiAuthorization(
				{ mode: "whitelabel", method: "GET", authorizationHeader: "Bearer local-admin-key" },
				deps,
			),
		).resolves.toEqual({ ok: true, scope: { kind: "instance" } });
		expect(deps.verifyCloudApiKey).not.toHaveBeenCalled();
	});

	it("does not accept an instance admin key as cloud organization scope", async () => {
		const deps = dependencies({
			verifyCloudApiKey: vi.fn().mockResolvedValue({ valid: false, error: null, key: null }),
		});
		const result = await authenticateApiAuthorization(
			{ mode: "cloud", method: "GET", authorizationHeader: "Bearer local-admin-key" },
			deps,
		);
		expect(result).toMatchObject({ ok: false, status: 401 });
	});

	it.each([
		["GET", "read"],
		["HEAD", "read"],
		["POST", "write"],
		["PATCH", "write"],
		["DELETE", "write"],
	] as const)("maps %s requests to %s permission", async (method, permission) => {
		const deps = dependencies();
		await authenticateApiAuthorization({ mode: "cloud", method, authorizationHeader: "Bearer elmo_secret" }, deps);
		expect(deps.verifyCloudApiKey).toHaveBeenCalledWith({ key: "elmo_secret", permission });
	});

	it("returns organization scope only for an actively entitled workspace", async () => {
		const result = await authenticateApiAuthorization(
			{ mode: "cloud", method: "GET", authorizationHeader: "Bearer elmo_secret" },
			dependencies(),
		);
		expect(result).toEqual({
			ok: true,
			scope: { kind: "organization", organizationId: "org-1", apiKeyId: "key-1" },
		});
	});

	it("denies a valid key when workspace entitlements are inactive", async () => {
		const result = await authenticateApiAuthorization(
			{ mode: "cloud", method: "GET", authorizationHeader: "Bearer elmo_secret" },
			dependencies({
				resolveCloudEntitlements: vi.fn().mockResolvedValue({ mode: "cloud", access: "denied" }),
			}),
		);
		expect(result).toMatchObject({ ok: false, status: 403, error: "Forbidden" });
	});

	it("fails closed for missing, mismatched, and rate-limited keys", async () => {
		await expect(
			authenticateApiAuthorization({ mode: "cloud", method: "GET", authorizationHeader: null }, dependencies()),
		).resolves.toMatchObject({ ok: false, status: 401 });

		await expect(
			authenticateApiAuthorization(
				{ mode: "cloud", method: "GET", authorizationHeader: "Bearer elmo_secret" },
				dependencies({
					verifyCloudApiKey: vi.fn().mockResolvedValue({
						valid: true,
						error: null,
						key: { id: "key-1", configId: "another-config", referenceId: "org-1" },
					}),
				}),
			),
		).resolves.toMatchObject({ ok: false, status: 401 });

		await expect(
			authenticateApiAuthorization(
				{ mode: "cloud", method: "GET", authorizationHeader: "Bearer elmo_secret" },
				dependencies({
					verifyCloudApiKey: vi.fn().mockResolvedValue({
						valid: false,
						error: { code: "RATE_LIMITED" },
						key: null,
					}),
				}),
			),
		).resolves.toMatchObject({ ok: false, status: 429 });
	});
});
