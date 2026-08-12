import { describe, expect, it } from "vitest";
import {
	CLOUD_PLATFORMS,
	PLAN_KEYS,
	PLANS,
	type PlanPlatformGroupId,
	PREMIUM_ADDON_ANNUAL_USD,
	PREMIUM_ADDON_MONTHLY_USD,
	PREMIUM_MODELS,
	PREMIUM_RUNS_PER_DAY,
	planPlatformBreakdown,
	premiumPairings,
	premiumSlotsUsed,
	STANDARD_PLATFORM_MENU,
	selectPremiumModels,
	summarizeSubscriptionCost,
} from "./plans";

describe("cloud platform menu", () => {
	it("says how every sellable platform is reached", () => {
		// A pick can't be sold without declaring whether we scrape it or call it,
		// which is what sets its rate and its tier.
		for (const model of STANDARD_PLATFORM_MENU) {
			expect(CLOUD_PLATFORMS[model].access, model).toMatch(/^(scraped|api)$/);
		}
	});

	it("sells every listed platform one way or the other", () => {
		// A catalog entry that is neither pickable nor premium is unreachable, and
		// would sit in the file looking like an offer.
		for (const [model, platform] of Object.entries(CLOUD_PLATFORMS)) {
			expect(platform.access !== undefined || platform.premium === true, model).toBe(true);
		}
	});

	it("keeps a model too dear to pick out of the pick menu", () => {
		// Grok's own answers cost several times a scrape per run, so it is sold as
		// a metered premium call rather than one of four picks sampled 4x/day.
		expect(STANDARD_PLATFORM_MENU).not.toContain("grok");
		expect(PREMIUM_MODELS).toContain("grok");
	});
});

function groupsById(planKey: keyof typeof PLANS) {
	const { pickGroups } = planPlatformBreakdown(PLANS[planKey]);
	return new Map<PlanPlatformGroupId, (typeof pickGroups)[number]>(pickGroups.map((g) => [g.id, g]));
}

