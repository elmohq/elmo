import {
	type Entitlements,
	NO_PLAN_ENTITLEMENTS,
	resolveEntitlements,
	UNLIMITED_ENTITLEMENTS,
} from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import {
	decideBrandCreate,
	decideCadenceOverride,
	decideEnabledModels,
	decidePremiumAssign,
	decidePromptAdd,
	type EntitlementDecision,
} from "./guards";

const NOW = new Date("2026-08-05T12:00:00Z");

/** Assert the denial and hand back what it told the customer, in one step. */
function denialMessage(decision: EntitlementDecision): string {
	if (decision.allowed) throw new Error("expected a denial, got an allow");
	return decision.message;
}

function planEntitlements(plan: string): Entitlements {
	return resolveEntitlements({
		mode: "cloud",
		subscription: { status: "active", plan, periodEnd: new Date("2026-09-01") },
		premiumAddonQuantity: 0,
		overrides: null,
		now: NOW,
	});
}

const PRO = planEntitlements("pro");

describe("unlimited entitlements short-circuit every guard", () => {
	it("allows everything", () => {
		expect(decideBrandCreate(UNLIMITED_ENTITLEMENTS, 10_000).allowed).toBe(true);
		expect(decidePromptAdd(UNLIMITED_ENTITLEMENTS, 10_000, 500).allowed).toBe(true);
		expect(decideEnabledModels(UNLIMITED_ENTITLEMENTS, ["anything", "claude", "made-up"]).allowed).toBe(true);
		expect(decidePremiumAssign(UNLIMITED_ENTITLEMENTS, 10_000, 10).allowed).toBe(true);
		expect(decideCadenceOverride(UNLIMITED_ENTITLEMENTS, 1).allowed).toBe(true);
	});
});

describe("no active plan blocks all additions", () => {
	it("denies with the paywall code", () => {
		for (const decision of [
			decideBrandCreate(NO_PLAN_ENTITLEMENTS, 0),
			decidePromptAdd(NO_PLAN_ENTITLEMENTS, 0, 1),
			decideEnabledModels(NO_PLAN_ENTITLEMENTS, ["chatgpt"]),
			decidePremiumAssign(NO_PLAN_ENTITLEMENTS, 0, 1),
			decideCadenceOverride(NO_PLAN_ENTITLEMENTS, 48),
		]) {
			expect(decision).toMatchObject({ allowed: false, code: "no-active-plan" });
		}
	});
});

describe("decideBrandCreate", () => {
	it("allows under the plan limit and denies at it", () => {
		expect(decideBrandCreate(PRO, 1).allowed).toBe(true);
		expect(decideBrandCreate(PRO, 2)).toMatchObject({ allowed: false, code: "brand-limit" });
	});

	it("points at an upgrade only while one sells more brands", () => {
		// Pro has Business above it; Business is the top of the ladder, so there
		// is nothing to upgrade to and the answer is a custom agreement.
		expect(denialMessage(decideBrandCreate(PRO, 2))).toMatch(/upgrade/i);
		expect(denialMessage(decideBrandCreate(planEntitlements("business"), 5))).toMatch(/custom plan/i);
		expect(denialMessage(decideBrandCreate(planEntitlements("business"), 5))).not.toMatch(/upgrade/i);
	});

	it("lets a custom plan raise the limit", () => {
		const custom = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "active", plan: "business", periodEnd: new Date("2026-09-01") },
			premiumAddonQuantity: 0,
			overrides: { maxBrands: 12 },
			now: NOW,
		});
		expect(decideBrandCreate(custom, 11).allowed).toBe(true);
		expect(decideBrandCreate(custom, 12).allowed).toBe(false);
	});
});

describe("decidePromptAdd", () => {
	it("counts the org-wide pool including the batch being added", () => {
		expect(decidePromptAdd(PRO, 100, 50).allowed).toBe(true);
		expect(decidePromptAdd(PRO, 100, 51)).toMatchObject({ allowed: false, code: "prompt-limit" });
		expect(decidePromptAdd(PRO, 150, 1)).toMatchObject({ allowed: false, code: "prompt-limit" });
	});

	it("adding zero is always allowed (disable/edit paths)", () => {
		expect(decidePromptAdd(NO_PLAN_ENTITLEMENTS, 500, 0).allowed).toBe(true);
	});
});

