/**
 * Billing plans and model classes (issue #344).
 *
 * A plan is a set of entitlement *ceilings* keyed by planKey. It is applied
 * *to* the config cascade (clamping resolved values), never a participant in
 * it. `null` means unlimited. `getEntitlements` (packages/lib) reads the org's
 * planKey + overrides and deep-merges them onto the matching plan here; #345
 * will swap the planKey source to Stripe.
 */

/**
 * Standard models a brand may pick from (the `standardModelMenu`). Selecting
 * from this menu is the brand-layer operation.
 */
export const STANDARD_MODEL_MENU = [
	"chatgpt",
	"google-ai-mode",
	"google-ai-overview",
	"copilot",
	"perplexity",
	"gemini",
	"qwen",
	"deepseek",
] as const;

/**
 * Models that are not on the standard menu but can be *assigned* at the prompt
 * level within a pool (the Claude-pool mechanic — see A4). Adding one consumes
 * pool headroom.
 */
export const ASSIGNABLE_MODELS = ["claude"] as const;

/**
 * Sentinel for a numeric entitlement that is effectively unlimited but whose
 * type is a plain `number` (so it can still be compared with `<=` at write
 * time). Used for `claudePromptPool` on the custom plan and for non-cloud
 * (unlimited) entitlements.
 */
export const UNLIMITED_COUNT = Number.MAX_SAFE_INTEGER;

/**
 * The per-plan entitlement shape (see §7). `null` = unlimited for the nullable
 * fields; `maxRunsPerDay` is a per-model-class ceiling map (`'*'` default plus
 * model-name overrides) that clamps cascaded values, never supplies them.
 */
export interface PlanEntitlements {
	maxBrands: number | null;
	maxPromptsPerOrg: number | null;
	maxCompetitorsPerBrand: number | null;
	standardModelPicks: number | null;
	standardModelMenu: string[] | null;
	claudePromptPool: number;
	maxRunsPerDay: Record<string, number> | null;
	allowWebSearchApiTargets: boolean;
	allowCustomTargets: boolean;
}

export type PlanKey = "starter" | "pro" | "business" | "custom";

/**
 * Standard cadence ceiling shared by the paid tiers: 4 runs/day for standard
 * models, 1/day for claude. Custom raises the default to 7.
 */
const STANDARD_RUNS_PER_DAY: Record<string, number> = { "*": 4, claude: 1 };

// #344 does not (yet) set a per-plan competitor cap, so maxCompetitorsPerBrand
// stays unlimited (null) pending a product decision; the entitlement field
// exists so enforcement can wire in a number without a shape change.
export const PLANS: Record<PlanKey, PlanEntitlements> = {
	starter: {
		maxBrands: 1,
		maxPromptsPerOrg: 50,
		maxCompetitorsPerBrand: null,
		standardModelPicks: 4,
		standardModelMenu: [...STANDARD_MODEL_MENU],
		claudePromptPool: 0,
		maxRunsPerDay: { ...STANDARD_RUNS_PER_DAY },
		allowWebSearchApiTargets: false,
		allowCustomTargets: false,
	},
	pro: {
		maxBrands: 2,
		maxPromptsPerOrg: 150,
		maxCompetitorsPerBrand: null,
		standardModelPicks: 4,
		standardModelMenu: [...STANDARD_MODEL_MENU],
		claudePromptPool: 20,
		maxRunsPerDay: { ...STANDARD_RUNS_PER_DAY },
		allowWebSearchApiTargets: false,
		allowCustomTargets: false,
	},
	business: {
		maxBrands: 5,
		maxPromptsPerOrg: 350,
		maxCompetitorsPerBrand: null,
		standardModelPicks: 4,
		standardModelMenu: [...STANDARD_MODEL_MENU],
		claudePromptPool: 30,
		maxRunsPerDay: { ...STANDARD_RUNS_PER_DAY },
		allowWebSearchApiTargets: false,
		allowCustomTargets: false,
	},
	custom: {
		maxBrands: null,
		maxPromptsPerOrg: null,
		maxCompetitorsPerBrand: null,
		standardModelPicks: null,
		standardModelMenu: null,
		claudePromptPool: UNLIMITED_COUNT,
		maxRunsPerDay: { "*": 7, claude: 1 },
		allowWebSearchApiTargets: true,
		allowCustomTargets: true,
	},
};
