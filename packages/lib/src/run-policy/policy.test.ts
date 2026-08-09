import {
	type Entitlements,
	NO_PLAN_ENTITLEMENTS,
	resolveEntitlements,
	UNLIMITED_ENTITLEMENTS,
} from "@workspace/config/entitlements";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { RUNS_PER_PROMPT } from "../constants";
import {
	dailyRunCeiling,
	defaultPlatformPicks,
	dueToleranceMs,
	isTargetDue,
	type ResolveRunPlanInput,
	resolvePromptRunPlan,
	selectDueTargets,
	targetKey,
} from "./policy";

const NOW = new Date("2026-08-05T12:00:00Z");

const SELF_HOSTED_TARGETS = parseScrapeTargets(
	"chatgpt:brightdata:online,perplexity:brightdata:online,claude:anthropic-api:claude-sonnet-4-6:online",
);

const CLOUD_TARGETS = parseScrapeTargets(
	[
		"chatgpt:brightdata:online",
		"google-ai-mode:brightdata:online",
		"google-ai-overview:brightdata:online",
		"copilot:brightdata:online",
		"perplexity:brightdata:online",
		"gemini:brightdata:online",
		"qwen:openrouter:qwen/qwen3-235b",
		"deepseek:openrouter:deepseek/deepseek-v3.2",
		"grok:openrouter:x-ai/grok-4.5",
		"mistral:openrouter:mistralai/mistral-medium-3.1",
		"claude:anthropic-api:claude-sonnet-4-6",
		"claude:anthropic-api:claude-sonnet-4-6:online",
	].join(","),
);

function cloudEntitlements(plan: string, extra?: Partial<Parameters<typeof resolveEntitlements>[0]>): Entitlements {
	return resolveEntitlements({
		mode: "cloud",
		subscription: { status: "active", plan, periodEnd: new Date("2026-09-01") },
		premiumAddonQuantity: 0,
		overrides: null,
		now: NOW,
		...extra,
	});
}

function localInput(overrides?: Partial<ResolveRunPlanInput>): ResolveRunPlanInput {
	return {
		mode: "local",
		scrapeTargets: SELF_HOSTED_TARGETS,
		brand: { enabledModels: null, delayOverrideHours: null },
		prompt: { premiumModels: [] },
		entitlements: UNLIMITED_ENTITLEMENTS,
		defaultDelayHours: 24,
		...overrides,
	};
}

describe("resolvePromptRunPlan: non-cloud legacy equivalence", () => {
	it("runs every configured target at the brand cadence with RUNS_PER_PROMPT replication", () => {
		const plan = resolvePromptRunPlan(localInput());
		expect(plan.targets.map((t) => t.config)).toEqual(SELF_HOSTED_TARGETS);
		for (const target of plan.targets) {
			expect(target.intervalHours).toBe(24);
			expect(target.replication).toBe(RUNS_PER_PROMPT);
		}
		expect(plan.rescheduleHours).toBe(24);
	});

	it("honors delayOverrideHours", () => {
		const plan = resolvePromptRunPlan(localInput({ brand: { enabledModels: null, delayOverrideHours: 6 } }));
		expect(plan.targets.every((t) => t.intervalHours === 6)).toBe(true);
		expect(plan.rescheduleHours).toBe(6);
	});

	it("applies brand.enabledModels exactly like selectTargetsForBrand", () => {
		const plan = resolvePromptRunPlan(localInput({ brand: { enabledModels: ["chatgpt"], delayOverrideHours: null } }));
		expect(plan.targets.map((t) => t.config.model)).toEqual(["chatgpt"]);
	});

	it("empty enabledModels runs nothing and parks the chain", () => {
		const plan = resolvePromptRunPlan(localInput({ brand: { enabledModels: [], delayOverrideHours: null } }));
		expect(plan.targets).toEqual([]);
		expect(plan.rescheduleHours).toBeNull();
	});

	it("throws on unknown enabledModels (existing loud-failure semantics)", () => {
		expect(() =>
			resolvePromptRunPlan(localInput({ brand: { enabledModels: ["nope"], delayOverrideHours: null } })),
		).toThrow(/nope/);
	});

	it("whitelabel and demo behave identically to local", () => {
		for (const mode of ["whitelabel", "demo"] as const) {
			const plan = resolvePromptRunPlan(localInput({ mode }));
			expect(plan.targets).toHaveLength(SELF_HOSTED_TARGETS.length);
			expect(plan.rescheduleHours).toBe(24);
		}
	});

	it("non-cloud ignores premium assignments — a model runs only if SCRAPE_TARGETS configures it", () => {
		const plan = resolvePromptRunPlan(localInput({ prompt: { premiumModels: ["claude"] } }));
		// claude already present from SCRAPE_TARGETS exactly once, at brand cadence
		const claudeTargets = plan.targets.filter((t) => t.config.model === "claude");
		expect(claudeTargets).toHaveLength(1);
		expect(claudeTargets[0].intervalHours).toBe(24);
		expect(claudeTargets[0].replication).toBe(RUNS_PER_PROMPT);
	});
});

