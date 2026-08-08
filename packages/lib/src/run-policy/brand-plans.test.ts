import { type Entitlements, resolveEntitlements, UNLIMITED_ENTITLEMENTS } from "@workspace/config/entitlements";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { resolveBrandPromptRunPlans, type ResolveBrandPromptRunPlansInput } from "./brand-plans";

const NOW = new Date("2026-08-05T12:00:00Z");

const CLOUD_TARGETS = parseScrapeTargets(
	["chatgpt:brightdata:online", "perplexity:brightdata:online", "claude:anthropic-api:claude-sonnet-4-6"].join(","),
);

function cloudEntitlements(plan: string, overrides?: Record<string, unknown>): Entitlements {
	return resolveEntitlements({
		mode: "cloud",
		subscription: { status: "active", plan, periodEnd: new Date("2026-09-01") },
		claudeAddonQuantity: 0,
		overrides: overrides ?? null,
		now: NOW,
	});
}

/** Enabled prompts, oldest first — the order the pools are filled in. */
function orgPrompts(count: number, claudeMode: "base" | null = null) {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${i + 1}`,
		createdAt: new Date(Date.UTC(2026, 0, i + 1)),
		claudeMode,
	}));
}

function input(overrides: Partial<ResolveBrandPromptRunPlansInput>): ResolveBrandPromptRunPlansInput {
	return {
		mode: "cloud",
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

	it("parks prompts pushed out of the tracked-prompt pool by a downgrade, oldest first", () => {
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
		// Newest loses: no targets and no reschedule, so the chain parks.
		expect(plans.get("p3")?.targets).toEqual([]);
		expect(plans.get("p3")?.rescheduleHours).toBeNull();
	});

	it("fills the Claude pool oldest-first across the org, not per brand", () => {
		const prompts = orgPrompts(3, "base");
		// One brand's prompts, but the pool is sized org-wide.
		const plans = resolveBrandPromptRunPlans(
			input({
				entitlements: cloudEntitlements("pro", { claudePoolIncluded: 1 }),
				orgPrompts: prompts,
				prompts,
			}),
		);

		const claudeTargets = (id: string) => plans.get(id)?.targets.filter((t) => t.config.model === "claude") ?? [];
		expect(claudeTargets("p1")).toHaveLength(1);
		expect(claudeTargets("p2")).toEqual([]);
		expect(claudeTargets("p3")).toEqual([]);
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
				mode: "local",
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