describe("planPlatformBreakdown", () => {
	it("keeps every pickable platform inside the budget", () => {
		// A model that is also premium is still an ordinary pick when called
		// without web search, so listing it outside "choose 4" read as extra.
		const { pickGroups } = planPlatformBreakdown(PLANS.pro);
		const pickable = pickGroups.flatMap((g) => g.models.map((m) => m.model));
		expect(pickable).toContain("claude");
		expect(pickable.sort()).toEqual([...PLANS.pro.platformMenu].sort());
	});

	it("groups an ungrounded premium model with the other LLM APIs", () => {
		// Called without web search, Claude is the same kind of thing as Mistral.
		const api = groupsById("pro").get("api");
		expect(api?.models.map((m) => m.model)).toContain("claude");
		expect(api?.models.map((m) => m.model)).toContain("mistral");
	});

	it("samples every pick at the plan's rate, grounded calls at the premium one", () => {
		// Ungrounded Claude is an ordinary API pick; only the grounded call is
		// premium, and only the premium tier departs from the plan's rate.
		expect(groupsById("pro").get("api")?.runsPerDay).toBe(PLANS.pro.standardRunsPerDay);
		expect(groupsById("pro").get("scraped")?.runsPerDay).toBe(PLANS.pro.standardRunsPerDay);
		expect(planPlatformBreakdown(PLANS.pro).premium?.runsPerDay).toBe(PREMIUM_RUNS_PER_DAY);
	});

	it("separates scraped searches from model APIs", () => {
		const groups = groupsById("business");
		expect(groups.get("scraped")?.models.map((m) => m.model)).toContain("perplexity");
		expect(groups.get("scraped")?.models.map((m) => m.model)).not.toContain("claude");
		expect(groups.get("api")?.models.map((m) => m.model)).not.toContain("perplexity");
	});

	it("names every platform it lists", () => {
		for (const key of PLAN_KEYS) {
			for (const group of planPlatformBreakdown(PLANS[key]).pickGroups) {
				for (const member of group.models) expect(member.label, `${key}/${member.model}`).toBeTruthy();
			}
		}
	});

	it("drops tiers a plan cannot pick from", () => {
		// Starter is ChatGPT only: one scraped tier, no APIs at all.
		const { pickGroups } = planPlatformBreakdown(PLANS.starter);
		expect(pickGroups.map((g) => g.id)).toEqual(["scraped"]);
		expect(pickGroups[0].models.map((m) => m.model)).toEqual(["chatgpt"]);
	});

	it("omits the premium tier on plans that do not sell it", () => {
		// Better to say nothing than to advertise an absence in a price column.
		expect(planPlatformBreakdown(PLANS.starter).premium).toBeNull();
		expect(planPlatformBreakdown(PLANS.basic).premium).toBeNull();
	});

	it("reports the premium tier as metered where it is sold", () => {
		expect(planPlatformBreakdown(PLANS.pro).premium).toMatchObject({
			includedSlots: PLANS.pro.premiumIncluded,
			runsPerDay: PREMIUM_RUNS_PER_DAY,
			addonAvailable: true,
		});
		expect(planPlatformBreakdown(PLANS.business).premium?.includedSlots).toBeGreaterThan(PLANS.pro.premiumIncluded);
	});

	it("offers every premium model the plan can reach, not just one", () => {
		// The pool buys grounded tracking on any of them, which is the whole point
		// of it being a budget rather than a Claude allowance.
		const premium = planPlatformBreakdown(PLANS.pro).premium;
		expect(premium?.models.map((m) => m.model)).toEqual([...PREMIUM_MODELS]);
		expect(premium?.label).toBeTruthy();
	});

	it("names a premium model by the grounded product, not the pick", () => {
		// "ChatGPT" and "GPT-5 Search" are different things to a customer, and the
		// same model id backs both.
		const premium = planPlatformBreakdown(PLANS.pro).premium;
		const labels = new Map(premium?.models.map((m) => [m.model, m.label]));
		expect(labels.get("chatgpt")).toBe("GPT-5 Search");
		expect(labels.get("claude")).toMatch(/\(web\)$/);
		// The same model is listed plainly where it is sold as a pick.
		const api = groupsById("pro").get("api");
		expect(api?.models.find((m) => m.model === "claude")?.label).toBe("Claude");
	});

	it("sells the whole premium tier to any plan that has a pool", () => {
		// Narrowing it to the pick menu would drop the models that are premium
		// precisely because they are too dear to pick.
		const narrow = planPlatformBreakdown({ ...PLANS.pro, platformMenu: ["chatgpt", "gemini"] });
		expect(narrow.premium?.models.map((m) => m.model)).toEqual([...PREMIUM_MODELS]);
	});
});

describe("premiumSlotsUsed", () => {
	it("charges one slot per model a prompt is tracked on", () => {
		expect(premiumSlotsUsed([{ enabled: true, premiumModels: ["claude", "grok"] }])).toBe(2);
	});

	it("charges nothing for a disabled prompt, which runs nothing", () => {
		expect(premiumSlotsUsed([{ enabled: false, premiumModels: ["claude", "grok"] }])).toBe(0);
	});

	it("totals across prompts, since the pool is org-wide", () => {
		expect(
			premiumSlotsUsed([
				{ enabled: true, premiumModels: ["claude"] },
				{ enabled: false, premiumModels: ["claude"] },
				{ enabled: true, premiumModels: [] },
				{ enabled: true, premiumModels: ["grok", "chatgpt"] },
			]),
		).toBe(3);
	});
});

describe("selectPremiumModels", () => {
	it("keeps only what can actually be sold as premium", () => {
		expect(selectPremiumModels(["claude", "gemini", "made-up"])).toEqual(["claude"]);
	});

	it("dedupes and returns catalog order, so a slot cannot be double-spent", () => {
		expect(selectPremiumModels(["grok", "claude", "grok"])).toEqual(
			PREMIUM_MODELS.filter((m) => m === "grok" || m === "claude"),
		);
	});

	it("treats nothing requested as nothing spent", () => {
		expect(selectPremiumModels(undefined)).toEqual([]);
		expect(selectPremiumModels([])).toEqual([]);
	});
});

