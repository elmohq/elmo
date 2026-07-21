import { describe, expect, it } from "vitest";
import { canEditEvaluationConfig, canEditEvaluationEntitlements } from "../evaluation-config-policy";

describe("canEditEvaluationConfig", () => {
	it("gives the single local install user access at every configuration scope", () => {
		for (const scope of ["instance", "organization", "brand", "prompt"] as const) {
			expect(canEditEvaluationConfig({ mode: "local", isGlobalAdmin: false, scope })).toBe(true);
		}
	});

	it("keeps demo mode read-only", () => {
		expect(canEditEvaluationConfig({ mode: "demo", isGlobalAdmin: true, scope: "instance" })).toBe(false);
	});

	it("allows cloud organization administrators but not members below instance scope", () => {
		expect(
			canEditEvaluationConfig({ mode: "cloud", isGlobalAdmin: false, organizationRole: "admin", scope: "brand" }),
		).toBe(true);
		expect(
			canEditEvaluationConfig({ mode: "cloud", isGlobalAdmin: false, organizationRole: "member", scope: "brand" }),
		).toBe(false);
		expect(
			canEditEvaluationConfig({ mode: "cloud", isGlobalAdmin: false, organizationRole: "owner", scope: "instance" }),
		).toBe(false);
	});

	it("keeps cloud sampling and cadence under server-side plan control", () => {
		expect(
			canEditEvaluationConfig({
				mode: "cloud",
				isGlobalAdmin: false,
				organizationRole: "admin",
				scope: "brand",
				action: "target-selection",
			}),
		).toBe(true);
		expect(
			canEditEvaluationConfig({
				mode: "cloud",
				isGlobalAdmin: false,
				organizationRole: "admin",
				scope: "brand",
				action: "run-policy",
			}),
		).toBe(false);
	});

	it("keeps whitelabel organization and prompt configuration unavailable and requires a global admin", () => {
		expect(
			canEditEvaluationConfig({ mode: "whitelabel", isGlobalAdmin: false, organizationRole: "admin", scope: "brand" }),
		).toBe(false);
		expect(canEditEvaluationConfig({ mode: "whitelabel", isGlobalAdmin: true, scope: "brand" })).toBe(true);
		expect(canEditEvaluationConfig({ mode: "whitelabel", isGlobalAdmin: true, scope: "organization" })).toBe(false);
		expect(canEditEvaluationConfig({ mode: "whitelabel", isGlobalAdmin: true, scope: "prompt" })).toBe(false);
	});
});

describe("canEditEvaluationEntitlements", () => {
	it("never exposes billing controls in whitelabel or demo", () => {
		expect(canEditEvaluationEntitlements({ mode: "whitelabel", isGlobalAdmin: true })).toBe(false);
		expect(canEditEvaluationEntitlements({ mode: "demo", isGlobalAdmin: true })).toBe(false);
	});
});
