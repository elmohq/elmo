import { describe, expect, it } from "vitest";
import { getCloudWorkspaceIdentity, isReservedBrandId, slugify } from "./provisioning";

describe("slugify", () => {
	it("lowercases", () => {
		expect(slugify("Acme")).toBe("acme");
	});

	it("replaces runs of non-alphanumerics with single hyphens", () => {
		expect(slugify("Acme Co!")).toBe("acme-co");
		expect(slugify("Foo   Bar")).toBe("foo-bar");
	});

	it("trims leading and trailing hyphens", () => {
		expect(slugify("  hello world  ")).toBe("hello-world");
		expect(slugify("!!!brand!!!")).toBe("brand");
	});

	it("falls back to 'brand' for empty / non-alphanumeric input", () => {
		expect(slugify("")).toBe("brand");
		expect(slugify("!!!")).toBe("brand");
	});

	it("preserves digits", () => {
		expect(slugify("Acme 2")).toBe("acme-2");
	});

	it("does not itself reserve route-colliding slugs (that's findUniqueBrandId's job)", () => {
		// "new" collides with /app/new, but slugify is a pure string transform —
		// only findUniqueBrandId (which needs a database) applies the reserved-slug
		// suffix rule.
		expect(slugify("new")).toBe("new");
	});
});

describe("reserved brand ids", () => {
	it("protects static application routes without changing slugify", () => {
		expect(isReservedBrandId("new")).toBe(true);
		expect(isReservedBrandId("workspaces")).toBe(true);
		expect(isReservedBrandId("acme")).toBe(false);
		expect(slugify("Workspaces")).toBe("workspaces");
	});
});

describe("getCloudWorkspaceIdentity", () => {
	it("is stable across retries and name changes", () => {
		const original = getCloudWorkspaceIdentity({ userId: "user_123", name: "Alice's workspace" });
		const renamed = getCloudWorkspaceIdentity({ userId: "user_123", name: "Alice Cooper" });

		expect(renamed.organizationId).toBe(original.organizationId);
		expect(renamed.membershipId).toBe(original.membershipId);
		expect(getCloudWorkspaceIdentity({ userId: "user_123", name: "Alice's workspace" })).toEqual(original);
	});

	it("keeps different user identifiers distinct even when punctuation differs", () => {
		const underscore = getCloudWorkspaceIdentity({ userId: "user_123", name: "Workspace" });
		const hyphen = getCloudWorkspaceIdentity({ userId: "user-123", name: "Workspace" });

		expect(underscore.organizationId).not.toBe(hyphen.organizationId);
		expect(underscore.slug).not.toBe(hyphen.slug);
	});
});
