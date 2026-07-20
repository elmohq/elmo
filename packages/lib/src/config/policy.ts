/**
 * Config write authorization — the §4 matrix as pure code.
 *
 * Every config write in the app funnels through {@link evaluateConfigWrite}
 * (cascading `configs` rows) or {@link evaluateEntityWrite} (the three
 * non-cascading entity tables). Both are side-effect-free so the mode contracts
 * (§9) and the exhaustive matrix test can pin them without a DB or a request.
 *
 * The gate is per-KEY, not per (class × scope) cell (amendment A3): the registry
 * declares each key's `permissionClass`, and {@link CONFIG_POLICY} maps
 * (mode × class) → the minimum role that may write it. Two invariants sit on top
 * of that mapping and are not expressible as cells:
 *   - instance-scope writes always require instance-admin (a floor over the class
 *     mapping, so a future member-writable key can never be set instance-wide);
 *   - whitelabel has no prompt level, so prompt-scope writes are rejected for
 *     everyone including instance admins (§4 + A2).
 */
import type { DeploymentMode } from "@workspace/config/types";
import { getRegistryEntry } from "./registry";
import type { ConfigScope, PermissionClass } from "./types";

/**
 * The resolved actor for a write decision. `orgRole` is the caller's role in the
 * *resource's* org (null = not a member of it); `isInstanceAdmin` is uniform
 * across all modes (decision 7: whitelabel `elmo_admin` users are instance
 * admins, no special-casing).
 */
export type ConfigActor = {
	isInstanceAdmin: boolean;
	orgRole: "admin" | "member" | null;
};

/**
 * The minimum role a policy cell requires. `none` is the strictest value: it
 * means the class is not writable in this mode by anyone (demo — defense in
 * depth beneath the readOnly middleware), never "no minimum / everyone allowed".
 */
export type MinRole = "org-member" | "org-admin" | "instance-admin" | "none";

export type ConfigWriteDecision = { allowed: true } | { allowed: false; reason: string };

/** The three non-cascading entity tables gated separately from `configs` rows. */
export type ConfigEntity = "model_targets" | "provider_credentials" | "organization_settings";

/**
 * (mode × permission class) → minimum role to write. Mode differences are data
 * here, not code branches: cloud/local let members write run-config within
 * entitlements while keeping sampling + instance-only staff-only; whitelabel
 * lifts every class to instance-admin (members lose nothing — run config was
 * never theirs); demo disables every class (`none`).
 */
export const CONFIG_POLICY: Record<DeploymentMode, Record<PermissionClass, MinRole>> = {
	local: {
		"run-config": "org-member",
		sampling: "instance-admin",
		"instance-only": "instance-admin",
	},
	cloud: {
		"run-config": "org-member",
		sampling: "instance-admin",
		"instance-only": "instance-admin",
	},
	whitelabel: {
		"run-config": "instance-admin",
		sampling: "instance-admin",
		"instance-only": "instance-admin",
	},
	demo: {
		"run-config": "none",
		sampling: "none",
		"instance-only": "none",
	},
};

// Higher rank = stricter. `none` tops it so it survives the instance-scope floor.
const RANK: Record<MinRole, number> = {
	"org-member": 0,
	"org-admin": 1,
	"instance-admin": 2,
	none: 3,
};

function stricter(a: MinRole, b: MinRole): MinRole {
	return RANK[a] >= RANK[b] ? a : b;
}

function satisfiesMinRole(actor: ConfigActor, min: MinRole): boolean {
	switch (min) {
		case "none":
			return false;
		case "instance-admin":
			return actor.isInstanceAdmin;
		case "org-admin":
			return actor.isInstanceAdmin || actor.orgRole === "admin";
		case "org-member":
			return actor.isInstanceAdmin || actor.orgRole === "admin" || actor.orgRole === "member";
	}
}

function reasonForMinRole(min: MinRole): string {
	switch (min) {
		case "none":
			return "writes-disabled";
		case "instance-admin":
			return "instance-admin-required";
		case "org-admin":
			return "org-admin-required";
		case "org-member":
			return "org-member-required";
	}
}

/**
 * Decide whether `actor` may write `key` at `scope` in `mode`. The registry
 * supplies the key's placement and permission class; {@link CONFIG_POLICY} plus
 * the two structural invariants (instance-admin floor, whitelabel-no-prompt)
 * supply the role check. Shape/value validation (`assertValidConfigWrite`) and
 * entitlement clamps are independent later layers — this answers only "may this
 * actor set this key here?".
 */
export function evaluateConfigWrite(input: {
	mode: DeploymentMode;
	key: string;
	scope: ConfigScope;
	actor: ConfigActor;
}): ConfigWriteDecision {
	const entry = getRegistryEntry(input.key);
	if (!entry) return { allowed: false, reason: "unknown-key" };

	if (!entry.allowedScopes.some((rule) => rule.scope === input.scope)) {
		return { allowed: false, reason: "scope-not-allowed" };
	}

	// Whitelabel has no prompt level: reject prompt-scope writes for everyone,
	// instance admins included, before any role mapping (§4 + A2).
	if (input.mode === "whitelabel" && input.scope === "prompt") {
		return { allowed: false, reason: "prompt-level-disabled" };
	}

	const classMin = CONFIG_POLICY[input.mode][entry.permissionClass];
	// Instance scope raises the floor to instance-admin regardless of class.
	const min = input.scope === "instance" ? stricter(classMin, "instance-admin") : classMin;

	return satisfiesMinRole(input.actor, min)
		? { allowed: true }
		: { allowed: false, reason: reasonForMinRole(min) };
}

/**
 * Decide whether `actor` may write one of the three non-cascading entity tables.
 * All three are instance-admin-only in every writable mode: `model_targets` and
 * `provider_credentials` are instance infrastructure, and `organization_settings`
 * is entitlements — staff-only, so org admins can NEVER write their own plan /
 * overrides (the billing-integrity line; plan changes flow through Stripe). Demo
 * disables every entity write, instance admins included.
 */
export function evaluateEntityWrite(input: {
	mode: DeploymentMode;
	entity: ConfigEntity;
	actor: ConfigActor;
}): ConfigWriteDecision {
	if (input.mode === "demo") return { allowed: false, reason: "writes-disabled" };
	return input.actor.isInstanceAdmin
		? { allowed: true }
		: { allowed: false, reason: "instance-admin-required" };
}
