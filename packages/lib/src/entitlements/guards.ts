/**
 * Write-time plan enforcement, shared by the web server functions and the
 * /api/v1 handlers so the two surfaces cannot drift.
 *
 * Shape: pure decide* functions (entitlements + usage counts → verdict) that
 * the tests exercise exhaustively, wrapped by assert* helpers that load
 * entitlements and counts. Every assert short-circuits before any query when
 * entitlements are unlimited — non-cloud deployments keep exactly their
 * current behavior, including their current absence of server-side limits.
 *
 * Downgrade policy: these guards only block *adding* beyond a limit. Resources
 * already over a limit (after a downgrade) are never deleted or mutated here —
 * the worker's run policy simply stops running the overage, oldest-first wins.
 */

import type { Entitlements } from "@workspace/config/entitlements";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { brands, prompts } from "../db/schema";
import { getOrgEntitlements } from "./service";

export type EntitlementDenialCode =
	| "no-active-plan"
	| "brand-limit"
	| "prompt-limit"
	| "platform-not-in-plan"
	| "platform-picks-exceeded"
	| "premium-not-in-plan"
	| "premium-pool-exhausted"
	| "cadence-faster-than-plan";

/**
 * Thrown by the assert* helpers. `status`/`error` are the HTTP response /api/v1
 * renders; server functions surface `message` directly. Having no plan at all
 * is a payment problem; every other denial is a request that conflicts with
 * the limits of the plan the org does have.
 */
export class EntitlementError extends Error {
	readonly code: EntitlementDenialCode;
	readonly status: number;
	readonly error: string;

	constructor(code: EntitlementDenialCode, message: string) {
		super(message);
		this.name = "EntitlementError";
		this.code = code;
		this.status = code === "no-active-plan" ? 402 : 409;
		this.error = code === "no-active-plan" ? "Payment Required" : "Conflict";
	}
}

export type EntitlementDecision = { allowed: true } | { allowed: false; code: EntitlementDenialCode; message: string };

const ALLOWED: EntitlementDecision = { allowed: true };

function deny(code: EntitlementDenialCode, message: string): EntitlementDecision {
	return { allowed: false, code, message };
}

function requireActivePlan(entitlements: Entitlements): EntitlementDecision | null {
	if (entitlements.unlimited) return ALLOWED;
	if (entitlements.standing === "none") {
		return deny("no-active-plan", "An active subscription is required.");
	}
	return null;
}

export function decideBrandCreate(entitlements: Entitlements, currentBrandCount: number): EntitlementDecision {
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (entitlements.maxBrands !== null && currentBrandCount >= entitlements.maxBrands) {
		// No self-serve plan sells a second brand, so "upgrade" would send a
		// customer looking for a tier that does not exist.
		return deny(
			"brand-limit",
			entitlements.maxBrands === 1
				? "Your plan tracks one brand. Talk to us about a custom plan to track more."
				: `Your plan includes ${entitlements.maxBrands} brands. Talk to us about a custom plan to track more.`,
		);
	}
	return ALLOWED;
}

/** Adding or re-enabling prompts consumes the org-wide tracked-prompt pool. */
export function decidePromptAdd(
	entitlements: Entitlements,
	currentEnabledPrompts: number,
	adding: number,
): EntitlementDecision {
	if (adding <= 0) return ALLOWED;
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (entitlements.maxPrompts !== null && currentEnabledPrompts + adding > entitlements.maxPrompts) {
		const remaining = Math.max(0, entitlements.maxPrompts - currentEnabledPrompts);
		return deny(
			"prompt-limit",
			`Your plan tracks up to ${entitlements.maxPrompts} prompts across this workspace (${remaining} remaining). Disable other prompts or upgrade.`,
		);
	}
	return ALLOWED;
}

/** Brand platform picks: every model must be on the plan menu, within the pick count. */
export function decideEnabledModels(entitlements: Entitlements, requestedModels: string[]): EntitlementDecision {
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (entitlements.platformMenu !== null) {
		const menu = new Set(entitlements.platformMenu);
		const offMenu = requestedModels.filter((model) => !menu.has(model));
		if (offMenu.length > 0) {
			return deny("platform-not-in-plan", `Not available on your plan: ${offMenu.join(", ")}.`);
		}
	}
	if (entitlements.platformPicks !== null && requestedModels.length > entitlements.platformPicks) {
		return deny(
			"platform-picks-exceeded",
			`Your plan tracks up to ${entitlements.platformPicks} platform${entitlements.platformPicks === 1 ? "" : "s"} per brand.`,
		);
	}
	return ALLOWED;
}

/**
 * Tracking a prompt on a premium model spends a slot from the org's pool, and a
 * prompt tracked on two premium models spends two — the pool is over
 * prompt/model pairs, so `adding` counts pairs rather than prompts.
 */
