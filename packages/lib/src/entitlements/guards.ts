/**
 * Write-time enforcement, shared by the web server functions and the /api/v1
 * handlers so the two surfaces cannot drift.
 *
 * Two kinds of limit share one vocabulary here. Plan limits answer to the org's
 * entitlements and skip their queries when those are unlimited; the flat caps
 * (MAX_PROMPTS, MAX_COMPETITORS) are product-wide and apply with no plan at all.
 * Both speak in `WriteDecision`, so a caller refuses a write the same way
 * whichever kind said no.
 *
 * Shape: pure decide* functions (inputs → verdict) that the tests exercise
 * exhaustively, wrapped by assert* helpers that load what the decision needs.
 *
 * Downgrade policy: these guards only block *adding* beyond a limit. Anything
 * already over a limit is left alone — the worker's run policy stops running the
 * overage, oldest-first wins.
 */

import type { Entitlements } from "@workspace/config/entitlements";
import { MAX_SELF_SERVE_BRANDS, premiumPairings, premiumSlotsUsed } from "@workspace/config/plans";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { MAX_COMPETITORS, MAX_PROMPTS } from "../constants";
import { db } from "../db/db";
import { brands, competitors, prompts } from "../db/schema";
import { getOrgEntitlements, getOrgEntitlementsMap } from "./service";

export type WriteDenialCode =
	| "no-active-plan"
	| "brand-limit"
	| "prompt-limit"
	| "platform-not-in-plan"
	| "platform-picks-exceeded"
	| "premium-not-in-plan"
	| "premium-pool-exhausted"
	| "cadence-faster-than-plan"
	| "prompt-cap"
	| "competitor-cap";

/**
 * Thrown by the assert* helpers. `status`/`error` are the HTTP response /api/v1
 * renders; server functions surface `message` directly. Having no plan at all
 * is a payment problem; every other denial is a request that conflicts with a
 * limit the caller could satisfy by asking for less.
 */
export class WriteDeniedError extends Error {
	readonly code: WriteDenialCode;
	readonly status: number;
	readonly error: string;

	constructor(code: WriteDenialCode, message: string) {
		super(message);
		this.name = "WriteDeniedError";
		this.code = code;
		this.status = code === "no-active-plan" ? 402 : 409;
		this.error = code === "no-active-plan" ? "Payment Required" : "Conflict";
	}
}

export type WriteDecision = { allowed: true } | { allowed: false; code: WriteDenialCode; message: string };

const ALLOWED: WriteDecision = { allowed: true };

function deny(code: WriteDenialCode, message: string): WriteDecision {
	return { allowed: false, code, message };
}

function requireActivePlan(entitlements: Entitlements): WriteDecision | null {
	if (entitlements.unlimited) return ALLOWED;
	if (entitlements.standing === "none") {
		return deny("no-active-plan", "An active subscription is required.");
	}
	return null;
}

export function decideBrandCreate(entitlements: Entitlements, currentBrandCount: number): WriteDecision {
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (entitlements.maxBrands !== null && currentBrandCount >= entitlements.maxBrands) {
		// Only point at an upgrade when one actually sells more brands; at the top
		// of the ladder that would send a customer looking for a tier that does
		// not exist.
		const included = `Your plan includes ${entitlements.maxBrands} brand${entitlements.maxBrands === 1 ? "" : "s"}.`;
		return deny(
			"brand-limit",
			entitlements.maxBrands < MAX_SELF_SERVE_BRANDS
				? `${included} Upgrade to add more.`
				: `${included} Talk to us about a custom plan to track more.`,
		);
	}
	return ALLOWED;
}

/**
 * Blocks adding rows, not the brand's current size. Brands can already be over
 * the cap because the admin API ignores it, and the editor resubmits every row
 * on each save — blocking those saves would leave the brand uneditable.
 */
