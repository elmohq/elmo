/**
 * The four deployment-mode config contracts + the exhaustive CONFIG_POLICY
 * matrix (plan §9). These are the executable spec for "who may write which
 * config where" in each mode.
 *
 * The matrix's row source is the REAL registry (`REGISTRY`), so a new key
 * automatically joins the matrix (A3) and cannot ship ungated. The expected
 * outcomes derive from an EXPECTED_POLICY literal written out below — a snapshot
 * decoupled from the source `CONFIG_POLICY`, so any policy cell change is a
 * conscious, visible diff in this file, not a silent behavior shift.
 */
import type { DeploymentMode } from "@workspace/config/types";
import { CONFIG_POLICY, type ConfigActor, type ConfigEntity, evaluateConfigWrite, evaluateEntityWrite, type MinRole } from "@workspace/lib/config/policy";
import { REGISTRY } from "@workspace/lib/config/registry";
import type { ConfigScope, PermissionClass, RegistryEntry } from "@workspace/lib/config/types";
import { describe, expect, it } from "vitest";

const registryEntries = Object.entries(REGISTRY) as [string, RegistryEntry][];
const scopesOf = (entry: RegistryEntry): ConfigScope[] => entry.allowedScopes.map((rule) => rule.scope);

const MODES: DeploymentMode[] = ["local", "cloud", "whitelabel", "demo"];
const ENTITIES: ConfigEntity[] = ["model_targets", "provider_credentials", "organization_settings"];

const ACTORS = {
	anonymous: { isInstanceAdmin: false, orgRole: null },
	member: { isInstanceAdmin: false, orgRole: "member" },
	orgAdmin: { isInstanceAdmin: false, orgRole: "admin" },
	instanceAdmin: { isInstanceAdmin: true, orgRole: null },
} satisfies Record<string, ConfigActor>;

// ── Independent oracle ──────────────────────────────────────────────────────
// EXPECTED_POLICY mirrors CONFIG_POLICY but is maintained by hand here, and the
// allow/deny derivation below re-implements the two structural invariants
// (instance-admin floor, whitelabel-no-prompt) from the spec rather than
// importing the source logic — so this suite is an oracle, not a mirror.

const EXPECTED_POLICY: Record<DeploymentMode, Record<PermissionClass, MinRole>> = {
	local: { "run-config": "org-member", sampling: "instance-admin", "instance-only": "instance-admin" },
	cloud: { "run-config": "org-member", sampling: "instance-admin", "instance-only": "instance-admin" },
	whitelabel: { "run-config": "instance-admin", sampling: "instance-admin", "instance-only": "instance-admin" },
	demo: { "run-config": "none", sampling: "none", "instance-only": "none" },
};

const RANK: Record<MinRole, number> = { "org-member": 0, "org-admin": 1, "instance-admin": 2, none: 3 };
const stricter = (a: MinRole, b: MinRole): MinRole => (RANK[a] >= RANK[b] ? a : b);

function actorSatisfies(actor: ConfigActor, min: MinRole): boolean {
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

function expectedAllowed(mode: DeploymentMode, entry: RegistryEntry, scope: ConfigScope, actor: ConfigActor): boolean {
	if (mode === "whitelabel" && scope === "prompt") return false;
	const classMin = EXPECTED_POLICY[mode][entry.permissionClass];
	const min = scope === "instance" ? stricter(classMin, "instance-admin") : classMin;
	return actorSatisfies(actor, min);
}

// ── CONFIG_POLICY matrix ────────────────────────────────────────────────────

describe("CONFIG_POLICY matrix", () => {
	it("CONFIG_POLICY matches the EXPECTED_POLICY snapshot (any cell change is a visible diff)", () => {
		expect(CONFIG_POLICY).toEqual(EXPECTED_POLICY);
	});

	for (const [key, entry] of registryEntries) {
		for (const scope of scopesOf(entry)) {
			for (const mode of MODES) {
				for (const [actorName, actor] of Object.entries(ACTORS)) {
					const expected = expectedAllowed(mode, entry, scope, actor);
					it(`${mode} / ${key} @ ${scope} / ${actorName} → ${expected ? "allow" : "deny"}`, () => {
						expect(evaluateConfigWrite({ mode, key, scope, actor }).allowed).toBe(expected);
					});
				}
			}
		}
	}
});

// ── Whitelabel contract ─────────────────────────────────────────────────────
// Members lose nothing (run config was never theirs); admins gain the surfaces
// they already governed via env — except the prompt level, which does not exist.

describe("whitelabel contract", () => {
	it("denies a member every run-config write at every scope", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				expect(
					evaluateConfigWrite({ mode: "whitelabel", key, scope, actor: ACTORS.member }).allowed,
					`${key}@${scope}`,
				).toBe(false);
			}
		}
	});

	it("allows an instance admin at instance/org/brand scopes but denies prompt scope", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				const decision = evaluateConfigWrite({ mode: "whitelabel", key, scope, actor: ACTORS.instanceAdmin });
				if (scope === "prompt") {
					expect(decision, `${key}@${scope}`).toEqual({ allowed: false, reason: "prompt-level-disabled" });
				} else {
					expect(decision, `${key}@${scope}`).toEqual({ allowed: true });
				}
			}
		}
	});

	it("gates entity writes to instance admins", () => {
		for (const entity of ENTITIES) {
			expect(evaluateEntityWrite({ mode: "whitelabel", entity, actor: ACTORS.member }).allowed).toBe(false);
			expect(evaluateEntityWrite({ mode: "whitelabel", entity, actor: ACTORS.orgAdmin }).allowed).toBe(false);
			expect(evaluateEntityWrite({ mode: "whitelabel", entity, actor: ACTORS.instanceAdmin })).toEqual({ allowed: true });
		}
	});
});

