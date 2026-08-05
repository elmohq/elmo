/**
 * Write-time plan enforcement, shared by the web server functions and the
 * /api/v1 handlers so the two surfaces cannot drift (issue #347).
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
import { and, count, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/db";
import { brands, prompts } from "../db/schema";
import { getOrgEntitlements } from "./service";

export type EntitlementDenialCode =
	| "no-active-plan"
	| "brand-limit"
	| "prompt-limit"
	| "platform-not-in-plan"
	| "platform-picks-exceeded"
	| "claude-not-in-plan"
	| "claude-pool-exhausted"
	| "cadence-not-configurable";

/**
 * Thrown by the assert* helpers. `status` is the HTTP status /api/v1 maps it
 * to; server functions surface `message` directly.
 */
export class EntitlementError extends Error {
	readonly code: EntitlementDenialCode;
	readonly status: number;

	constructor(code: EntitlementDenialCode, message: string) {
		super(message);
		this.name = "EntitlementError";
		this.code = code;
		this.status = code === "no-active-plan" ? 402 : 409;
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
		return deny(
			"brand-limit",
			`Your plan includes ${entitlements.maxBrands} brand${entitlements.maxBrands === 1 ? "" : "s"}. Upgrade to add more.`,
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

/** Assigning Claude tracking to prompts consumes the org's Claude pool. */
export function decideClaudeAssign(
	entitlements: Entitlements,
	currentAssignedEnabled: number,
	adding: number,
): EntitlementDecision {
	if (adding <= 0) return ALLOWED;
	const gate = requireActivePlan(entitlements);
	if (gate) return gate;
	if (entitlements.claudePool <= 0) {
		return deny("claude-not-in-plan", "Claude tracking is available on the Pro and Business plans.");
	}
	if (currentAssignedEnabled + adding > entitlements.claudePool) {
		const remaining = Math.max(0, entitlements.claudePool - currentAssignedEnabled);
		return deny(
			"claude-pool-exhausted",
			`Your Claude pool covers ${entitlements.claudePool} prompt${entitlements.claudePool === 1 ? "" : "s"} (${remaining} remaining). Buy extra Claude prompts or unassign others.`,
		);
	}
	return ALLOWED;
}

/** Cadence is plan-defined in cloud; only custom-plan overrides change it. */
export function decideCadenceOverride(entitlements: Entitlements): EntitlementDecision {
	if (entitlements.unlimited) return ALLOWED;
	return deny("cadence-not-configurable", "Sampling cadence is set by your plan.");
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

export async function countOrgAssignedClaudePrompts(organizationId: string): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.enabled, true), isNotNull(prompts.claudeMode)));
	return row?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Asserts wired into write paths
// ---------------------------------------------------------------------------

export async function assertCanCreateBrand(organizationId: string): Promise<void> {
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return;
	assertAllowed(decideBrandCreate(entitlements, await countOrgBrands(organizationId)));
}

/** Guard creating `adding` new enabled prompts (or re-enabling that many). */
export async function assertCanAddPrompts(organizationId: string, adding: number): Promise<void> {
	if (adding <= 0) return;
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return;
	assertAllowed(decidePromptAdd(entitlements, await countOrgEnabledPrompts(organizationId), adding));
}

export async function assertEnabledModelsAllowed(organizationId: string, requestedModels: string[]): Promise<void> {
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return;
	assertAllowed(decideEnabledModels(entitlements, requestedModels));
}

export async function assertCanAssignClaude(organizationId: string, adding: number): Promise<void> {
	if (adding <= 0) return;
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return;
	assertAllowed(decideClaudeAssign(entitlements, await countOrgAssignedClaudePrompts(organizationId), adding));
}

export async function assertCadenceConfigurable(organizationId: string): Promise<void> {
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return;
	assertAllowed(decideCadenceOverride(entitlements));
}
