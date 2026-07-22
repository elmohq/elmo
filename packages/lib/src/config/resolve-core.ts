/**
 * The config resolver — pure core (no DB, fully unit-testable).
 *
 * Two primitives, both deterministic:
 *   - `mergeConfigRows` collapses the cascade to one winning value + provenance
 *     per registry key, for a given (model/target) resolution context. Precedence
 *     is scope-first (prompt > brand > organization > instance), then selector
 *     specificity within a scope (targetId > model > selector-less) — the CSS-like
 *     rule from §3a. Ceilings never participate here; they clamp later.
 *   - `resolveEffectiveTargets` turns the instance catalog ∩ entitlements ∩
 *     resolved selections into the targets that WILL run (with clamped run policy
 *     and provenance) plus the ones that won't, each carrying its exclusion
 *     reasons (B2 — explainability is API). The Claude-pool count is an input, so
 *     the whole thing stays a pure function of its arguments.
 *
 * The DB layer (resolve-db.ts) fetches rows/catalog/entitlements/pool-count and
 * feeds them here; nothing in this file touches the database.
 */
import { ASSIGNABLE_MODELS } from "@workspace/config/plans";
import type { Entitlements } from "./entitlements";
import { REGISTRY, rowSelectorKind } from "./registry";
import type { ConfigScope, Selector } from "./types";

/**
 * A `configs`-shaped record — the subset the resolver reads. The full drizzle
 * `Config` row is structurally assignable to this; keeping it minimal lets the
 * pure core (and its tests) stay free of DB types.
 */
export interface ConfigRow {
	id: string;
	scope: string;
	organizationId: string | null;
	brandId: string | null;
	promptId: string | null;
	model: string | null;
	targetId: string | null;
	key: string;
	value: unknown;
}

/** A `model_targets`-shaped catalog entry — implementation facts, no run policy. */
export interface CatalogTarget {
	id: string;
	model: string;
	provider: string;
	version?: string | null;
	webSearch: boolean;
	enabled: boolean;
	priority: number;
	requiredEntitlement?: string | null;
}

/**
 * The dimension a resolution is "about": which model / which specific target.
 * A row's selector must match this context to participate (a `model='gemini'`
 * row is irrelevant when resolving a Claude target).
 */
export interface MergeContext {
	model?: string | null;
	targetId?: string | null;
}

/** Provenance for a value supplied by a concrete config row. */
export interface RowProvenance {
	scope: ConfigScope;
	rowId: string;
	selector?: { model: string } | { targetId: string };
}

/** Where a resolved value came from: a concrete row, or the registry default. */
export type Provenance = "default" | RowProvenance;

/** One resolved key: its winning value and where that value came from. */
export interface ResolvedEntry {
	value: unknown;
	provenance: Provenance;
}

/** A resolved entry with a concrete value type. */
export interface TypedEntry<T> {
	value: T;
	provenance: Provenance;
}

/**
 * Resolved config, one entry per registry key (by camelCase property), each
 * value typed — so consumers read `resolved.cadenceHours.value` as `number`
 * with no cast. Kept in lockstep with REGISTRY (registry.test.ts pins the
 * key/property set); a new key adds a field here. `enabledModels` carries the
 * `null` "absent" sentinel (= all models); the others always resolve to a
 * concrete value (their default is a valid schema value).
 */
export interface ResolvedConfig {
	cadenceHours: TypedEntry<number>;
	replication: TypedEntry<number>;
	enabledModels: TypedEntry<string[] | null>;
	modelEnabled: TypedEntry<boolean>;
	modelMode: TypedEntry<"base" | "web">;
	onboardingTarget: TypedEntry<string>;
}

const SCOPE_RANK: Record<string, number> = { instance: 0, organization: 1, brand: 2, prompt: 3 };

function scopeRank(scope: string): number {
	return SCOPE_RANK[scope] ?? -1;
}

const SELECTOR_RANK: Record<Selector, number> = { none: 0, model: 1, target: 2 };

/** targetId row (2) beats model row (1) beats selector-less row (0). */
function selectorRank(row: ConfigRow): number {
	return SELECTOR_RANK[rowSelectorKind(row)];
}

