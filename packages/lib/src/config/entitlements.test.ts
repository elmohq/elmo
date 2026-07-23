import { PLANS } from "@workspace/config/plans";
import type { DeploymentMode } from "@workspace/config/types";
import { afterEach, describe, expect, it } from "vitest";
import {
	getEntitlements,
	mergeEntitlements,
	resolveEntitlements,
	UNLIMITED_ENTITLEMENTS,
	ZERO_ENTITLEMENTS,
} from "./entitlements";

const originalMode = process.env.DEPLOYMENT_MODE;
afterEach(() => {
	if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
	else process.env.DEPLOYMENT_MODE = originalMode;
});

const NON_CLOUD: DeploymentMode[] = ["local", "demo", "whitelabel"];

describe("resolveEntitlements", () => {
	it("returns unlimited for every non-cloud mode, ignoring planKey", () => {
		for (const mode of NON_CLOUD) {
			expect(resolveEntitlements({ mode, planKey: "starter", overrides: { maxBrands: 1 } })).toEqual(
				UNLIMITED_ENTITLEMENTS,
			);
		}
	});

	it("returns the zero state for a cloud org with no plan", () => {
		expect(resolveEntitlements({ mode: "cloud", planKey: null, overrides: null })).toEqual(ZERO_ENTITLEMENTS);
	});

	it("returns the zero state (keeping planKey) for an unknown plan", () => {
		const result = resolveEntitlements({ mode: "cloud", planKey: "enterprise", overrides: null });
		expect(result.maxBrands).toBe(0);
		expect(result.allowCustomTargets).toBe(false);
		expect(result.planKey).toBe("enterprise");
	});

	it("resolves a known cloud plan to its ceilings plus planKey", () => {
		expect(resolveEntitlements({ mode: "cloud", planKey: "pro", overrides: null })).toEqual({
			planKey: "pro",
			...PLANS.pro,
		});
	});

	it("shallow-overrides scalar ceilings", () => {
		const result = resolveEntitlements({ mode: "cloud", planKey: "starter", overrides: { maxBrands: 10 } });
		expect(result.maxBrands).toBe(10);
		expect(result.maxPromptsPerOrg).toBe(50); // untouched by the override
	});

	it("deep-merges the per-model runs-per-day map", () => {
		const result = resolveEntitlements({
			mode: "cloud",
			planKey: "pro",
			overrides: { maxRunsPerDay: { claude: 5, grok: 2 } },
		});
		expect(result.maxRunsPerDay).toEqual({ "*": 4, claude: 5, grok: 2 });
	});
});

describe("mergeEntitlements", () => {
	it("keeps base runs-per-day entries not named in the override", () => {
		const base = { planKey: "pro", ...PLANS.pro };
		expect(mergeEntitlements(base, { maxRunsPerDay: { "*": 6 } }).maxRunsPerDay).toEqual({ "*": 6, claude: 1 });
	});
});

describe("getEntitlements", () => {
	it("returns unlimited in non-cloud modes without reading the DB", async () => {
		for (const mode of NON_CLOUD) {
			process.env.DEPLOYMENT_MODE = mode;
			await expect(getEntitlements("org_anything")).resolves.toEqual(UNLIMITED_ENTITLEMENTS);
		}
	});
});