// ── Demo contract ───────────────────────────────────────────────────────────
// Everything read-only, including for the seeded admin — defense in depth under
// the readOnly middleware.

describe("demo contract", () => {
	it("denies every config write for every actor, instance admin included", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				for (const [actorName, actor] of Object.entries(ACTORS)) {
					expect(
						evaluateConfigWrite({ mode: "demo", key, scope, actor }).allowed,
						`${key}@${scope}/${actorName}`,
					).toBe(false);
				}
			}
		}
	});

	it("denies every entity write for every actor, instance admin included", () => {
		for (const entity of ENTITIES) {
			for (const [actorName, actor] of Object.entries(ACTORS)) {
				expect(evaluateEntityWrite({ mode: "demo", entity, actor }).allowed, `${entity}/${actorName}`).toBe(false);
			}
		}
	});
});

// ── Local contract ──────────────────────────────────────────────────────────
// The sole user is both instance admin and org member; the formal split still
// matters for tests and future multi-user local.

describe("local contract", () => {
	it("allows the instance admin every config write (no whitelabel-style prompt denial)", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				expect(
					evaluateConfigWrite({ mode: "local", key, scope, actor: ACTORS.instanceAdmin }),
					`${key}@${scope}`,
				).toEqual({ allowed: true });
			}
		}
	});

	it("allows a plain org member run-config writes but denies sampling and instance-only", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				const expected = entry.permissionClass === "run-config" && scope !== "instance";
				expect(
					evaluateConfigWrite({ mode: "local", key, scope, actor: ACTORS.member }).allowed,
					`${key}@${scope}`,
				).toBe(expected);
			}
		}
	});
});

// ── Cloud contract ──────────────────────────────────────────────────────────
// Aspirations as spec (§14 decision 6): members write run config within
// entitlements; sampling + entitlements are staff-only; org admins are not
// elevated for config.

describe("cloud contract", () => {
	it("allows a member run-config writes (brand/prompt) and denies sampling/instance-only", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				const expected = entry.permissionClass === "run-config" && scope !== "instance";
				expect(
					evaluateConfigWrite({ mode: "cloud", key, scope, actor: ACTORS.member }).allowed,
					`${key}@${scope}`,
				).toBe(expected);
			}
		}
	});

	it("gives an org admin the same config rights as a member (no elevation)", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				const asMember = evaluateConfigWrite({ mode: "cloud", key, scope, actor: ACTORS.member });
				const asAdmin = evaluateConfigWrite({ mode: "cloud", key, scope, actor: ACTORS.orgAdmin });
				expect(asAdmin, `${key}@${scope}`).toEqual(asMember);
			}
		}
	});

	it("allows the instance admin every config write", () => {
		for (const [key, entry] of registryEntries) {
			for (const scope of scopesOf(entry)) {
				expect(
					evaluateConfigWrite({ mode: "cloud", key, scope, actor: ACTORS.instanceAdmin }),
					`${key}@${scope}`,
				).toEqual({ allowed: true });
			}
		}
	});

	it("denies an org admin the organization_settings entity write but allows the instance admin", () => {
		expect(evaluateEntityWrite({ mode: "cloud", entity: "organization_settings", actor: ACTORS.orgAdmin })).toEqual({
			allowed: false,
			reason: "instance-admin-required",
		});
		expect(evaluateEntityWrite({ mode: "cloud", entity: "organization_settings", actor: ACTORS.instanceAdmin })).toEqual({
			allowed: true,
		});
	});
});

// ── Deny-reason assertions ──────────────────────────────────────────────────

describe("deny reasons", () => {
	it("unknown key", () => {
		expect(
			evaluateConfigWrite({ mode: "local", key: "run.does_not_exist", scope: "brand", actor: ACTORS.instanceAdmin }),
		).toEqual({ allowed: false, reason: "unknown-key" });
	});

	it("scope not allowed (run.model_mode at brand scope)", () => {
		expect(
			evaluateConfigWrite({ mode: "local", key: "run.model_mode", scope: "brand", actor: ACTORS.instanceAdmin }),
		).toEqual({ allowed: false, reason: "scope-not-allowed" });
	});

	it("whitelabel prompt-level disabled (even for the instance admin)", () => {
		expect(
			evaluateConfigWrite({ mode: "whitelabel", key: "run.model_enabled", scope: "prompt", actor: ACTORS.instanceAdmin }),
		).toEqual({ allowed: false, reason: "prompt-level-disabled" });
	});

	it("organization_settings by an org admin (staff-only entitlements)", () => {
		expect(evaluateEntityWrite({ mode: "cloud", entity: "organization_settings", actor: ACTORS.orgAdmin })).toEqual({
			allowed: false,
			reason: "instance-admin-required",
		});
	});
});
