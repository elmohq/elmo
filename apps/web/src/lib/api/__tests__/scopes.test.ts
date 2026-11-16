import { describe, expect, it } from "vitest";
import { permissionsToScopes, scopesToPermissions } from "@/lib/api/scopes";

describe("permissionsToScopes", () => {
	it("preserves read permission", () => {
		expect(permissionsToScopes({ api: ["read"] })).toEqual(["read"]);
	});

	it("preserves write permission without adding read permission", () => {
		expect(permissionsToScopes({ api: ["write"] })).toEqual(["write"]);
	});

	it("returns read before write regardless of permission order", () => {
		expect(permissionsToScopes({ api: ["write", "read"] })).toEqual(["read", "write"]);
	});

	it("drops actions it doesn't recognize", () => {
		expect(permissionsToScopes({ api: ["read", "delete", "admin"] })).toEqual(["read"]);
	});

	it("ignores permissions for other resources", () => {
		expect(permissionsToScopes({ other: ["read"] })).toEqual([]);
	});

	it("rejects actions that aren't an array", () => {
		expect(permissionsToScopes({ api: "read" })).toEqual([]);
	});

	it.each([null, undefined, "api"])("returns no scopes for %s", (permissions) => {
		expect(permissionsToScopes(permissions)).toEqual([]);
	});
});

describe("scopesToPermissions", () => {
	it("returns read before write regardless of scope order", () => {
		expect(scopesToPermissions(["write", "read"])).toEqual({ api: ["read", "write"] });
	});

	it("drops scopes it doesn't recognize", () => {
		expect(scopesToPermissions(["read", "admin"])).toEqual({ api: ["read"] });
	});

	it("deduplicates scopes", () => {
		expect(scopesToPermissions(["read", "read"])).toEqual({ api: ["read"] });
	});

	it("returns empty API permissions for no scopes", () => {
		expect(scopesToPermissions([])).toEqual({ api: [] });
	});
});

describe("scope round trip", () => {
	it.each([{ scopes: [] }, { scopes: ["read"] }, { scopes: ["write"] }, { scopes: ["read", "write"] }])(
		"preserves $scopes through a round trip",
		({ scopes }) => {
			expect(permissionsToScopes(scopesToPermissions(scopes))).toEqual(scopes);
		},
	);
});
