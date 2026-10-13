import { describe, expect, it } from "vitest";
import { issuanceRefusal, mayRevoke } from "../api-key-policy";

describe("issuing a key", () => {
	it("lets an admin issue a key with any reach", () => {
		expect(issuanceRefusal(true, null)).toBeNull();
		expect(issuanceRefusal(true, ["a", "b"])).toBeNull();
		expect(issuanceRefusal(true, ["a"])).toBeNull();
	});

	it("lets a member issue a key for exactly one brand", () => {
		expect(issuanceRefusal(false, ["a"])).toBeNull();
	});

	it("refuses a member a key for every brand or for several", () => {
		expect(issuanceRefusal(false, null)).toMatch(/admins/);
		expect(issuanceRefusal(false, ["a", "b"])).toMatch(/admins/);
	});
});

describe("revoking a key", () => {
	it("lets an admin revoke anyone's key, including one with no recorded issuer", () => {
		expect(mayRevoke(true, "me", "someone-else")).toBe(true);
		expect(mayRevoke(true, "me", null)).toBe(true);
	});

	it("lets a member revoke only the keys they issued", () => {
		expect(mayRevoke(false, "me", "me")).toBe(true);
		expect(mayRevoke(false, "me", "someone-else")).toBe(false);
		expect(mayRevoke(false, "me", null)).toBe(false);
	});
});
