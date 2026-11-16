import { describe, expect, it } from "vitest";
import { isOrgAdminRole, ORG_ADMIN_ROLES } from "./roles";

describe("isOrgAdminRole", () => {
	it("allows admins and owners to manage an organization", () => {
		expect(isOrgAdminRole("admin")).toBe(true);
		expect(isOrgAdminRole("owner")).toBe(true);
	});

	it("does not treat regular members or unknown roles as admins", () => {
		expect(isOrgAdminRole("member")).toBe(false);
		expect(isOrgAdminRole("viewer")).toBe(false);
	});

	it("requires an exact match for administrator roles", () => {
		expect(isOrgAdminRole("Admin")).toBe(false);
		expect(isOrgAdminRole("OWNER")).toBe(false);
		expect(isOrgAdminRole(" admin")).toBe(false);
	});

	it("rejects missing or empty roles", () => {
		expect(isOrgAdminRole(null)).toBe(false);
		expect(isOrgAdminRole(undefined)).toBe(false);
		expect(isOrgAdminRole("")).toBe(false);
	});

	it("accepts every role listed in ORG_ADMIN_ROLES", () => {
		for (const role of ORG_ADMIN_ROLES) {
			expect(isOrgAdminRole(role)).toBe(true);
		}
	});
});