describe("defaultPlatformPicks", () => {
	it("fills a new brand's picks from the front of the plan menu", () => {
		expect(defaultPlatformPicks(cloudEntitlements("pro"), CLOUD_TARGETS)).toEqual([
			"chatgpt",
			"google-ai-mode",
			"google-ai-overview",
			"copilot",
		]);
	});

	it("reaches every menu platform when a custom plan raises the pick count", () => {
		const custom = cloudEntitlements("business", { overrides: { platformPicks: 10 } });
		expect(defaultPlatformPicks(custom, CLOUD_TARGETS)).toEqual([
			"chatgpt",
			"google-ai-mode",
			"google-ai-overview",
			"copilot",
			"perplexity",
			"gemini",
			"qwen",
			"deepseek",
			"mistral",
			"claude",
			// Grok is absent on purpose: it is sold as a premium grounded call, not
			// as a pick, so no number of picks reaches it.
		]);
	});

	it("may default to ungrounded Claude, which is an ordinary platform pick", () => {
		const custom = cloudEntitlements("business", { overrides: { platformPicks: 20 } });
		expect(defaultPlatformPicks(custom, CLOUD_TARGETS)).toContain("claude");
	});

	it("offers no Claude pick when the instance only configures the grounded target", () => {
		// Grounded Claude belongs to the per-prompt pool, never to platform picks.
		const groundedOnly = parseScrapeTargets("chatgpt:brightdata:online,claude:anthropic-api:claude-sonnet-4-6:online");
		const custom = cloudEntitlements("business", { overrides: { platformPicks: 20 } });
		expect(defaultPlatformPicks(custom, groundedOnly)).toEqual(["chatgpt"]);
	});

	it("follows menu order, not SCRAPE_TARGETS order, and skips unconfigured platforms", () => {
		const partial = parseScrapeTargets("mistral:openrouter:mistralai/mistral-medium-3.1,gemini:brightdata:online");
		expect(defaultPlatformPicks(cloudEntitlements("pro"), partial)).toEqual(["gemini", "mistral"]);
	});

	it("gives starter its single platform", () => {
		expect(defaultPlatformPicks(cloudEntitlements("starter"), CLOUD_TARGETS)).toEqual(["chatgpt"]);
	});
});