function rowMatchesContext(row: ConfigRow, context: MergeContext): boolean {
	switch (rowSelectorKind(row)) {
		case "target":
			return context.targetId != null && row.targetId === context.targetId;
		case "model":
			return context.model != null && row.model === context.model;
		default:
			return true;
	}
}

function provenanceFromRow(row: ConfigRow): RowProvenance {
	const provenance: RowProvenance = { scope: row.scope as ConfigScope, rowId: row.id };
	const kind = rowSelectorKind(row);
	if (kind === "target") provenance.selector = { targetId: row.targetId as string };
	else if (kind === "model") provenance.selector = { model: row.model as string };
	return provenance;
}

/**
 * `true` when `a` outranks `b` under the precedence rule: scope first, then
 * selector specificity. Ties (same scope + specificity) cannot occur for one
 * resolution chain — the `configs` unique constraint forbids them — so the id
 * tiebreak is defensive determinism only.
 */
function outranks(a: ConfigRow, b: ConfigRow): boolean {
	const scopeDelta = scopeRank(a.scope) - scopeRank(b.scope);
	if (scopeDelta !== 0) return scopeDelta > 0;
	const selectorDelta = selectorRank(a) - selectorRank(b);
	if (selectorDelta !== 0) return selectorDelta > 0;
	return a.id > b.id;
}

/**
 * Collapse the cascade to one `{ value, provenance }` per registry key for the
 * given context. Both `most-specific-wins` and `replace` merge rules resolve to
 * "the winning row's value" in PR 1 — neither combines values across rows (list
 * picks and per-prompt overrides replace wholesale; scalars take the nearest).
 * The distinction is documentary (B5); if a future rule ever *accumulates*, it
 * gets its own branch here.
 *
 * A winning row whose value no longer satisfies the registry schema (jsonb
 * drift, §13) is treated as absent: the code default applies, fail-safe.
 */
export function mergeConfigRows(rows: ConfigRow[], context: MergeContext = {}): ResolvedConfig {
	const resolved: Record<string, ResolvedEntry> = {};
	for (const entry of Object.values(REGISTRY)) {
		let winner: ConfigRow | undefined;
		for (const row of rows) {
			if (row.key !== entry.key) continue;
			if (!rowMatchesContext(row, context)) continue;
			if (!winner || outranks(row, winner)) winner = row;
		}
		resolved[entry.property] =
			winner && entry.valueSchema.safeParse(winner.value).success
				? { value: winner.value, provenance: provenanceFromRow(winner) }
				: { value: entry.default, provenance: "default" };
	}
	// Built dynamically over REGISTRY; the key set is exactly ResolvedConfig's.
	return resolved as unknown as ResolvedConfig;
}

// ---------------------------------------------------------------------------
// Effective targets
// ---------------------------------------------------------------------------

/**
 * Why a catalog target won't run. Exactly the B2 set relevant to PR 1's
 * resolver; the worker's runnable-limit metering (`budget-exhausted`,
 * `billing-paused`) is a separate schedule-time concern.
 */
export type ExclusionReason =
	| "catalog-disabled"
	| "credentials-unready"
	| "requires-entitlement"
	| "not-in-plan-menu"
	| "not-picked-by-brand"
	| "prompt-disabled"
	| "pool-exhausted";

/** How a ceiling modified a target's cascaded run policy (§3a clamp-last). */
export interface ClampRecord {
	clampedBy: "plan-ceiling";
	model: string;
	ceiling: number;
	requestedRunsPerDay: number;
	effectiveRunsPerDay: number;
}

/**
 * Provenance for a running target's policy: where cadence/replication came from,
 * plus any ceiling clamp. The per-key provenance points at the *source* row; the
 * clamp record explains the final (possibly reduced) values.
 */
export interface TargetProvenance {
	cadenceHours: Provenance;
	replication: Provenance;
	clamp?: ClampRecord;
}

export interface EffectiveTarget {
	model: string;
	provider: string;
	version?: string;
	webSearch: boolean;
	targetId: string;
	runPolicy: { replication: number; cadenceHours: number };
	provenance: TargetProvenance;
}

export interface ExcludedTarget {
	target: CatalogTarget;
	reasons: ExclusionReason[];
}

export interface EffectiveTargetsResult {
	targets: EffectiveTarget[];
	excluded: ExcludedTarget[];
}

