import {
	NO_PLAN_ENTITLEMENTS,
	UNLIMITED_ENTITLEMENTS,
	resolveEntitlements,
	type Entitlements,
} from "@workspace/config/entitlements";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { RUNS_PER_PROMPT } from "../constants";
import {
	dailyRunCeiling,
	dueToleranceMs,
	isTargetDue,
	resolvePromptRunPlan,
	selectDueTargets,
	targetKey,
	type ResolveRunPlanInput,
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
		"claude:anthropic-api:claude-sonnet-4-6",
		"claude:anthropic-api:claude-sonnet-4-6:online",
	].join(","),
);

function cloudEntitlements(plan: string, extra?: Partial<Parameters<typeof resolveEntitlements>[0]>): Entitlements {
	return resolveEntitlements({
		mode: "cloud",
		subscription: { status: "active", plan, periodEnd: new Date("2026-09-01") },
		claudeAddonQuantity: 0,
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
		prompt: { claudeMode: null },
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

	it("non-cloud ignores claudeMode — claude runs only if configured in SCRAPE_TARGETS", () => {
		const plan = resolvePromptRunPlan(localInput({ prompt: { claudeMode: "web" } }));
		// claude already present from SCRAPE_TARGETS exactly once, at brand cadence
		const claudeTargets = plan.targets.filter((t) => t.config.model === "claude");
		expect(claudeTargets).toHaveLength(1);
		expect(claudeTargets[0].intervalHours).toBe(24);
		expect(claudeTargets[0].replication).toBe(RUNS_PER_PROMPT);
	});
});

describe("resolvePromptRunPlan: cloud", () => {
	function cloudInput(overrides?: Partial<ResolveRunPlanInput>): ResolveRunPlanInput {
		return {
			mode: "cloud",
			scrapeTargets: CLOUD_TARGETS,
			brand: { enabledModels: ["chatgpt", "perplexity"], delayOverrideHours: null },
			prompt: { claudeMode: null },
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

	it("ignores delayOverrideHours in cloud — cadence is plan-defined", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({ brand: { enabledModels: ["chatgpt"], delayOverrideHours: 1 } }),
		);
		expect(plan.targets[0].intervalHours).toBe(6);
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

	it("claudeMode adds the matching claude target at daily cadence", () => {
		const base = resolvePromptRunPlan(cloudInput({ prompt: { claudeMode: "base" } }));
		const baseClaude = base.targets.find((t) => t.config.model === "claude");
		expect(baseClaude).toMatchObject({ intervalHours: 24, replication: 1 });
		expect(baseClaude?.config.webSearch).toBe(false);

		const web = resolvePromptRunPlan(cloudInput({ prompt: { claudeMode: "web" } }));
		expect(web.targets.find((t) => t.config.model === "claude")?.config.webSearch).toBe(true);
		// Standard 6h cadence still drives the chain.
		expect(web.rescheduleHours).toBe(6);
	});

	it("claude assignment on a plan without a pool is inert", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({ entitlements: cloudEntitlements("basic"), prompt: { claudeMode: "web" } }),
		);
		expect(plan.targets.some((t) => t.config.model === "claude")).toBe(false);
	});

	it("claude never runs as a platform pick", () => {
		const plan = resolvePromptRunPlan(
			cloudInput({ brand: { enabledModels: ["claude", "chatgpt"], delayOverrideHours: null } }),
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
			claudeAddonQuantity: 0,
			overrides: null,
			now: NOW,
		});
		expect(resolvePromptRunPlan(cloudInput({ entitlements: paused })).targets).toEqual([]);
	});

	it("a prompt outside the pool runs nothing; outside the claude pool drops only claude", () => {
		const outOfPool = resolvePromptRunPlan(cloudInput({ withinPromptPool: false }));
		expect(outOfPool.targets).toEqual([]);

		const outOfClaude = resolvePromptRunPlan(
			cloudInput({ prompt: { claudeMode: "web" }, withinClaudePool: false }),
		);
		expect(outOfClaude.targets.some((t) => t.config.model === "claude")).toBe(false);
		expect(outOfClaude.targets.map((t) => t.config.model)).toEqual(["chatgpt", "perplexity"]);
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
			claudeAddonQuantity: 0,
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
});

describe("dueness metering", () => {
	const plan = { config: { model: "chatgpt", provider: "brightdata", webSearch: true }, intervalHours: 6, replication: 1 };

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
		const base = { config: { model: "claude", provider: "anthropic-api", webSearch: false }, intervalHours: 24, replication: 1 };
		const web = { config: { model: "claude", provider: "anthropic-api", webSearch: true }, intervalHours: 24, replication: 1 };
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
		// pro: 150 prompts × 4 picks × 4 runs × 1 replication + 20 claude = 9620 × 1.5
		expect(dailyRunCeiling(cloudEntitlements("pro"))).toBe(Math.ceil(1.5 * (150 * 4 * 4 + 20)));
	});
});
