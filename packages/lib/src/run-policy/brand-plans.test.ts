import { type Entitlements, resolveEntitlements, UNLIMITED_ENTITLEMENTS } from "@workspace/config/entitlements";
import { formatScrapeTarget, parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { type ResolveBrandPromptRunPlansInput, resolveBrandPromptRunPlans } from "./brand-plans";

const NOW = new Date("2026-08-05T12:00:00Z");

const CLOUD_TARGETS = parseScrapeTargets(
	[
		"chatgpt:brightdata:online",
		"perplexity:brightdata:online",
		"claude:anthropic-api:claude-sonnet-5",
		"claude:anthropic-api:claude-sonnet-5:online",
	].join(","),
);

function cloudEntitlements(plan: string, overrides?: Record<string, unknown>): Entitlements {
	return resolveEntitlements({
		mode: "cloud",
		subscription: { status: "active", plan, periodEnd: new Date("2026-09-01") },
		premiumAddonQuantity: 0,
		overrides: overrides ?? null,
		now: NOW,
	});
}

/** Enabled prompts, oldest first — the order the pools are filled in. */
function orgPrompts(count: number, premiumModels: string[] = []) {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		createdAt: new Date(Date.UTC(2026, 0, i + 1)),
		premiumModels,
	}));
}

function input(overrides: Partial<ResolveBrandPromptRunPlansInput>): ResolveBrandPromptRunPlansInput {
	return {
		scrapeTargets: CLOUD_TARGETS,
		defaultDelayHours: 24,
		entitlements: cloudEntitlements("pro"),
		orgPrompts: [],
		brand: { enabledModels: ["chatgpt"], delayOverrideHours: null },
		prompts: [],
		...overrides,
	};
}

describe("resolveBrandPromptRunPlans", () => {
	it("plans every prompt it is given", () => {
		const prompts = orgPrompts(3);
		const plans = resolveBrandPromptRunPlans(input({ orgPrompts: prompts, prompts }));
		expect([...plans.keys()]).toEqual(["p1", "p2", "p3"]);
	});

	it("stops prompts pushed out of the tracked-prompt pool by a downgrade, oldest first", () => {
		const prompts = orgPrompts(3);
		const plans = resolveBrandPromptRunPlans(
			input({
				entitlements: cloudEntitlements("pro", { maxPrompts: 2 }),
				orgPrompts: prompts,
				prompts,
			}),
		);

		expect(plans.get("p1")?.targets).toHaveLength(1);
		expect(plans.get("p2")?.targets).toHaveLength(1);
		// Newest loses: no targets and no next run queued, so the prompt stops.
		expect(plans.get("p3")?.targets).toEqual([]);
		expect(plans.get("p3")?.rescheduleHours).toBeNull();
	});

	it("fills the premium pool oldest-first across the org, not per brand", () => {
		const prompts = orgPrompts(3, ["claude"]);
		// One brand's prompts, but the pool is sized org-wide.
		const plans = resolveBrandPromptRunPlans(
			input({
				entitlements: cloudEntitlements("pro", { premiumPoolIncluded: 1 }),
				orgPrompts: prompts,
				prompts,
			}),
		);

		// Only the grounded target is pooled; the brand picks no Claude platform here.
		const groundedTargets = (id: string) =>
			plans.get(id)?.targets.filter((t) => t.config.model === "claude" && t.config.webSearch) ?? [];
		expect(groundedTargets("p1")).toHaveLength(1);
		expect(groundedTargets("p2")).toEqual([]);
		expect(groundedTargets("p3")).toEqual([]);
	});

	it("spends a slot per prompt/model pair, so one prompt can exhaust the pool", () => {
		const withGrok = parseScrapeTargets(
			[...CLOUD_TARGETS.map(formatScrapeTarget), "grok:openrouter:x-ai/grok-4.5:online"].join(","),
		);
		// Two models on the oldest prompt uses both slots; the next prompt gets none.
		const prompts = orgPrompts(2, ["claude", "grok"]);
		const plans = resolveBrandPromptRunPlans(
			input({
				scrapeTargets: withGrok,
				entitlements: cloudEntitlements("pro", { premiumPoolIncluded: 2 }),
				orgPrompts: prompts,
				prompts,
			}),
		);

		const grounded = (id: string) =>
			(plans.get(id)?.targets ?? []).filter((t) => t.config.webSearch && t.config.provider !== "brightdata");
		expect(
			grounded("p1")
				.map((t) => t.config.model)
				.sort(),
		).toEqual(["claude", "grok"]);
		expect(grounded("p2")).toEqual([]);
	});

	it("ranks pool position by the whole org, so another brand's older prompts win", () => {
		const all = orgPrompts(3);
		// This brand only owns the newest prompt; the two older ones belong to a
		// sibling brand in the same org and consume the pool first.
		const plans = resolveBrandPromptRunPlans(
			input({
				entitlements: cloudEntitlements("pro", { maxPrompts: 2 }),
				orgPrompts: all,
				prompts: [all[2]],
			}),
		);

		expect([...plans.keys()]).toEqual(["p3"]);
		expect(plans.get("p3")?.targets).toEqual([]);
	});

	it("ignores pool accounting entirely when entitlements are unlimited", () => {
		const prompts = orgPrompts(3);
		const plans = resolveBrandPromptRunPlans(
			input({
				entitlements: UNLIMITED_ENTITLEMENTS,
				// Non-cloud callers read nothing extra and pass no org prompts.
				orgPrompts: [],
				prompts,
				brand: { enabledModels: ["chatgpt"], delayOverrideHours: null },
			}),
		);

		for (const prompt of prompts) {
			expect(plans.get(prompt.id)?.targets).toHaveLength(1);
		}
	});
});
