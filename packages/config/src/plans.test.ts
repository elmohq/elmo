import { describe, expect, it } from "vitest";
import { ASSIGNABLE_MODELS, PLANS, STANDARD_MODEL_MENU, UNLIMITED_COUNT } from "./plans";

describe("PLANS", () => {
	it("defines the four #344 plans", () => {
		expect(Object.keys(PLANS).sort()).toEqual(["business", "custom", "pro", "starter"]);
	});

	it("encodes the starter tier", () => {
		expect(PLANS.starter).toMatchObject({
			maxBrands: 1,
			maxPromptsPerOrg: 50,
			standardModelPicks: 4,
			claudePromptPool: 0,
			maxRunsPerDay: { "*": 4, claude: 1 },
			allowWebSearchApiTargets: false,
			allowCustomTargets: false,
		});
	});

	it("encodes the pro tier", () => {
		expect(PLANS.pro).toMatchObject({
			maxBrands: 2,
			maxPromptsPerOrg: 150,
			standardModelPicks: 4,
			claudePromptPool: 20,
			maxRunsPerDay: { "*": 4, claude: 1 },
		});
	});

	it("encodes the business tier", () => {
		expect(PLANS.business).toMatchObject({
			maxBrands: 5,
			maxPromptsPerOrg: 350,
			standardModelPicks: 4,
			claudePromptPool: 30,
			maxRunsPerDay: { "*": 4, claude: 1 },
		});
	});

	it("encodes the custom tier as unlimited-ish with raised ceilings", () => {
		expect(PLANS.custom).toMatchObject({
			maxBrands: null,
			maxPromptsPerOrg: null,
			standardModelPicks: null,
			standardModelMenu: null,
			claudePromptPool: UNLIMITED_COUNT,
			maxRunsPerDay: { "*": 7, claude: 1 },
			allowWebSearchApiTargets: true,
			allowCustomTargets: true,
		});
	});

	it("gives the paid standard tiers the full standard menu", () => {
		for (const key of ["starter", "pro", "business"] as const) {
			expect(PLANS[key].standardModelMenu).toEqual([...STANDARD_MODEL_MENU]);
		}
	});

	it("always sets a '*' default in every runs-per-day map", () => {
		for (const plan of Object.values(PLANS)) {
			expect(plan.maxRunsPerDay).not.toBeNull();
			expect(plan.maxRunsPerDay?.["*"]).toBeTypeOf("number");
		}
	});
});

describe("model classes", () => {
	it("lists the standard menu and does not include claude", () => {
		expect(STANDARD_MODEL_MENU).toEqual([
			"chatgpt",
			"google-ai-mode",
			"google-ai-overview",
			"copilot",
			"perplexity",
			"gemini",
			"qwen",
			"deepseek",
		]);
		expect(STANDARD_MODEL_MENU).not.toContain("claude");
	});

	it("keeps claude assignable (pool-gated), disjoint from the standard menu", () => {
		expect(ASSIGNABLE_MODELS).toEqual(["claude"]);
		const overlap = ASSIGNABLE_MODELS.filter((model) => (STANDARD_MODEL_MENU as readonly string[]).includes(model));
		expect(overlap).toEqual([]);
	});
});