export interface ResolveTargetsInput {
	catalog: CatalogTarget[];
	entitlements: Entitlements;
	/** Config rows for the scope chain (instance + org + brand [+ prompt]). */
	rows: ConfigRow[];
	/** `brand` = model picks only; `prompt` = picks plus per-prompt overrides. */
	level: "brand" | "prompt";
	credentialsReady: (providerId: string) => boolean;
	/**
	 * Org-wide count of assignable-model prompt assignments already in place (from
	 * the DB). Only consulted for a *new* assignable add at prompt level — existing
	 * assignments always run (their row is already counted here). The only
	 * assignable model in PR 1 is Claude, so this is a single number.
	 */
	assignablePoolUsage?: number;
}

/** The deterministic run/day arithmetic (A6), isolated for property testing. */
export interface RunClampResult {
	cadenceHours: number;
	replication: number;
	clamped: boolean;
	requestedRunsPerDay: number;
	effectiveRunsPerDay: number;
}

/**
 * Clamp `replication × 24 / cadenceHours` to `ceiling` runs/day, deterministically:
 * first stretch cadence up (`24 × replication / ceiling`, preserving replication =
 * samples-per-firing); only once cadence hits its 24h floor — i.e. replication
 * alone already exceeds the ceiling — reduce replication to `floor(ceiling)`.
 * Result is "exactly ceiling per day" (#340) and never exceeds it.
 */
export function clampRunsPerDay(input: { cadenceHours: number; replication: number; ceiling: number }): RunClampResult {
	const { ceiling } = input;
	let { cadenceHours, replication } = input;
	const requestedRunsPerDay = (replication * 24) / cadenceHours;
	if (requestedRunsPerDay <= ceiling) {
		return { cadenceHours, replication, clamped: false, requestedRunsPerDay, effectiveRunsPerDay: requestedRunsPerDay };
	}
	let effectiveRunsPerDay: number;
	if (replication <= ceiling) {
		cadenceHours = (24 * replication) / ceiling;
		effectiveRunsPerDay = ceiling;
	} else {
		cadenceHours = 24;
		replication = Math.floor(ceiling);
		effectiveRunsPerDay = replication;
	}
	return { cadenceHours, replication, clamped: true, requestedRunsPerDay, effectiveRunsPerDay };
}

function computeRunPolicy(
	resolved: ResolvedConfig,
	entitlements: Entitlements,
	model: string,
): { cadenceHours: number; replication: number; provenance: TargetProvenance } {
	const cadenceEntry = resolved.cadenceHours;
	const replicationEntry = resolved.replication;
	const cadenceHours = cadenceEntry.value;
	const replication = replicationEntry.value;
	const provenance: TargetProvenance = {
		cadenceHours: cadenceEntry.provenance,
		replication: replicationEntry.provenance,
	};

	const ceilings = entitlements.maxRunsPerDay;
	if (!ceilings) return { cadenceHours, replication, provenance };
	const ceiling = ceilings[model] ?? ceilings["*"];
	if (ceiling === undefined) return { cadenceHours, replication, provenance };

	const clamp = clampRunsPerDay({ cadenceHours, replication, ceiling });
	if (!clamp.clamped) return { cadenceHours, replication, provenance };
	provenance.clamp = {
		clampedBy: "plan-ceiling",
		model,
		ceiling,
		requestedRunsPerDay: clamp.requestedRunsPerDay,
		effectiveRunsPerDay: clamp.effectiveRunsPerDay,
	};
	return { cadenceHours: clamp.cadenceHours, replication: clamp.replication, provenance };
}

function isExplicit(entry: ResolvedEntry): boolean {
	return entry.provenance !== "default";
}

/**
 * Compute the effective targets for a brand or prompt. Per catalog target we
 * collect *every* applicable exclusion reason (a target with zero reasons runs);
 * this is what powers "why isn't X running?" tooltips without a second pass.
 *
 * Model classes (A4) are only enforced when the plan declares a `standardModelMenu`
 * (cloud). When it is `null` (non-cloud / unlimited) there is no class
 * distinction: every catalog model flows through the legacy `enabled_models`
 * intersection, reproducing `selectTargetsForBrand` exactly.
 */