describe("summarizeSubscriptionCost", () => {
	it("adds the add-on to the plan at the monthly rate", () => {
		const cost = summarizeSubscriptionCost({ plan: "pro", interval: "monthly", addonQuantity: 4 });
		expect(cost.totalUsd).toBe(PLANS.pro.monthlyPriceUsd + 4 * PREMIUM_ADDON_MONTHLY_USD);
		expect(cost.lines.map((l) => l.label)).toEqual(["Pro plan", "4 extra premium pairings"]);
	});

	it("quotes annual billing annually, including the add-on's annual rate", () => {
		// Annual is 10x monthly for both, so a year costs ten months either way.
		const cost = summarizeSubscriptionCost({ plan: "business", interval: "annual", addonQuantity: 2 });
		expect(cost.interval).toBe("annual");
		expect(cost.totalUsd).toBe(PLANS.business.annualPriceUsd + 2 * PREMIUM_ADDON_ANNUAL_USD);
	});

	it("omits the add-on line when none is purchased", () => {
		const cost = summarizeSubscriptionCost({ plan: "starter", interval: "monthly", addonQuantity: 0 });
		expect(cost.lines).toHaveLength(1);
		expect(cost.totalUsd).toBe(PLANS.starter.monthlyPriceUsd);
	});

	it("ignores a negative or fractional quantity rather than crediting it", () => {
		const cost = summarizeSubscriptionCost({ plan: "pro", interval: "monthly", addonQuantity: -3 });
		expect(cost.totalUsd).toBe(PLANS.pro.monthlyPriceUsd);
		expect(summarizeSubscriptionCost({ plan: "pro", interval: "monthly", addonQuantity: 2.7 }).totalUsd).toBe(
			PLANS.pro.monthlyPriceUsd + 2 * PREMIUM_ADDON_MONTHLY_USD,
		);
	});

	it("names one pairing in the singular", () => {
		const [, addon] = summarizeSubscriptionCost({ plan: "pro", interval: "monthly", addonQuantity: 1 }).lines;
		expect(addon.label).toBe("1 extra premium pairing");
	});
});

describe("plan copy the surfaces share", () => {
	it("names the single option instead of asking a one-platform plan to choose", () => {
		expect(planPlatformBreakdown(PLANS.starter).pickHeading).toBe("ChatGPT only");
	});

	it("states the budget once, so the paywall and the marketing table cannot word it differently", () => {
		expect(planPlatformBreakdown(PLANS.pro).pickHeading).toBe(`Choose any ${PLANS.pro.platformPicks} platforms`);
		expect(planPlatformBreakdown(PLANS.business).pickHeading).toBe(planPlatformBreakdown(PLANS.pro).pickHeading);
	});

	it("counts the allowance in prompt/model pairings, not prompts", () => {
		// 20 buys one prompt on twenty models, twenty prompts on one, or anything
		// between — calling them prompts made the second reading impossible.
		const pro = planPlatformBreakdown(PLANS.pro).premium;
		expect(pro?.summary).toBe(
			`Grounded and cited. ${premiumPairings(PLANS.pro.premiumIncluded)} included, each answered daily.`,
		);
		expect(pro?.summary).toContain("pairings");
	});

	it("leaves the price of more to whatever sits alongside it", () => {
		// The plan card already prints the per-pairing price directly below.
		expect(planPlatformBreakdown(PLANS.pro).premium?.summary).not.toContain("$");
	});

	it("offers the add-on alone when a plan includes none", () => {
		// No such plan today, but the sentence must not read "0 pairings included".
		const summary = planPlatformBreakdown({ ...PLANS.basic, premiumAddonAvailable: true }).premium?.summary;
		expect(summary).toBe("Grounded and cited. Available as an add-on.");
	});

	it("names one pairing in the singular", () => {
		expect(premiumPairings(1)).toBe("1 prompt/model pairing");
		expect(premiumPairings(2)).toBe("2 prompt/model pairings");
	});
});