export function decidePromptCap(existing: number, adding: number): WriteDecision {
	if (adding <= 0 || existing + adding <= MAX_PROMPTS) return ALLOWED;
	return deny("prompt-cap", `A brand may have at most ${MAX_PROMPTS} prompts (this one has ${existing}).`);
}

export function decideCompetitorCap(resulting: number): WriteDecision {
	if (resulting <= MAX_COMPETITORS) return ALLOWED;
	return deny(
		"competitor-cap",
		`A brand may have at most ${MAX_COMPETITORS} competitors (this would leave ${resulting}).`,
	);
}

/** Adding or re-enabling prompts consumes the org-wide tracked-prompt pool. */
export function decidePromptAdd(
	entitlements: Entitlements,
	currentEnabledPrompts: number,
	adding: number,
): WriteDecision {
	if (adding <= 0) return ALLOWED;
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (entitlements.maxPrompts !== null && currentEnabledPrompts + adding > entitlements.maxPrompts) {
		const remaining = Math.max(0, entitlements.maxPrompts - currentEnabledPrompts);
		return deny(
			"prompt-limit",
			`Your plan tracks up to ${entitlements.maxPrompts} prompts across this organization (${remaining} remaining). Disable other prompts or upgrade.`,
		);
	}
	return ALLOWED;
}