export function decidePremiumAssign(
	entitlements: Entitlements,
	currentAssignedEnabled: number,
	adding: number,
): EntitlementDecision {
	if (adding <= 0) return ALLOWED;
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (entitlements.premiumPool <= 0) {
		return deny(
			"premium-not-in-plan",
			"Premium tracking — adding a grounded, cited answer to a prompt from a model's own web search — is available on the Pro and Business plans.",
		);
	}
	if (currentAssignedEnabled + adding > entitlements.premiumPool) {
		const remaining = Math.max(0, entitlements.premiumPool - currentAssignedEnabled);
		return deny(
			"premium-pool-exhausted",
			`Your plan covers ${entitlements.premiumPool} premium prompt${entitlements.premiumPool === 1 ? "" : "s"} (${remaining} remaining). Buy more on the billing page or unassign others.`,
		);
	}
	return ALLOWED;
}

/**
 * A cadence override may slow sampling down, never speed it past the plan
 * rate — so the floor moves with the plan (custom plans with higher
 * standardRunsPerDay allow proportionally faster overrides). Null clears the
 * override back to the plan cadence.
 */
export function decideCadenceOverride(
	entitlements: Entitlements,
	requestedDelayHours: number | null,
): EntitlementDecision {
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (requestedDelayHours === null) return ALLOWED;
	const runsPerDay = entitlements.standardRunsPerDay;
	// Multiply instead of comparing against 24/runsPerDay so fractional floors
	// (e.g. 7×/day) can't be rejected by float noise at exactly the floor.
	if (runsPerDay === null || requestedDelayHours * runsPerDay >= 24) return ALLOWED;
	return deny(
		"cadence-faster-than-plan",
		`Your plan samples ${runsPerDay} time${runsPerDay === 1 ? "" : "s"} per day; a cadence override can only slow that down.`,
	);
}

function assertAllowed(decision: EntitlementDecision): void {
	if (!decision.allowed) throw new EntitlementError(decision.code, decision.message);
}

// ---------------------------------------------------------------------------
// Usage counts (cloud-only paths; every assert below skips them when unlimited)
// ---------------------------------------------------------------------------

export async function countOrgBrands(organizationId: string): Promise<number> {
	const [row] = await db.select({ value: count() }).from(brands).where(eq(brands.organizationId, organizationId));
	return row?.value ?? 0;
}

export async function countOrgEnabledPrompts(organizationId: string): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.enabled, true)));
	return row?.value ?? 0;
}

/**
 * Premium slots the org has spent: one per prompt/model pair on enabled prompts,
 * so a prompt tracked on two premium models counts twice. Picking the same model
 * ungrounded is a platform pick and never counts here.
 */
export async function countOrgAssignedPremiumSlots(organizationId: string): Promise<number> {
	const [row] = await db
		.select({ value: sql<string>`coalesce(sum(cardinality(${prompts.premiumModels})), 0)` })
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.enabled, true)));
	return Number(row?.value ?? 0);
}

// ---------------------------------------------------------------------------
// Asserts wired into write paths
// ---------------------------------------------------------------------------

async function withEntitlements(
	organizationId: string,
	decide: (entitlements: Entitlements) => EntitlementDecision | Promise<EntitlementDecision>,
): Promise<void> {
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return;
	assertAllowed(await decide(entitlements));
}

export async function assertCanCreateBrand(organizationId: string): Promise<void> {
	await withEntitlements(organizationId, async (entitlements) =>
		decideBrandCreate(entitlements, await countOrgBrands(organizationId)),
	);
}

/** Guard creating `adding` new enabled prompts (or re-enabling that many). */
export async function assertCanAddPrompts(organizationId: string, adding: number): Promise<void> {
	if (adding <= 0) return;
	await withEntitlements(organizationId, async (entitlements) =>
		decidePromptAdd(entitlements, await countOrgEnabledPrompts(organizationId), adding),
	);
}

export async function assertEnabledModelsAllowed(organizationId: string, requestedModels: string[]): Promise<void> {
	await withEntitlements(organizationId, (entitlements) => decideEnabledModels(entitlements, requestedModels));
}

export async function assertCanAssignPremium(organizationId: string, adding: number): Promise<void> {
	if (adding <= 0) return;
	await withEntitlements(organizationId, async (entitlements) =>
		decidePremiumAssign(entitlements, await countOrgAssignedPremiumSlots(organizationId), adding),
	);
}

export async function assertCadenceAllowed(organizationId: string, requestedDelayHours: number | null): Promise<void> {
	await withEntitlements(organizationId, (entitlements) => decideCadenceOverride(entitlements, requestedDelayHours));
}
