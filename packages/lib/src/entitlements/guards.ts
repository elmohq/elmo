/**
 * These block only *adding* beyond a limit; anything already over is left to the
 * worker's run policy, oldest-first.
 */

import type { Entitlements } from "@workspace/config/entitlements";
import { MAX_SELF_SERVE_BRANDS, premiumPairings, premiumPlanNames, premiumSlotsUsed } from "@workspace/config/plans";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { MAX_COMPETITORS, MAX_PROMPTS } from "../constants";
import { db } from "../db/db";
import type { DbConnection } from "../db/db-connection";
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

/** No plan is a payment problem; every other denial is satisfiable by asking for less. */
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

/** The editor resubmits every row on save, and a brand can already be over the cap. */
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

/** `adding` counts prompt/model pairings, not prompts. */
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
			`Premium tracking — adding a grounded, cited answer to a prompt from a model's own web search — is available on the ${premiumPlanNames()} plans.`,
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

/** An override may slow sampling but never speed it past the plan rate. Null clears it. */
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

/** For callers that already hold entitlements and run a decide* function directly. */
export function assertAllowed(decision: WriteDecision): void {
	if (!decision.allowed) throw new WriteDeniedError(decision.code, decision.message);
}

export async function countBrandsByOrg(orgIds: string[], conn: DbConnection = db): Promise<Map<string, number>> {
	if (orgIds.length === 0) return new Map();
	const rows = await conn
		.select({ organizationId: brands.organizationId, value: count() })
		.from(brands)
		.where(inArray(brands.organizationId, orgIds))
		.groupBy(brands.organizationId);
	return new Map(rows.map((row) => [row.organizationId, row.value]));
}

export async function countOrgBrands(organizationId: string, conn: DbConnection = db): Promise<number> {
	return (await countBrandsByOrg([organizationId], conn)).get(organizationId) ?? 0;
}

export async function countOrgEnabledPrompts(organizationId: string, conn: DbConnection = db): Promise<number> {
	const [row] = await conn
		.select({ value: count() })
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.enabled, true)));
	return row?.value ?? 0;
}

export async function countOrgAssignedPremiumSlots(organizationId: string, conn: DbConnection = db): Promise<number> {
	const [row] = await conn
		.select({ value: sql<string>`coalesce(sum(cardinality(${prompts.premiumModels})), 0)` })
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.enabled, true)));
	return Number(row?.value ?? 0);
}

/** Unlimited entitlements return before `decide`, so usage is never counted outside cloud. */
async function withEntitlements(
	organizationId: string,
	decide: (entitlements: Entitlements) => WriteDecision[] | Promise<WriteDecision[]>,
	conn?: DbConnection,
): Promise<void> {
	const entitlements = await getOrgEntitlements(organizationId, conn ? { conn } : undefined);
	if (entitlements.unlimited) return;
	for (const decision of await decide(entitlements)) assertAllowed(decision);
}

/** Advisory locks share one namespace per database; this keeps quota locks off other uses of the org id. */
const QUOTA_LOCK_CLASS = 0x656c6d6f;

/**
 * So two requests can't both take the last free slot. `run` must do all its work,
 * checks included, on `tx`: reaching for the pooled `db` can deadlock the pool.
 */
export async function withQuotaLock<T>(
	organizationId: string,
	run: (tx: DbConnection, afterCommit: (task: () => Promise<unknown>) => void) => Promise<T>,
): Promise<T> {
	const deferred: Array<() => Promise<unknown>> = [];
	const value = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${QUOTA_LOCK_CLASS}, hashtext(${organizationId}))`);
		return run(tx, (task) => deferred.push(task));
	});
	for (const task of deferred) await task();
	return value;
}

export async function assertCanCreateBrand(organizationId: string, conn?: DbConnection): Promise<void> {
	await withEntitlements(
		organizationId,
		async (entitlements) => [decideBrandCreate(entitlements, await countOrgBrands(organizationId, conn ?? db))],
		conn,
	);
}

/** assertCanCreateBrand's verdict, returned, so UI can show the limit before the customer fills in a form. */
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

export async function assertCompetitorCap(brandId: string, adding: number, conn: DbConnection = db): Promise<void> {
	if (adding <= 0) return;
	const [row] = await conn.select({ value: count() }).from(competitors).where(eq(competitors.brandId, brandId));
	assertAllowed(decideCompetitorCap((row?.value ?? 0) + adding));
}

export async function assertCanAddPrompts(organizationId: string, adding: number, conn?: DbConnection): Promise<void> {
	if (adding <= 0) return;
	await withEntitlements(
		organizationId,
		async (entitlements) => [
			decidePromptAdd(entitlements, await countOrgEnabledPrompts(organizationId, conn ?? db), adding),
		],
		conn,
	);
}

export async function assertEnabledModelsAllowed(organizationId: string, requestedModels: string[]): Promise<void> {
	await withEntitlements(organizationId, (entitlements) => [decideEnabledModels(entitlements, requestedModels)]);
}

export async function assertCadenceAllowed(organizationId: string, requestedDelayHours: number | null): Promise<void> {
	await withEntitlements(organizationId, (entitlements) => [decideCadenceOverride(entitlements, requestedDelayHours)]);
}

/** Net figures: a save that disables as many prompts as it enables adds nothing. */
export interface PromptSaveDelta {
	prompts: number;
	premiumPairings: number;
}

export interface PromptPoolState {
	enabled: boolean;
	premiumModels: readonly string[];
}

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

/** One snapshot for both pools, so a save can't pass each limit under a different plan. */
export async function assertPromptSaveAllowed(
	organizationId: string,
	delta: PromptSaveDelta,
	conn?: DbConnection,
): Promise<void> {
	if (delta.prompts <= 0 && delta.premiumPairings <= 0) return;
	await withEntitlements(
		organizationId,
		async (entitlements) => {
			const [enabledPrompts, assignedPremium] = await Promise.all([
				delta.prompts > 0 ? countOrgEnabledPrompts(organizationId, conn ?? db) : 0,
				delta.premiumPairings > 0 ? countOrgAssignedPremiumSlots(organizationId, conn ?? db) : 0,
			]);
			return [
				decidePromptAdd(entitlements, enabledPrompts, delta.prompts),
				decidePremiumAssign(entitlements, assignedPremium, delta.premiumPairings),
			];
		},
		conn,
	);
}