/** Brand platform picks: every model must be on the plan menu, within the pick count. */
export function decideEnabledModels(entitlements: Entitlements, requestedModels: string[]): WriteDecision {
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
 * Tracking a prompt on a premium model spends one pairing from the org's pool,
 * and a prompt tracked on two premium models spends two — so `adding` counts
 * pairings rather than prompts.
 */
export function decidePremiumAssign(
	entitlements: Entitlements,
	currentAssignedEnabled: number,
	adding: number,
): WriteDecision {
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
			`Your plan covers ${premiumPairings(entitlements.premiumPool)} (${remaining} remaining). Buy more on the billing page or unassign others.`,
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
export function decideCadenceOverride(entitlements: Entitlements, requestedDelayHours: number | null): WriteDecision {
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

/**
 * Turn a decision into the thrown form. Exported so a caller that already holds
 * entitlements can use the pure decide* functions directly and still raise the
 * same error every other write path raises.
 */
export function assertAllowed(decision: WriteDecision): void {
	if (!decision.allowed) throw new WriteDeniedError(decision.code, decision.message);
}

// ---------------------------------------------------------------------------
// Usage counts (cloud-only paths; every assert below skips them when unlimited)
// ---------------------------------------------------------------------------

export async function countBrandsByOrg(orgIds: string[]): Promise<Map<string, number>> {
	if (orgIds.length === 0) return new Map();
	const rows = await db
		.select({ organizationId: brands.organizationId, value: count() })
		.from(brands)
		.where(inArray(brands.organizationId, orgIds))
		.groupBy(brands.organizationId);
	return new Map(rows.map((row) => [row.organizationId, row.value]));
}

export async function countOrgBrands(organizationId: string): Promise<number> {
	return (await countBrandsByOrg([organizationId])).get(organizationId) ?? 0;
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
 * Premium pairings the org has spent: one per prompt/model pair on enabled prompts,
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

/**
 * Load the org's entitlements once, then run `decide` against them. Unlimited
 * entitlements return before `decide` runs, so the usage counts a decision needs
 * are never queried outside cloud.
 */
async function withEntitlements(
	organizationId: string,
	decide: (entitlements: Entitlements) => WriteDecision[] | Promise<WriteDecision[]>,
): Promise<void> {
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return;
	for (const decision of await decide(entitlements)) assertAllowed(decision);
}

export async function assertCanCreateBrand(organizationId: string): Promise<void> {
	await withEntitlements(organizationId, async (entitlements) => [
		decideBrandCreate(entitlements, await countOrgBrands(organizationId)),
	]);
}

/**
 * The same verdict assertCanCreateBrand raises, returned instead of thrown, for
 * any number of orgs at once. UI that offers brand creation asks this first so a
 * customer meets the limit before filling in a form, rather than as an error on
 * the last step of one.
 */
export async function checkBrandCreate(orgIds: string[]): Promise<Map<string, WriteDecision>> {
	const entitlementsByOrg = await getOrgEntitlementsMap(orgIds);
	const limited = orgIds.filter((orgId) => !entitlementsByOrg.get(orgId)?.unlimited);
	const counts = await countBrandsByOrg(limited);
	const decisions = new Map<string, WriteDecision>();
	for (const orgId of orgIds) {
		const entitlements = entitlementsByOrg.get(orgId);
		// getOrgEntitlementsMap answers for every requested id; the fallback narrows.
		decisions.set(orgId, entitlements ? decideBrandCreate(entitlements, counts.get(orgId) ?? 0) : ALLOWED);
	}
	return decisions;
}

/** Guard creating `adding` new enabled prompts (or re-enabling that many). */
export async function assertCompetitorCap(brandId: string, adding: number): Promise<void> {
	if (adding <= 0) return;
	const [row] = await db.select({ value: count() }).from(competitors).where(eq(competitors.brandId, brandId));
	assertAllowed(decideCompetitorCap((row?.value ?? 0) + adding));
}

export async function assertCanAddPrompts(organizationId: string, adding: number): Promise<void> {
	if (adding <= 0) return;
	await withEntitlements(organizationId, async (entitlements) => [
		decidePromptAdd(entitlements, await countOrgEnabledPrompts(organizationId), adding),
	]);
}

export async function assertEnabledModelsAllowed(organizationId: string, requestedModels: string[]): Promise<void> {
	await withEntitlements(organizationId, (entitlements) => [decideEnabledModels(entitlements, requestedModels)]);
}

export async function assertCadenceAllowed(organizationId: string, requestedDelayHours: number | null): Promise<void> {
	await withEntitlements(organizationId, (entitlements) => [decideCadenceOverride(entitlements, requestedDelayHours)]);
}

/**
 * What a prompts save adds to the org's pools: enabled prompts and premium
 * prompt/model pairings. Both are net figures — a save that disables as many
 * prompts as it enables adds nothing and needs no permission.
 */
export interface PromptSaveDelta {
	prompts: number;
	premiumPairings: number;
}

export interface PromptPoolState {
	enabled: boolean;
	premiumModels: readonly string[];
}

/** The pool-relevant shape of a planned save: an update knows what it replaces. */
export interface PromptSavePools {
	updates: readonly { before: PromptPoolState; after: PromptPoolState }[];
	inserts: readonly { after: PromptPoolState }[];
}

export function promptSaveDelta(plan: PromptSavePools): PromptSaveDelta {
	const before = plan.updates.map((row) => row.before);
	const after = [...plan.updates, ...plan.inserts].map((row) => row.after);
	const enabled = (states: PromptPoolState[]) => states.filter((state) => state.enabled).length;
	return {
		prompts: enabled(after) - enabled(before),
		premiumPairings: premiumSlotsUsed(after) - premiumSlotsUsed(before),
	};
}

export async function assertPromptSaveAllowed(organizationId: string, delta: PromptSaveDelta): Promise<void> {
	if (delta.prompts <= 0 && delta.premiumPairings <= 0) return;
	await withEntitlements(organizationId, async (entitlements) => {
		const [enabledPrompts, assignedPremium] = await Promise.all([
			delta.prompts > 0 ? countOrgEnabledPrompts(organizationId) : 0,
			delta.premiumPairings > 0 ? countOrgAssignedPremiumSlots(organizationId) : 0,
		]);
		return [
			decidePromptAdd(entitlements, enabledPrompts, delta.prompts),
			decidePremiumAssign(entitlements, assignedPremium, delta.premiumPairings),
		];
	});
}
