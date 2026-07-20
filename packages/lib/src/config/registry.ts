/**
 * The config key registry — the single source of truth for every value that
 * cascades through the instance → org → brand → prompt hierarchy.
 *
 * Durable rule (do not violate): **config that cascades lives here; entity
 * collections get real tables.** A key belongs in this registry only if its
 * value varies by scope and merges down the hierarchy. A set of things that
 * *exist* — targets, credentials, plans — is an entity collection and gets its
 * own table with real columns, FKs, and constraints; it never becomes a config
 * key holding a list. Every key requires a full entry below (schema, default,
 * allowed scopes/selectors, merge rule, permission class). Defaults are
 * code-only and are never written to the database.
 */
import { z } from "zod";
import type { ConfigWriteResult, RegistryEntry, Selector, SelectorInput } from "./types";

/**
 * `run.enabled_models` is the one list-valued key: the stored value is always a
 * `string[]` (including `[]` = "none"), while an *absent* row means "all
 * models". `null` is that absent default — it is never a legal written value
 * (the DB CHECK forbids a JSON null), so writes validate against the array
 * schema and callers delete the row to return to "all". See §3a / B5.
 */
const enabledModelsSchema = z.array(z.string());

export const REGISTRY = {
	"run.cadence_hours": {
		key: "run.cadence_hours",
		domain: "run",
		property: "cadenceHours",
		// Fractional hours are legal (e.g. 24/7 ≈ 3.43h for 7×/day).
		valueSchema: z.number().positive(),
		default: 24,
		allowedScopes: [
			{ scope: "instance", selectors: ["none", "model", "target"] },
			{ scope: "organization", selectors: ["none", "model", "target"] },
			{ scope: "brand", selectors: ["none"] },
		],
		mergeRule: "most-specific-wins",
		permissionClass: "sampling",
		description: "Hours between scheduled evaluations of a prompt (how often the fleet runs).",
	},
	"run.replication": {
		key: "run.replication",
		domain: "run",
		property: "replication",
		valueSchema: z.number().int().positive(),
		default: 5,
		allowedScopes: [
			{ scope: "instance", selectors: ["none", "model", "target"] },
			{ scope: "organization", selectors: ["none", "model", "target"] },
		],
		mergeRule: "most-specific-wins",
		permissionClass: "sampling",
		description: "Samples taken per firing (repeat runs of the same prompt to average out variance).",
	},
	"run.enabled_models": {
		key: "run.enabled_models",
		domain: "run",
		property: "enabledModels",
		valueSchema: enabledModelsSchema,
		default: null,
		allowedScopes: [{ scope: "brand", selectors: ["none"] }],
		mergeRule: "replace",
		permissionClass: "run-config",
		description: "Which standard models a brand tracks. Absent = all; [] = none; otherwise the intersection.",
	},
	"run.model_enabled": {
		key: "run.model_enabled",
		domain: "run",
		property: "modelEnabled",
		valueSchema: z.boolean(),
		default: true,
		allowedScopes: [{ scope: "prompt", selectors: ["model"] }],
		mergeRule: "replace",
		permissionClass: "run-config",
		description: "Per-prompt override to subtract (false) or add (true, assignable models) one model for one prompt.",
	},
	"run.model_mode": {
		key: "run.model_mode",
		domain: "run",
		property: "modelMode",
		valueSchema: z.enum(["base", "web"]),
		default: "base",
		allowedScopes: [{ scope: "prompt", selectors: ["model"] }],
		mergeRule: "replace",
		permissionClass: "run-config",
		description: "Per-prompt model mode: base evaluation or web-grounded.",
	},
	"onboarding.target": {
		key: "onboarding.target",
		domain: "onboarding",
		property: "onboardingTarget",
		// A model:provider string (like a SCRAPE_TARGETS entry); only the
		// provider segment is honored. The onboarding resolver still falls
		// through to its preference order when this target isn't configured.
		valueSchema: z.string().min(1),
		default: "chatgpt:openai-api",
		allowedScopes: [{ scope: "instance", selectors: ["none"] }],
		mergeRule: "most-specific-wins",
		permissionClass: "instance-only",
		description: "Direct-API target used for onboarding research (instance default).",
	},
} satisfies Record<string, RegistryEntry>;

export type ConfigKey = keyof typeof REGISTRY;

/** Look up a key's registry entry, or `undefined` for an unknown key. */
export function getRegistryEntry(key: string): RegistryEntry | undefined {
	return (REGISTRY as Record<string, RegistryEntry>)[key];
}

/** The camelCase property a key resolves to on the effective config object. */
export function getPropertyForKey(key: string): string | undefined {
	return getRegistryEntry(key)?.property;
}

function selectorKind(selector: SelectorInput | undefined): Selector | "conflict" {
	const hasModel = selector?.model != null && selector.model !== "";
	const hasTarget = selector?.targetId != null && selector.targetId !== "";
	if (hasModel && hasTarget) return "conflict";
	if (hasTarget) return "target";
	if (hasModel) return "model";
	return "none";
}

/**
 * Validate a single config write against the registry: the key must be known,
 * allowed at that scope with that selector, and the value must satisfy the
 * key's zod schema. This is the write boundary's shape/placement check — it does
 * NOT apply entitlement clamps or permission-class gates (those are separate,
 * later layers; see §4 defense-in-depth).
 */
export function assertValidConfigWrite(input: {
	key: string;
	scope: string;
	selector?: SelectorInput;
	value: unknown;
}): ConfigWriteResult {
	const entry = getRegistryEntry(input.key);
	if (!entry) {
		return { ok: false, code: "unknown-key", message: `Unknown config key: "${input.key}".` };
	}

	const scopeRule = entry.allowedScopes.find((rule) => rule.scope === input.scope);
	if (!scopeRule) {
		const allowed = entry.allowedScopes.map((rule) => rule.scope).join(", ");
		return {
			ok: false,
			code: "scope-not-allowed",
			message: `Key "${input.key}" is not allowed at scope "${input.scope}" (allowed: ${allowed}).`,
		};
	}

	const kind = selectorKind(input.selector);
	if (kind === "conflict") {
		return {
			ok: false,
			code: "selector-not-allowed",
			message: `Key "${input.key}" cannot carry both a model and a target selector.`,
		};
	}
	if (!scopeRule.selectors.includes(kind)) {
		return {
			ok: false,
			code: "selector-not-allowed",
			message: `Selector "${kind}" is not allowed for "${input.key}" at scope "${input.scope}" (allowed: ${scopeRule.selectors.join(", ")}).`,
		};
	}

	const parsed = entry.valueSchema.safeParse(input.value);
	if (!parsed.success) {
		return {
			ok: false,
			code: "invalid-value",
			message: `Value for "${input.key}" failed validation: ${parsed.error.issues.map((issue) => issue.message).join("; ")}.`,
			issues: parsed.error.issues,
		};
	}

	return { ok: true, entry, value: parsed.data };
}