describe("resolvePromptRunPlan: cloud", () => {
	function cloudInput(overrides?: Partial<ResolveRunPlanInput>): ResolveRunPlanInput {
		return {
			mode: "cloud",
			scrapeTargets: CLOUD_TARGETS,
			brand: { enabledModels: ["chatgpt", "perplexity"], delayOverrideHours: null },
			prompt: { premiumModels: [] },
			entitlements: cloudEntitlements("pro"),
			defaultDelayHours: 24,
			...overrides,
		};
	}

	it("runs picked standard platforms at the plan cadence with replication 1", () => {
		const plan = resolvePromptRunPlan(cloudInput());
		expect(plan.targets.map((t) => t.config.model)).toEqual(["chatgpt", "perplexity"]);
		for (const target of plan.targets) {
			expect(target.intervalHours).toBe(6); // 4×/day
			expect(target.replication).toBe(1);
		}
		expect(plan.rescheduleHours).toBe(6);
	});

	it("clamps a stored too-fast override to the plan cadence (downgrade behavior)", () => {
		const plan = resolvePromptRunPlan(cloudInput({ brand: { enabledModels: ["chatgpt"], delayOverrideHours: 1 } }));
		expect(plan.targets[0].intervalHours).toBe(6);
		expect(plan.rescheduleHours).toBe(6);
	});

	it("a slower override stretches standard and claude cadence alike", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({
				brand: { enabledModels: ["chatgpt", "claude"], delayOverrideHours: 48 },
			}),
		);
		expect(plan.targets.find((t) => t.config.model === "chatgpt")?.intervalHours).toBe(48);
		expect(plan.targets.find((t) => t.config.model === "claude")?.intervalHours).toBe(48);
		expect(plan.rescheduleHours).toBe(48);
	});

	it("an override between the standard and claude floors slows only standard", () => {
		// 12h is slower than pro's 6h standard floor but faster than claude's 24h.
		const plan = resolvePromptRunPlan(
			cloudInput({
				brand: { enabledModels: ["chatgpt", "claude"], delayOverrideHours: 12 },
			}),
		);
		expect(plan.targets.find((t) => t.config.model === "chatgpt")?.intervalHours).toBe(12);
		expect(plan.targets.find((t) => t.config.model === "claude")?.intervalHours).toBe(24);
	});

	it("starter runs its single pick once daily", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({
				entitlements: cloudEntitlements("starter"),
				brand: { enabledModels: ["chatgpt"], delayOverrideHours: null },
			}),
		);
		expect(plan.targets).toHaveLength(1);
		expect(plan.targets[0].intervalHours).toBe(24);
	});

	it("clamps picks to the plan menu and pick count (downgrade behavior)", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({
				entitlements: cloudEntitlements("starter"), // menu: chatgpt only, 1 pick
				brand: { enabledModels: ["perplexity", "chatgpt", "gemini"], delayOverrideHours: null },
			}),
		);
		expect(plan.targets.map((t) => t.config.model)).toEqual(["chatgpt"]);
	});

	it("picking claude runs the ungrounded target once daily, whatever the plan rate", () => {
		// Pro samples standard platforms 4x/day; Claude is API-metered per call,
		// so it stays daily instead of following that rate.
		const plan = resolvePromptRunPlan(
			cloudInput({ brand: { enabledModels: ["chatgpt", "claude"], delayOverrideHours: null } }),
		);
		const claude = plan.targets.find((t) => t.config.model === "claude");
		expect(claude).toMatchObject({ intervalHours: 24, replication: 1 });
		expect(claude?.config.webSearch).toBe(false);
		// The faster standard target still drives the chain.
		expect(plan.rescheduleHours).toBe(6);
	});

	it("adds a premium model the brand never picked, on top of every pick", () => {
		// The two tiers are independent: picks run on all prompts, premium models
		// run on the prompts that name them, and neither implies the other.
		const targets = parseScrapeTargets(
			"chatgpt:brightdata:online,perplexity:brightdata:online,grok:openrouter:x-ai/grok-4.5:online",
		);
		const plan = resolvePromptRunPlan(
			cloudInput({
				scrapeTargets: targets,
				brand: { enabledModels: ["chatgpt", "perplexity"], delayOverrideHours: null },
				prompt: { premiumModels: ["grok"] },
			}),
		);
		expect(plan.targets.map((t) => t.config.model)).toEqual(["chatgpt", "perplexity", "grok"]);
	});

	it("runs the brand's picks on a prompt that spends no premium slots", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({
				brand: { enabledModels: ["chatgpt", "perplexity"], delayOverrideHours: null },
				prompt: { premiumModels: [] },
			}),
		);
		expect(plan.targets.map((t) => t.config.model)).toEqual(["chatgpt", "perplexity"]);
	});

	it("a premium assignment adds the grounded target on top of the picks", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({
				brand: { enabledModels: ["chatgpt", "claude"], delayOverrideHours: null },
				prompt: { premiumModels: ["claude"] },
			}),
		);
		const claudeTargets = plan.targets.filter((t) => t.config.model === "claude");
		expect(claudeTargets.map((t) => t.config.webSearch)).toEqual([false, true]);
		for (const target of claudeTargets) {
			expect(target).toMatchObject({ intervalHours: 24, replication: 1 });
		}
	});

	it("spends a slot per model, so two premium models add two grounded targets", () => {
		const targets = parseScrapeTargets(
			"chatgpt:brightdata:online,claude:anthropic-api:claude-sonnet-4-6,claude:anthropic-api:claude-sonnet-4-6:online,grok:openrouter:x-ai/grok-4.5:online",
		);
		const plan = resolvePromptRunPlan(
			cloudInput({
				scrapeTargets: targets,
				brand: { enabledModels: ["chatgpt"], delayOverrideHours: null },
				prompt: { premiumModels: ["claude", "grok"] },
			}),
		);
		const grounded = plan.targets.filter((t) => t.config.webSearch && t.config.provider !== "brightdata");
		expect(grounded.map((t) => t.config.model).sort()).toEqual(["claude", "grok"]);
		for (const target of grounded) {
			expect(target).toMatchObject({ intervalHours: 24, replication: 1 });
		}
	});

	it("ignores a premium model the instance configures no grounded target for", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({
				brand: { enabledModels: ["chatgpt"], delayOverrideHours: null },
				prompt: { premiumModels: ["grok"] },
			}),
		);
		expect(plan.targets.some((t) => t.config.model === "grok")).toBe(false);
	});

	it("a grounded assignment on a plan without a pool is inert, but the pick still runs", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({
				entitlements: cloudEntitlements("basic"),
				brand: { enabledModels: ["chatgpt", "claude"], delayOverrideHours: null },
				prompt: { premiumModels: ["claude"] },
			}),
		);
		const claudeTargets = plan.targets.filter((t) => t.config.model === "claude");
		expect(claudeTargets.map((t) => t.config.webSearch)).toEqual([false]);
	});

	it("never resolves a pick to the grounded target, even without an ungrounded one", () => {
		const groundedOnly = parseScrapeTargets("chatgpt:brightdata:online,claude:anthropic-api:claude-sonnet-4-6:online");
		const plan = resolvePromptRunPlan(
			cloudInput({
				scrapeTargets: groundedOnly,
				brand: { enabledModels: ["chatgpt", "claude"], delayOverrideHours: null },
			}),
		);
		expect(plan.targets.map((t) => t.config.model)).toEqual(["chatgpt"]);
	});

	it("an unentitled org runs nothing and parks the chain", () => {
		const plan = resolvePromptRunPlan(cloudInput({ entitlements: NO_PLAN_ENTITLEMENTS }));
		expect(plan.targets).toEqual([]);
		expect(plan.rescheduleHours).toBeNull();
	});

	it("a paused (past-due beyond grace) org runs nothing", () => {
		const paused = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "past_due", plan: "pro", periodEnd: new Date("2026-06-01") },
			premiumAddonQuantity: 0,
			overrides: null,
			now: NOW,
		});
		expect(resolvePromptRunPlan(cloudInput({ entitlements: paused })).targets).toEqual([]);
	});

	it("a prompt outside the tracked-prompt pool runs nothing", () => {
		expect(resolvePromptRunPlan(cloudInput({ withinPromptPool: false })).targets).toEqual([]);
	});

	it("runs only the premium models it is handed, since the pool already trimmed them", () => {
		// brand-plans decides what the pool covers, so an empty list here means the
		// slots ran out and the picks should still run.
		const trimmed = resolvePromptRunPlan(cloudInput({ prompt: { premiumModels: [] } }));
		expect(trimmed.targets.every((t) => !(t.config.model === "claude" && t.config.webSearch))).toBe(true);
		expect(trimmed.targets.map((t) => t.config.model)).toEqual(["chatgpt", "perplexity"]);
	});

	it("null picks default to the first available menu platforms", () => {
		const plan = resolvePromptRunPlan(cloudInput({ brand: { enabledModels: null, delayOverrideHours: null } }));
		expect(plan.targets.map((t) => t.config.model)).toEqual([
			"chatgpt",
			"google-ai-mode",
			"google-ai-overview",
			"copilot",
		]);
	});

	it("custom-plan sampling and extras apply", () => {
		const custom = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "active", plan: "business", periodEnd: new Date("2026-09-01") },
			premiumAddonQuantity: 0,
			overrides: { standardRunsPerDay: 7, extraPlatforms: ["deepseek"], platformPicks: 5 },
			now: NOW,
		});
		const plan = resolvePromptRunPlan(
			cloudInput({
				entitlements: custom,
				brand: { enabledModels: ["chatgpt", "deepseek"], delayOverrideHours: null },
			}),
		);
		expect(plan.targets.map((t) => t.config.model).sort()).toEqual(["chatgpt", "deepseek"]);
		expect(plan.targets[0].intervalHours).toBeCloseTo(24 / 7);
	});

	it("custom sampling lowers the clamp floor for overrides too", () => {
		const custom = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "active", plan: "business", periodEnd: new Date("2026-09-01") },
			premiumAddonQuantity: 0,
			overrides: { standardRunsPerDay: 7 },
			now: NOW,
		});
		const tooFast = resolvePromptRunPlan(
			cloudInput({ entitlements: custom, brand: { enabledModels: ["chatgpt"], delayOverrideHours: 2 } }),
		);
		expect(tooFast.targets[0].intervalHours).toBeCloseTo(24 / 7);

		const slower = resolvePromptRunPlan(
			cloudInput({ entitlements: custom, brand: { enabledModels: ["chatgpt"], delayOverrideHours: 4 } }),
		);
		expect(slower.targets[0].intervalHours).toBe(4);
	});

	it("a custom premiumRunsPerDay speeds up the metered platforms", () => {
		const custom = resolveEntitlements({
			mode: "cloud",
			subscription: { status: "active", plan: "pro", periodEnd: new Date("2026-09-01") },
			premiumAddonQuantity: 0,
			overrides: { premiumRunsPerDay: 2 },
			now: NOW,
		});
		const plan = resolvePromptRunPlan(
			cloudInput({ entitlements: custom, brand: { enabledModels: ["chatgpt", "claude"], delayOverrideHours: null } }),
		);
		expect(plan.targets.find((t) => t.config.model === "claude")?.intervalHours).toBe(12);
	});
});

