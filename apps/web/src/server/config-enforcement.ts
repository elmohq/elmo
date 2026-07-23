/**
 * Write-time entitlement clamps and config-write planning — the pure, DB-free
 * core the config/instance server functions call (§7 "configurable limits").
 *
 * Every clamp here is INERT for non-cloud: `getEntitlements` returns unlimited
 * (null ceilings, UNLIMITED_COUNT pools) outside cloud, and each guard early-
 * returns on the unlimited sentinel — so local/whitelabel/demo behaviour is
 * provably unchanged. Kept side-effect-free so it unit-tests without a DB.
 */
import { UNLIMITED_COUNT } from "@workspace/config/plans";
import type { Entitlements } from "@workspace/lib/config/entitlements";
import { assertValidConfigWrite } from "@workspace/lib/config/registry";
import type { ConfigScope } from "@workspace/lib/config/types";

/**
 * What a jsonb config value actually holds. Registry-validated values are plain
 * JSON; server-fn responses cast `unknown` jsonb reads to this so TanStack's
 * serializability check has a concrete type.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * A write blocked by a plan ceiling (not an authz failure — the actor may write
 * the key, but the value exceeds their entitlements). Distinct type so callers
 * and tests can tell a limit clamp from a policy denial.
 */
export class EntitlementLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EntitlementLimitError";
	}
}

/**
 * Clamp a brand's standard model picks (A4): every pick must be on the plan menu
 * and the count must not exceed `standardModelPicks`. A null menu / null picks
 * ceiling (non-cloud) is inert.
 */
export function assertBrandModelPicks(entitlements: Entitlements, picks: string[]): void {
	const { standardModelMenu, standardModelPicks } = entitlements;
	if (standardModelMenu !== null) {
		const menu = new Set(standardModelMenu);
		const offMenu = picks.filter((model) => !menu.has(model));
		if (offMenu.length > 0) {
			throw new EntitlementLimitError(`These models are not available on your plan: ${offMenu.join(", ")}.`);
		}
	}
	if (standardModelPicks !== null && picks.length > standardModelPicks) {
		throw new EntitlementLimitError(
			`Your plan allows up to ${standardModelPicks} tracked models; you selected ${picks.length}.`,
		);
	}
}

/**
 * Org prompt-pool guard (closes the MAX_PROMPTS server gap): the org's total
 * prompts after adding `adding` must not exceed `maxPromptsPerOrg`. null =
 * unlimited (non-cloud) → inert, so today's server-side (uncapped) behaviour is
 * preserved everywhere but cloud.
 */
export function assertOrgPromptLimit(entitlements: Entitlements, currentCount: number, adding: number): void {
	const max = entitlements.maxPromptsPerOrg;
	if (max === null) return;
	if (currentCount + adding > max) {
		throw new EntitlementLimitError(
			`Your plan allows up to ${max} prompts; this change would bring your organization to ${currentCount + adding}.`,
		);
	}
}

/**
 * Claude-pool guard (A5): the projected number of ENABLED prompts assigned an
 * assignable model must not exceed `claudePromptPool`. Non-cloud pools are
 * `UNLIMITED_COUNT` → inert.
 */
export function assertClaudePoolHeadroom(entitlements: Entitlements, projectedEnabledAssigned: number): void {
	const pool = entitlements.claudePromptPool;
	if (pool >= UNLIMITED_COUNT) return;
	if (projectedEnabledAssigned > pool) {
		throw new EntitlementLimitError(
			`Your plan's Claude pool allows ${pool} prompt${pool === 1 ? "" : "s"}; this change would use ${projectedEnabledAssigned}.`,
		);
	}
}

/** maxBrands guard for the new-brand flow. null = unlimited → inert. */
export function assertBrandLimit(entitlements: Entitlements, currentBrandCount: number): void {
	const max = entitlements.maxBrands;
	if (max === null) return;
	if (currentBrandCount >= max) {
		throw new EntitlementLimitError(`Your plan allows up to ${max} brand${max === 1 ? "" : "s"}.`);
	}
}

// ---------------------------------------------------------------------------
// Config-write planning (the pure half of setConfigValues)
// ---------------------------------------------------------------------------

/** The scope-owning ids a batch of writes shares (resolved server-side). */
export interface ScopeIds {
	scope: ConfigScope;
	organizationId: string | null;
	brandId: string | null;
	promptId: string | null;
}

