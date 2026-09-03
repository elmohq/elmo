import { describe, expect, it } from "vitest";
import { entryRouteForVisitor } from "@/lib/entry-route";

describe("entryRouteForVisitor", () => {
	it("opens cloud on sign-up, whether or not the instance has accounts", () => {
		expect(entryRouteForVisitor({ mode: "cloud", canRegister: true, hasUsers: false })).toBe("/auth/register");
		expect(entryRouteForVisitor({ mode: "cloud", canRegister: true, hasUsers: true })).toBe("/auth/register");
	});

	it("opens an unbootstrapped local instance on sign-up and a bootstrapped one on sign-in", () => {
		expect(entryRouteForVisitor({ mode: "local", canRegister: true, hasUsers: false })).toBe("/auth/register");
		expect(entryRouteForVisitor({ mode: "local", canRegister: false, hasUsers: true })).toBe("/auth/login");
	});

	it("opens demo on sign-in", () => {
		expect(entryRouteForVisitor({ mode: "demo", canRegister: false, hasUsers: true })).toBe("/auth/login");
	});

	it("leaves whitelabel on the home page rather than starting an SSO round trip", () => {
		expect(entryRouteForVisitor({ mode: "whitelabel", canRegister: false, hasUsers: true })).toBeNull();
	});

	it("leaves the home page up when the deployment config has not loaded", () => {
		expect(entryRouteForVisitor(undefined)).toBeNull();
	});
});