export function resolveEffectiveTargets(input: ResolveTargetsInput): EffectiveTargetsResult {
	const { catalog, entitlements, rows, level, credentialsReady } = input;
	const classesEnforced = entitlements.standardModelMenu !== null;
	const poolUsage = input.assignablePoolUsage ?? 0;
	const pool = entitlements.claudePromptPool;

	const targets: EffectiveTarget[] = [];
	const excluded: ExcludedTarget[] = [];

	for (const target of catalog) {
		const resolved = mergeConfigRows(rows, { model: target.model, targetId: target.id });
		const reasons: ExclusionReason[] = [];

		if (!target.enabled) reasons.push("catalog-disabled");
		if (!credentialsReady(target.provider)) reasons.push("credentials-unready");
		if (target.requiredEntitlement === "webSearchApiTargets" && !entitlements.allowWebSearchApiTargets) {
			reasons.push("requires-entitlement");
		}
		if (target.requiredEntitlement === "custom" && !entitlements.allowCustomTargets) {
			reasons.push("requires-entitlement");
		}

		const isAssignable = classesEnforced && (ASSIGNABLE_MODELS as readonly string[]).includes(target.model);
		if (isAssignable) {
			collectAssignableReasons({ reasons, resolved, level, poolUsage, pool, webSearch: target.webSearch });
		} else {
			collectStandardReasons({ reasons, resolved, level, model: target.model, menu: entitlements.standardModelMenu });
		}

		if (reasons.length > 0) {
			excluded.push({ target, reasons });
			continue;
		}
		const policy = computeRunPolicy(resolved, entitlements, target.model);
		targets.push({
			model: target.model,
			provider: target.provider,
			version: target.version ?? undefined,
			webSearch: target.webSearch,
			targetId: target.id,
			runPolicy: { replication: policy.replication, cadenceHours: policy.cadenceHours },
			provenance: policy.provenance,
		});
	}

	return { targets, excluded };
}

/**
 * Standard-class (menu) model: constrained by the plan menu, the brand's
 * `enabled_models` pick (legacy null=all / []=none / subset), and — at prompt
 * level — an explicit per-prompt subtract.
 */
function collectStandardReasons(args: {
	reasons: ExclusionReason[];
	resolved: ResolvedConfig;
	level: "brand" | "prompt";
	model: string;
	menu: string[] | null;
}): void {
	const { reasons, resolved, level, model, menu } = args;
	if (menu !== null && !menu.includes(model)) reasons.push("not-in-plan-menu");

	const picks = resolved.enabledModels.value;
	if (picks !== null && !picks.includes(model)) reasons.push("not-picked-by-brand");

	if (level === "prompt") {
		const modelEnabled = resolved.modelEnabled;
		if (isExplicit(modelEnabled) && modelEnabled.value === false) reasons.push("prompt-disabled");
	}
}

/**
 * Assignable-class model (Claude) under enforced classes: never a brand pick, so
 * it only runs when a prompt explicitly adds it, in the matching mode
 * (`model_mode` selects the base vs web-grounded catalog variant), within pool
 * headroom. An explicit `model_enabled=true` OR an explicit `model_mode` row
 * marks the assignment — the latter is what the A5 pool count counts, so any
 * prompt the pool counter sees as assigned also runs here. An existing
 * assignment always runs; only a *new* add is blocked once the pool is full.
 */
function collectAssignableReasons(args: {
	reasons: ExclusionReason[];
	resolved: ResolvedConfig;
	level: "brand" | "prompt";
	poolUsage: number;
	pool: number;
	webSearch: boolean;
}): void {
	const { reasons, resolved, level, poolUsage, pool, webSearch } = args;
	if (level === "brand") {
		reasons.push("not-picked-by-brand");
		return;
	}

	const modelEnabled = resolved.modelEnabled;
	if (isExplicit(modelEnabled) && modelEnabled.value === false) {
		reasons.push("prompt-disabled");
		return;
	}
	const assigned = (isExplicit(modelEnabled) && modelEnabled.value === true) || isExplicit(resolved.modelMode);
	if (!assigned) {
		// No assignment row: a would-be new add. Blocked only if the pool is full.
		reasons.push(poolUsage >= pool ? "pool-exhausted" : "not-picked-by-brand");
		return;
	}

	// Assigned: the chosen mode selects exactly one of the base/web catalog variants.
	const wantWeb = resolved.modelMode.value === "web";
	if (webSearch !== wantWeb) reasons.push("not-picked-by-brand");
}
