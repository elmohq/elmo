/**
 * Entitlement resolution (§7). Entitlements are the billing ceilings applied to
 * the config cascade — read here, clamped by the resolver. Non-cloud modes are
 * unlimited (whitelabel/local/demo behaviour is unchanged by this plan); cloud
 * reads the org's planKey + overrides from `organization_settings`, and an org
 * with no active plan sees a zero state so nothing schedules (#346).
 */
import { getDeploymentModeFromEnv } from "@workspace/config/env";
import { PLANS, type PlanEntitlements, type PlanKey, UNLIMITED_COUNT } from "@workspace/config/plans";
import type { DeploymentMode } from "@workspace/config/types";
import { eq } from "drizzle-orm";

export interface Entitlements extends PlanEntitlements {
	planKey: string | null;
}

/**
 * Non-cloud (and, pre-Stripe, the "everything allowed" baseline): every nullable
 * ceiling is `null` (unlimited), counts are effectively unlimited, flags open.
 */
export const UNLIMITED_ENTITLEMENTS: Entitlements = {
	planKey: null,
	maxBrands: null,
	maxPromptsPerOrg: null,
	maxCompetitorsPerBrand: null,
	standardModelPicks: null,
	standardModelMenu: null,
	claudePromptPool: UNLIMITED_COUNT,
	maxRunsPerDay: null,
	allowWebSearchApiTargets: true,
	allowCustomTargets: true,
};

/**
 * A cloud org with no active plan: nothing is permitted, so nothing schedules
 * (the paywall state, #346). Not the same as unlimited — every ceiling is 0 /
 * empty and both capability flags are off.
 */
export const ZERO_ENTITLEMENTS: Entitlements = {
	planKey: null,
	maxBrands: 0,
	maxPromptsPerOrg: 0,
	maxCompetitorsPerBrand: 0,
	standardModelPicks: 0,
	standardModelMenu: [],
	claudePromptPool: 0,
	maxRunsPerDay: { "*": 0 },
	allowWebSearchApiTargets: false,
	allowCustomTargets: false,
};

/**
 * Deep-merge staff overrides onto a plan. Only `maxRunsPerDay` is a nested
 * (per-model) map and is merged key-by-key; every other field is a scalar and
 * shallow-overrides.
 */
export function mergeEntitlements(base: Entitlements, overrides: Partial<Entitlements>): Entitlements {
	const merged: Entitlements = { ...base, ...overrides };
	if (overrides.maxRunsPerDay && base.maxRunsPerDay) {
		merged.maxRunsPerDay = { ...base.maxRunsPerDay, ...overrides.maxRunsPerDay };
	}
	return merged;
}

/**
 * Pure entitlement resolution — the whole decision without env or DB reads, so
 * it is fully unit-testable. Non-cloud → unlimited; cloud with a known plan →
 * plan ⊕ overrides; cloud with no/unknown plan → zero state.
 */
export function resolveEntitlements(input: {
	mode: DeploymentMode;
	planKey: string | null;
	overrides: Partial<Entitlements> | null;
}): Entitlements {
	if (input.mode !== "cloud") return UNLIMITED_ENTITLEMENTS;
	if (!input.planKey || !(input.planKey in PLANS)) {
		return { ...ZERO_ENTITLEMENTS, planKey: input.planKey };
	}
	const base: Entitlements = { planKey: input.planKey, ...PLANS[input.planKey as PlanKey] };
	return input.overrides ? mergeEntitlements(base, input.overrides) : base;
}

/**
 * The org's row from `organization_settings`, or null. Loaded via dynamic
 * import so this module's DB dependency never enters the graph on the non-cloud
 * (env-only) path — importing `entitlements` stays free of a live pool.
 */
async function loadOrgSettings(
	orgId: string,
): Promise<{ planKey: string | null; entitlementOverrides: Partial<Entitlements> | null } | null> {
	// Explicit .js extensions: dynamic import() resolves as ESM even from a
	// CJS-form file, so the worker's NodeNext typecheck requires them.
	const { db } = await import("../db/db.js");
	const { organizationSettings } = await import("../db/schema.js");
	const rows = await db
		.select({ planKey: organizationSettings.planKey, entitlementOverrides: organizationSettings.entitlementOverrides })
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, orgId))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	return {
		planKey: row.planKey,
		entitlementOverrides: (row.entitlementOverrides as Partial<Entitlements> | null) ?? null,
	};
}

/**
 * Resolve an org's effective entitlements for the current deployment mode.
 * Non-cloud short-circuits to unlimited without touching the DB.
 */
export async function getEntitlements(orgId: string): Promise<Entitlements> {
	const mode = getDeploymentModeFromEnv();
	if (mode !== "cloud") return resolveEntitlements({ mode, planKey: null, overrides: null });
	const settings = await loadOrgSettings(orgId);
	return resolveEntitlements({
		mode,
		planKey: settings?.planKey ?? null,
		overrides: settings?.entitlementOverrides ?? null,
	});
}