/** One entry from a `setConfigValues` call. `value` null/undefined = delete. */
export interface ConfigEntryInput {
	key: string;
	selector?: { model?: string | null; targetId?: string | null };
	value?: unknown;
}

/**
 * A planned mutation against `configs`. `upsert` carries the registry-validated
 * value; `delete` carries only the identity tuple (deleting a row reverts that
 * key to inherit — the documented null/undefined semantics).
 */
export interface ConfigWritePlan {
	action: "upsert" | "delete";
	scope: string;
	organizationId: string | null;
	brandId: string | null;
	promptId: string | null;
	model: string | null;
	targetId: string | null;
	key: string;
	value?: unknown;
}

function selectorColumns(selector: ConfigEntryInput["selector"]): { model: string | null; targetId: string | null } {
	return {
		model: selector?.model != null && selector.model !== "" ? selector.model : null,
		targetId: selector?.targetId != null && selector.targetId !== "" ? selector.targetId : null,
	};
}

/**
 * Validate one entry against the registry and produce its `configs` mutation.
 * A null/undefined value is a delete: only the key must be known (the row is
 * matched by tuple, so a mis-placed delete is a harmless no-op). A concrete
 * value runs the full `assertValidConfigWrite` (scope/selector/value) and stores
 * the parsed value. Throws on any validation failure.
 */
export function planConfigWrite(ids: ScopeIds, entry: ConfigEntryInput): ConfigWritePlan {
	const { model, targetId } = selectorColumns(entry.selector);
	const isDelete = entry.value === null || entry.value === undefined;

	if (isDelete) {
		const check = assertValidConfigWrite({
			key: entry.key,
			scope: ids.scope,
			selector: { model, targetId },
			value: undefined,
		});
		// Only reject an unknown key on delete; a wrong scope/selector matches no
		// row and no-ops, so we don't block reverting a stale/mis-targeted row.
		if (!check.ok && check.code === "unknown-key") throw new Error(check.message);
		return {
			action: "delete",
			scope: ids.scope,
			organizationId: ids.organizationId,
			brandId: ids.brandId,
			promptId: ids.promptId,
			model,
			targetId,
			key: entry.key,
		};
	}

	const result = assertValidConfigWrite({
		key: entry.key,
		scope: ids.scope,
		selector: { model, targetId },
		value: entry.value,
	});
	if (!result.ok) throw new Error(result.message);
	return {
		action: "upsert",
		scope: ids.scope,
		organizationId: ids.organizationId,
		brandId: ids.brandId,
		promptId: ids.promptId,
		model,
		targetId,
		key: entry.key,
		value: result.value,
	};
}

// ---------------------------------------------------------------------------
// Provider credential status (write-safe shape)
// ---------------------------------------------------------------------------

export type CredentialSource = "env" | "encrypted" | "secret-ref" | "unconfigured";

/**
 * The client-safe view of a provider's credential state. NEVER carries
 * plaintext, `encryptedData`, or `secretRef` — only presence, a short hint, and
 * verification bookkeeping. Credential values are write-only inputs.
 */
export interface ProviderCredentialStatus {
	provider: string;
	configuredViaEnv: boolean;
	hasStoredCredential: boolean;
	hint: string | null;
	lastVerifiedAt: string | null;
	lastVerifyError: string | null;
	source: CredentialSource;
}

/** Build the write-safe status for one provider from its env state + DB row. */
export function buildProviderCredentialStatus(input: {
	provider: string;
	envConfigured: boolean;
	row: { source: string; hint: string | null; lastVerifiedAt: Date | null; lastVerifyError: string | null } | null;
}): ProviderCredentialStatus {
	const { provider, envConfigured, row } = input;
	const hasStoredCredential = row !== null && (row.source === "encrypted" || row.source === "secret-ref");
	let source: CredentialSource;
	if (hasStoredCredential) source = row?.source === "secret-ref" ? "secret-ref" : "encrypted";
	else if (envConfigured) source = "env";
	else source = "unconfigured";
	return {
		provider,
		configuredViaEnv: envConfigured,
		hasStoredCredential,
		hint: row?.hint ?? null,
		lastVerifiedAt: row?.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
		lastVerifyError: row?.lastVerifyError ?? null,
		source,
	};
}
