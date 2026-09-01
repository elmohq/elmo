/**
 * The instance admin key, which is the one credential resolved without a
 * database.
 *
 * `ADMIN_API_KEYS` is a static list compared in constant time; everything else
 * a caller can present is an organization key the api-key plugin looks up. The
 * cases here are the ones that decide whether a request is admin at all — the
 * step before any scope, organization, or brand narrowing applies.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApiAuth } from "@/lib/auth/api-auth";

/** Reached only when the token is not an admin key, so it must not be. */
const verifyApiKey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({ auth: { api: { verifyApiKey } } }));

function bearer(token: string | null): Request {
	return new Request("http://localhost/api/v1/brands", {
		headers: token === null ? {} : { Authorization: token },
	});
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("resolveApiAuth, for an instance admin key", () => {
	it("accepts a configured key, and asks the database nothing", async () => {
		vi.stubEnv("ADMIN_API_KEYS", "key-1,key-2,key-3");

		await expect(resolveApiAuth(bearer("Bearer key-1"))).resolves.toEqual({
			auth: { kind: "admin", scopes: null, organizationId: null },
		});
		expect(verifyApiKey).not.toHaveBeenCalled();
	});

	it("accepts any of them, since the list is the whole grant", async () => {
		vi.stubEnv("ADMIN_API_KEYS", "key-1,key-2,key-3");

		for (const key of ["key-2", "key-3"]) {
			await expect(resolveApiAuth(bearer(`Bearer ${key}`))).resolves.toMatchObject({ auth: { kind: "admin" } });
		}
	});

	it("sends a key it does not recognize on to be looked up instead", async () => {
		vi.stubEnv("ADMIN_API_KEYS", "key-1");
		verifyApiKey.mockResolvedValue({ valid: false });

		await expect(resolveApiAuth(bearer("Bearer wrong-key"))).resolves.toMatchObject({ failure: { status: 401 } });
		expect(verifyApiKey).toHaveBeenCalled();
	});

	it("is nobody's admin when the list is empty, so an empty env grants nothing", async () => {
		vi.stubEnv("ADMIN_API_KEYS", "");
		verifyApiKey.mockResolvedValue({ valid: false });

		await expect(resolveApiAuth(bearer("Bearer key-1"))).resolves.toMatchObject({ failure: { status: 401 } });
	});

	it("refuses a request carrying no Bearer token at all", async () => {
		vi.stubEnv("ADMIN_API_KEYS", "key-1");

		for (const header of [null, "", "Basic abc123", "Bearer "]) {
			await expect(resolveApiAuth(bearer(header))).resolves.toMatchObject({ failure: { status: 401 } });
		}
		expect(verifyApiKey).not.toHaveBeenCalled();
	});
});