describe("dueness metering", () => {
	const plan = {
		config: { model: "chatgpt", provider: "brightdata", webSearch: true },
		intervalHours: 6,
		replication: 1,
	};

	it("never-run targets are due", () => {
		expect(isTargetDue(plan, undefined, NOW)).toBe(true);
	});

	it("a target run a full interval ago is due, one run recently is not", () => {
		expect(isTargetDue(plan, new Date(NOW.getTime() - 6 * 3600 * 1000), NOW)).toBe(true);
		expect(isTargetDue(plan, new Date(NOW.getTime() - 1 * 3600 * 1000), NOW)).toBe(false);
	});

	it("tolerates cadence jitter but not half-interval early fires", () => {
		const tolerance = dueToleranceMs(6);
		expect(isTargetDue(plan, new Date(NOW.getTime() - (6 * 3600 * 1000 - tolerance)), NOW)).toBe(true);
		expect(isTargetDue(plan, new Date(NOW.getTime() - 3 * 3600 * 1000), NOW)).toBe(false);
	});

	it("selectDueTargets keys claude base and web separately", () => {
		const base = {
			config: { model: "claude", provider: "anthropic-api", webSearch: false },
			intervalHours: 24,
			replication: 1,
		};
		const web = {
			config: { model: "claude", provider: "anthropic-api", webSearch: true },
			intervalHours: 24,
			replication: 1,
		};
		const lastRuns = new Map([[targetKey(web.config), new Date(NOW.getTime() - 3600 * 1000)]]);
		const due = selectDueTargets([base, web], lastRuns, NOW);
		expect(due).toEqual([base]);
	});

	it("the maintenance-expedite oversampling fix: an early fire only runs the stale target", () => {
		const fresh = { ...plan, config: { ...plan.config, model: "perplexity" } };
		const lastRuns = new Map([
			[targetKey(plan.config), new Date(NOW.getTime() - 26 * 3600 * 1000)], // broken, stale
			[targetKey(fresh.config), new Date(NOW.getTime() - 1 * 3600 * 1000)], // healthy, fresh
		]);
		expect(selectDueTargets([plan, fresh], lastRuns, NOW).map((t) => t.config.model)).toEqual(["chatgpt"]);
	});
});

describe("dailyRunCeiling", () => {
	it("is null for unlimited entitlements", () => {
		expect(dailyRunCeiling(UNLIMITED_ENTITLEMENTS)).toBeNull();
	});

	it("scales with plan limits with 1.5x headroom", () => {
		// pro: 150 prompts × 4 picks × 4 runs × 1 replication + 20 premium slots
		expect(dailyRunCeiling(cloudEntitlements("pro"))).toBe(Math.ceil(1.5 * (150 * 4 * 4 + 20)));
	});

	it("counts a custom premium cadence", () => {
		const custom = cloudEntitlements("pro", { overrides: { premiumRunsPerDay: 2 } });
		expect(dailyRunCeiling(custom)).toBe(Math.ceil(1.5 * (150 * 4 * 4 + 20 * 2)));
	});
});