describe("decideEnabledModels", () => {
	it("allows picks from the standard menu within the pick count", () => {
		expect(decideEnabledModels(PRO, ["chatgpt", "perplexity", "gemini", "copilot"]).allowed).toBe(true);
	});

	it("denies a fifth pick", () => {
		expect(decideEnabledModels(PRO, ["chatgpt", "perplexity", "gemini", "copilot", "deepseek"])).toMatchObject({
			allowed: false,
			code: "platform-picks-exceeded",
		});
	});

	it("denies off-menu models", () => {
		expect(decideEnabledModels(PRO, ["gpt-5-search"])).toMatchObject({
			allowed: false,
			code: "platform-not-in-plan",
		});
	});

	it("allows claude as a pick — the menu entry is the ungrounded model", () => {
		expect(decideEnabledModels(PRO, ["chatgpt", "claude"]).allowed).toBe(true);
	});

	it("starter is chatgpt-only", () => {
		const starter = planEntitlements("starter");
		expect(decideEnabledModels(starter, ["chatgpt"]).allowed).toBe(true);
		expect(decideEnabledModels(starter, ["perplexity"])).toMatchObject({
			allowed: false,
			code: "platform-not-in-plan",
		});
	});

	it("custom-plan extras become allowed and picks can grow", () => {
		const custom = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "active", plan: "business", periodEnd: new Date("2026-09-01") },
			premiumAddonQuantity: 0,
			overrides: { extraPlatforms: ["gpt-5-search"], platformPicks: 5 },
			now: NOW,
		});
		expect(decideEnabledModels(custom, ["chatgpt", "perplexity", "gemini", "copilot", "gpt-5-search"]).allowed).toBe(
			true,
		);
	});
});

describe("decidePremiumAssign", () => {
	it("denies on plans without a claude pool", () => {
		expect(decidePremiumAssign(planEntitlements("basic"), 0, 1)).toMatchObject({
			allowed: false,
			code: "premium-not-in-plan",
		});
	});

	it("allows up to the pool (included + add-on) and denies past it", () => {
		expect(decidePremiumAssign(PRO, 19, 1).allowed).toBe(true);
		expect(decidePremiumAssign(PRO, 20, 1)).toMatchObject({ allowed: false, code: "premium-pool-exhausted" });

		const proWithAddon = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "active", plan: "pro", periodEnd: new Date("2026-09-01") },
			premiumAddonQuantity: 5,
			overrides: null,
			now: NOW,
		});
		expect(decidePremiumAssign(proWithAddon, 24, 1).allowed).toBe(true);
		expect(decidePremiumAssign(proWithAddon, 25, 1)).toMatchObject({ allowed: false, code: "premium-pool-exhausted" });
	});
});

describe("decideCadenceOverride", () => {
	it("denies an override faster than the plan cadence, naming the plan rate", () => {
		// pro samples 4×/day → 6h floor
		expect(decideCadenceOverride(PRO, 4)).toMatchObject({
			allowed: false,
			code: "cadence-faster-than-plan",
			message: expect.stringContaining("4"),
		});
	});

	it("allows the plan cadence exactly and anything slower", () => {
		expect(decideCadenceOverride(PRO, 6).allowed).toBe(true);
		expect(decideCadenceOverride(PRO, 48).allowed).toBe(true);
	});

	it("allows clearing the override back to the plan cadence", () => {
		expect(decideCadenceOverride(PRO, null).allowed).toBe(true);
	});

	it("the floor follows the plan: starter's once-daily rejects a half-day override", () => {
		const starter = planEntitlements("starter");
		expect(decideCadenceOverride(starter, 12)).toMatchObject({ allowed: false, code: "cadence-faster-than-plan" });
		expect(decideCadenceOverride(starter, 24).allowed).toBe(true);
	});

	it("a custom plan's higher sampling lowers the floor", () => {
		const custom = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "active", plan: "business", periodEnd: new Date("2026-09-01") },
			premiumAddonQuantity: 0,
			overrides: { standardRunsPerDay: 7 },
			now: NOW,
		});
		expect(decideCadenceOverride(custom, 4).allowed).toBe(true);
		expect(decideCadenceOverride(planEntitlements("business"), 4).allowed).toBe(false);
		expect(decideCadenceOverride(custom, 3)).toMatchObject({ allowed: false, code: "cadence-faster-than-plan" });
	});
});

describe("grace and paused standings", () => {
	it("grace behaves like active for writes", () => {
		const grace = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "past_due", plan: "pro", periodEnd: new Date("2026-08-01") },
			premiumAddonQuantity: 0,
			overrides: null,
			now: new Date("2026-08-05"),
		});
		expect(grace.standing).toBe("grace");
		expect(decidePromptAdd(grace, 0, 1).allowed).toBe(true);
	});

	it("paused still allows writes within limits (tracking stops in the worker instead)", () => {
		const paused = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "past_due", plan: "pro", periodEnd: new Date("2026-06-01") },
			premiumAddonQuantity: 0,
			overrides: null,
			now: new Date("2026-08-05"),
		});
		expect(paused.standing).toBe("paused");
		expect(decidePromptAdd(paused, 0, 1).allowed).toBe(true);
	});
});
