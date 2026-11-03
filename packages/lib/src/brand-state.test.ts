import type { Entitlements } from "@workspace/config/entitlements";
import { NO_PLAN_ENTITLEMENTS, UNLIMITED_ENTITLEMENTS } from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import { brandTrackingState, hasBrandData, needsPlan } from "./brand-state";

const RUNNING = { enabled: true, onboarded: true };

function plan(overrides: Partial<Entitlements> = {}): Entitlements {
	return { ...UNLIMITED_ENTITLEMENTS, unlimited: false, ...overrides };
}

const ACTIVE = plan({ standing: "active", trackingActive: true });
const GRACE = plan({ standing: "grace", trackingActive: true });
const PAUSED = plan({ standing: "paused", trackingActive: false });

describe("what a brand is doing right now", () => {
	it("tracks an enabled, onboarded brand on an active plan", () => {
		expect(brandTrackingState(RUNNING, ACTIVE)).toBe("tracked");
	});

	it("keeps tracking through the dunning window", () => {
		expect(brandTrackingState(RUNNING, GRACE)).toBe("tracked");
	});

	it("is onboarding until the wizard has been through", () => {
		expect(brandTrackingState({ enabled: true, onboarded: false }, ACTIVE)).toBe("onboarding");
	});

	it("is disabled when someone in the org turned it off", () => {
		expect(brandTrackingState({ enabled: false, onboarded: true }, ACTIVE)).toBe("disabled");
	});

	it("is paused when billing stopped tracking", () => {
		expect(brandTrackingState(RUNNING, PAUSED)).toBe("paused");
	});

	it("is unentitled with no subscription", () => {
		expect(brandTrackingState(RUNNING, NO_PLAN_ENTITLEMENTS)).toBe("unentitled");
	});

	it("tracks everything outside cloud, where there is no plan to be outside of", () => {
		expect(brandTrackingState(RUNNING, UNLIMITED_ENTITLEMENTS)).toBe("tracked");
	});
});

describe("which answer wins when several apply", () => {
	it("says unentitled rather than disabled, so the reader is sent somewhere useful", () => {
		expect(brandTrackingState({ enabled: false, onboarded: true }, NO_PLAN_ENTITLEMENTS)).toBe("unentitled");
	});

	it("says unentitled rather than onboarding, so the paywall comes before the wizard", () => {
		expect(brandTrackingState({ enabled: true, onboarded: false }, NO_PLAN_ENTITLEMENTS)).toBe("unentitled");
	});

	it("says paused rather than disabled", () => {
		expect(brandTrackingState({ enabled: false, onboarded: true }, PAUSED)).toBe("paused");
	});
});

describe("what each state means for the reader", () => {
	it("keeps a brand's history readable when tracking stops", () => {
		expect(hasBrandData("paused")).toBe(true);
		expect(hasBrandData("disabled")).toBe(true);
	});

	it("has nothing to show before onboarding or behind the paywall", () => {
		expect(hasBrandData("onboarding")).toBe(false);
		expect(hasBrandData("unentitled")).toBe(false);
	});

	it("sends only an unentitled reader to the paywall", () => {
		expect(needsPlan("unentitled")).toBe(true);
		for (const state of ["tracked", "onboarding", "disabled", "paused"] as const) {
			expect(needsPlan(state)).toBe(false);
		}
	});
});
