import type { DeploymentMode } from "@workspace/config/types";
import { describe, expect, it } from "vitest";
import { type ConfigActor, CONFIG_POLICY, evaluateConfigWrite, evaluateEntityWrite } from "./policy";
import type { ConfigEntity } from "./policy";

const ANON: ConfigActor = { isInstanceAdmin: false, orgRole: null };
const MEMBER: ConfigActor = { isInstanceAdmin: false, orgRole: "member" };
const ORG_ADMIN: ConfigActor = { isInstanceAdmin: false, orgRole: "admin" };
const INSTANCE_ADMIN: ConfigActor = { isInstanceAdmin: true, orgRole: null };

const MODES: DeploymentMode[] = ["local", "cloud", "whitelabel", "demo"];

describe("CONFIG_POLICY", () => {
	it("declares a minimum role for every (mode × permission class)", () => {
		for (const mode of MODES) {
			for (const cls of ["run-config", "sampling", "instance-only"] as const) {
				expect(CONFIG_POLICY[mode][cls], `${mode}.${cls}`).toBeDefined();
			}
		}
	});

	it("matches the §4 matrix (any change here is a conscious diff)", () => {
		expect(CONFIG_POLICY).toEqual({
			local: { "run-config": "org-member", sampling: "instance-admin", "instance-only": "instance-admin" },
			cloud: { "run-config": "org-member", sampling: "instance-admin", "instance-only": "instance-admin" },
			whitelabel: { "run-config": "instance-admin", sampling: "instance-admin", "instance-only": "instance-admin" },
			demo: { "run-config": "none", sampling: "none", "instance-only": "none" },
		});
	});
});

describe("evaluateConfigWrite — input validation", () => {
	it("denies an unknown key", () => {
		expect(evaluateConfigWrite({ mode: "local", key: "run.nope", scope: "brand", actor: INSTANCE_ADMIN })).toEqual({
			allowed: false,
			reason: "unknown-key",
		});
	});

	it("denies a key at a scope it does not allow", () => {
		// run.model_mode is prompt-only.
		expect(
			evaluateConfigWrite({ mode: "local", key: "run.model_mode", scope: "brand", actor: INSTANCE_ADMIN }),
		).toEqual({ allowed: false, reason: "scope-not-allowed" });
		// run.enabled_models is brand-only.
		expect(
			evaluateConfigWrite({ mode: "local", key: "run.enabled_models", scope: "instance", actor: INSTANCE_ADMIN }),
		).toEqual({ allowed: false, reason: "scope-not-allowed" });
	});
});

describe("evaluateConfigWrite — role satisfaction", () => {
	it("instance-admin satisfies every class at every writable scope", () => {
		expect(evaluateConfigWrite({ mode: "cloud", key: "run.enabled_models", scope: "brand", actor: INSTANCE_ADMIN }))
			.toEqual({ allowed: true });
		expect(evaluateConfigWrite({ mode: "cloud", key: "run.cadence_hours", scope: "organization", actor: INSTANCE_ADMIN }))
			.toEqual({ allowed: true });
		expect(evaluateConfigWrite({ mode: "cloud", key: "onboarding.target", scope: "instance", actor: INSTANCE_ADMIN }))
			.toEqual({ allowed: true });
	});

	it("org-admin satisfies an org-member requirement (run-config)", () => {
		expect(evaluateConfigWrite({ mode: "cloud", key: "run.enabled_models", scope: "brand", actor: ORG_ADMIN }))
			.toEqual({ allowed: true });
		expect(evaluateConfigWrite({ mode: "cloud", key: "run.enabled_models", scope: "brand", actor: MEMBER }))
			.toEqual({ allowed: true });
	});

	it("an org member is denied sampling and instance-only classes", () => {
		expect(evaluateConfigWrite({ mode: "cloud", key: "run.cadence_hours", scope: "brand", actor: MEMBER }))
			.toEqual({ allowed: false, reason: "instance-admin-required" });
		expect(evaluateConfigWrite({ mode: "cloud", key: "onboarding.target", scope: "instance", actor: MEMBER }))
			.toEqual({ allowed: false, reason: "instance-admin-required" });
	});

	it("a non-member (orgRole null) is denied a run-config write", () => {
		expect(evaluateConfigWrite({ mode: "cloud", key: "run.enabled_models", scope: "brand", actor: ANON }))
			.toEqual({ allowed: false, reason: "org-member-required" });
	});
});

describe("evaluateConfigWrite — structural invariants", () => {
	it("floors instance-scope writes to instance-admin regardless of class", () => {
		// onboarding.target is instance-only, but the floor is the load-bearing
		// guard for any future member-writable key placed at instance scope.
		expect(evaluateConfigWrite({ mode: "local", key: "onboarding.target", scope: "instance", actor: MEMBER }))
			.toEqual({ allowed: false, reason: "instance-admin-required" });
		expect(evaluateConfigWrite({ mode: "local", key: "onboarding.target", scope: "instance", actor: ORG_ADMIN }))
			.toEqual({ allowed: false, reason: "instance-admin-required" });
	});

	it("rejects whitelabel prompt-scope writes for everyone, instance admins included", () => {
		for (const actor of [ANON, MEMBER, ORG_ADMIN, INSTANCE_ADMIN]) {
			expect(evaluateConfigWrite({ mode: "whitelabel", key: "run.model_enabled", scope: "prompt", actor }))
				.toEqual({ allowed: false, reason: "prompt-level-disabled" });
			expect(evaluateConfigWrite({ mode: "whitelabel", key: "run.model_mode", scope: "prompt", actor }))
				.toEqual({ allowed: false, reason: "prompt-level-disabled" });
		}
	});

	it("denies every config write in demo, instance admins included", () => {
		for (const actor of [ANON, MEMBER, ORG_ADMIN, INSTANCE_ADMIN]) {
			expect(evaluateConfigWrite({ mode: "demo", key: "run.enabled_models", scope: "brand", actor }))
				.toEqual({ allowed: false, reason: "writes-disabled" });
			expect(evaluateConfigWrite({ mode: "demo", key: "onboarding.target", scope: "instance", actor }))
				.toEqual({ allowed: false, reason: "writes-disabled" });
		}
	});
});

describe("evaluateEntityWrite", () => {
	const entities: ConfigEntity[] = ["model_targets", "provider_credentials", "organization_settings"];

	it("allows instance admins in every writable mode", () => {
		for (const mode of ["local", "cloud", "whitelabel"] as const) {
			for (const entity of entities) {
				expect(evaluateEntityWrite({ mode, entity, actor: INSTANCE_ADMIN })).toEqual({ allowed: true });
			}
		}
	});

	it("denies org admins (and members) every entity write — entitlements are staff-only", () => {
		for (const mode of ["local", "cloud", "whitelabel"] as const) {
			for (const entity of entities) {
				expect(evaluateEntityWrite({ mode, entity, actor: ORG_ADMIN }))
					.toEqual({ allowed: false, reason: "instance-admin-required" });
				expect(evaluateEntityWrite({ mode, entity, actor: MEMBER }))
					.toEqual({ allowed: false, reason: "instance-admin-required" });
			}
		}
	});

	it("denies every entity write in demo, instance admins included", () => {
		for (const entity of entities) {
			expect(evaluateEntityWrite({ mode: "demo", entity, actor: INSTANCE_ADMIN }))
				.toEqual({ allowed: false, reason: "writes-disabled" });
		}
	});
});
