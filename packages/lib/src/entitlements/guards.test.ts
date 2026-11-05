import {
	type Entitlements,
	NO_PLAN_ENTITLEMENTS,
	resolveEntitlements,
	UNLIMITED_ENTITLEMENTS,
} from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import { MAX_COMPETITORS, MAX_PROMPTS } from "../constants";
import {
	decideBrandCreate,
	decideCadenceOverride,
	decideCompetitorCap,
	decideEnabledModels,
	decidePremiumAssign,
	decidePromptAdd,
	decidePromptCap,
	promptSaveDelta,
	type WriteDecision,
} from "./guards";

const NOW = new Date("2026-08-05T12:00:00Z");

/** Assert the denial and hand back what it told the customer, in one step. */
function denialMessage(decision: WriteDecision): string {
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
const STARTER = planEntitlements("starter");

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

describe("decidePromptCap", () => {
	it("allows a save that stays within the cap", () => {
		expect(decidePromptCap(0, 1).allowed).toBe(true);
		expect(decidePromptCap(MAX_PROMPTS - 1, 1).allowed).toBe(true);
	});

	it("refuses a save that grows past the cap", () => {
		expect(denialMessage(decidePromptCap(MAX_PROMPTS, 1))).toMatch(new RegExp(`at most ${MAX_PROMPTS} prompts`));
		expect(decidePromptCap(MAX_PROMPTS - 1, 2).allowed).toBe(false);
	});

	it("keeps an over-cap brand editable as long as the save adds nothing", () => {
		expect(decidePromptAdd(UNLIMITED_ENTITLEMENTS, 150, 0).allowed).toBe(true);
		expect(decidePromptCap(150, 0).allowed).toBe(true);
		expect(decidePromptCap(150, 1).allowed).toBe(false);
	});

	it("lets an unlimited deployment add past MAX_PROMPTS over the admin API", () => {
		expect(decidePromptAdd(UNLIMITED_ENTITLEMENTS, MAX_PROMPTS, 1).allowed).toBe(true);
		expect(decidePromptAdd(UNLIMITED_ENTITLEMENTS, MAX_PROMPTS * 10, 500).allowed).toBe(true);
	});
});

describe("decideCompetitorCap", () => {
	it("allows a brand up to the cap", () => {
		expect(decideCompetitorCap(0).allowed).toBe(true);
		expect(decideCompetitorCap(MAX_COMPETITORS).allowed).toBe(true);
	});

	it("refuses the first competitor over it, and says how far over", () => {
		const message = denialMessage(decideCompetitorCap(MAX_COMPETITORS + 3));
		expect(message).toMatch(new RegExp(`at most ${MAX_COMPETITORS} competitors`));
		expect(message).toMatch(new RegExp(`${MAX_COMPETITORS + 3}`));
	});
});

describe("promptSaveDelta", () => {
	const grounded = { enabled: true, premiumModels: ["claude"] };

	it("counts a deleted grounded prompt as a release", () => {
		expect(
			promptSaveDelta({ updates: [{ before: grounded, after: { enabled: false, premiumModels: [] } }], inserts: [] }),
		).toEqual({
			prompts: -1,
			premiumPairings: -1,
		});
	});

	it("counts disabling a grounded prompt as a release", () => {
		expect(
			promptSaveDelta({
				updates: [{ before: grounded, after: { enabled: false, premiumModels: ["claude"] } }],
				inserts: [],
			}),
		).toEqual({
			prompts: -1,
			premiumPairings: -1,
		});
	});

	it("charges re-enabling a grounded prompt for the pairing it resumes, without calling it an assignment", () => {
		expect(
			promptSaveDelta({
				updates: [{ before: { enabled: false, premiumModels: ["claude"] }, after: grounded }],
				inserts: [],
			}),
		).toEqual({
			prompts: 1,
			premiumPairings: 1,
		});
	});

	it("carrying the same assignment back is not an assignment", () => {
		expect(promptSaveDelta({ updates: [{ before: grounded, after: grounded }], inserts: [] })).toEqual({
			prompts: 0,
			premiumPairings: 0,
		});
	});

	it("charges a second model on a row that already carries one, and calls it an assignment", () => {
		expect(
			promptSaveDelta({
				updates: [{ before: grounded, after: { enabled: true, premiumModels: ["claude", "grok"] } }],
				inserts: [],
			}),
		).toEqual({ prompts: 0, premiumPairings: 1 });
	});

	it("counts a swap as one assignment, not two", () => {
		expect(
			promptSaveDelta({
				updates: [{ before: grounded, after: { enabled: true, premiumModels: ["grok"] } }],
				inserts: [],
			}),
		).toEqual({
			prompts: 0,
			premiumPairings: 0,
		});
	});

	it("charges an insert only when it lands enabled", () => {
		expect(promptSaveDelta({ updates: [], inserts: [{ after: grounded }] })).toEqual({
			prompts: 1,
			premiumPairings: 1,
		});
		expect(
			promptSaveDelta({ updates: [], inserts: [{ after: { enabled: false, premiumModels: ["claude"] } }] }),
		).toEqual({
			prompts: 0,
			premiumPairings: 0,
		});
	});

	it("nets a save that swaps one prompt for another to nothing", () => {
		expect(
			promptSaveDelta({
				updates: [{ before: grounded, after: { enabled: false, premiumModels: [] } }],
				inserts: [{ after: { enabled: true, premiumModels: [] } }],
			}),
		).toEqual({ prompts: 0, premiumPairings: -1 });
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
	it("reports a lapsed subscription as a payment problem, not an upsell", () => {
		expect(decidePremiumAssign(NO_PLAN_ENTITLEMENTS, 0, 1)).toMatchObject({ code: "no-active-plan" });
		expect(denialMessage(decidePremiumAssign(NO_PLAN_ENTITLEMENTS, 0, 1))).not.toMatch(/Pro and Business/);
	});

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
