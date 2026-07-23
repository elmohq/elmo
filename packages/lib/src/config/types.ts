import type { z } from "zod";

/** The four hierarchy levels a config row can live at. */
export type ConfigScope = "instance" | "organization" | "brand" | "prompt";

/** Key namespace. PR 1 ships only `run.*` and `onboarding.*`. */
export type ConfigDomain = "run" | "onboarding";

/**
 * How overrides at different scopes/selectors compose for one key:
 * - `most-specific-wins`: the nearest-scope row supplies the whole value.
 * - `replace`: the winning row replaces lower scopes wholesale (list picks,
 *   per-prompt overrides) — no partial merge.
 */
export type MergeRule = "most-specific-wins" | "replace";

/**
 * Which write gate a key hangs off (see CONFIG_POLICY / A3). `sampling`
 * (cadence, replication) is staff-only in cloud; `run-config` is member-editable
 * within entitlements; `instance-only` is instance-admin everywhere.
 */
export type PermissionClass = "run-config" | "sampling" | "instance-only";

/**
 * The selector a row carries. `none` = a selector-less row (the scope default);
 * `model` = one platform; `target` = one specific `model_targets` row.
 */
export type Selector = "none" | "model" | "target";

/** Which selectors a key permits at a given scope. */
export interface ScopeRule {
	scope: ConfigScope;
	selectors: Selector[];
}

/**
 * One config key's full declaration — the single source of truth for its
 * schema, default, allowed placement, and how it merges/clamps. A key's
 * `default` is code-only; the cascading scalars are never written to the DB,
 * while the per-prompt assignment keys (`run.model_enabled`, `run.model_mode`)
 * intentionally persist a default-valued row as the assignment signal. `null`
 * is the "absent" sentinel for list-valued keys whose absence means something
 * other than a concrete value (e.g. `run.enabled_models` absent = all models).
 */
export interface RegistryEntry {
	key: string;
	domain: ConfigDomain;
	/** camelCase property the resolver exposes on the resolved config object. */
	property: string;
	valueSchema: z.ZodType;
	default: unknown;
	allowedScopes: ScopeRule[];
	mergeRule: MergeRule;
	permissionClass: PermissionClass;
	description: string;
}

/** A concrete selector on a write, resolved to a {@link Selector} kind. */
export interface SelectorInput {
	model?: string | null;
	targetId?: string | null;
}

/** Discriminated result of {@link assertValidConfigWrite}. */
export type ConfigWriteResult =
	| { ok: true; entry: RegistryEntry; value: unknown }
	| { ok: false; code: "unknown-key"; message: string }
	| { ok: false; code: "scope-not-allowed"; message: string }
	| { ok: false; code: "selector-not-allowed"; message: string }
	| { ok: false; code: "invalid-value"; message: string; issues: z.ZodError["issues"] };
