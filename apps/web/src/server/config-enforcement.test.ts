import { describe, expect, it } from "vitest";
import { UNLIMITED_COUNT } from "@workspace/config/plans";
import { type Entitlements, UNLIMITED_ENTITLEMENTS } from "@workspace/lib/config/entitlements";
import {
	EntitlementLimitError,
	type ScopeIds,
	assertBrandLimit,
	assertBrandModelPicks,
	assertClaudePoolHeadroom,
	assertOrgPromptLimit,
	buildProviderCredentialStatus,
	planConfigWrite,
} from "./config-enforcement";

const cloud = (overrides: Partial<Entitlements> = {}): Entitlements => ({
	planKey: "starter",
	maxBrands: 1,
	maxPromptsPerOrg: 50,
	maxCompetitorsPerBrand: null,
	standardModelPicks: 4,
	standardModelMenu: ["chatgpt", "gemini", "perplexity", "copilot"],
	claudePromptPool: 2,
	maxRunsPerDay: { "*": 4, claude: 1 },
	allowWebSearchApiTargets: false,
	allowCustomTargets: false,
	...overrides,
});

describe("assertBrandModelPicks", () => {
	it("rejects picks off the plan menu", () => {
		expect(() => assertBrandModelPicks(cloud(), ["chatgpt", "claude"])).toThrow(EntitlementLimitError);
		expect(() => assertBrandModelPicks(cloud(), ["chatgpt", "claude"])).toThrow(/claude/);
	});

	it("rejects more picks than the plan allows", () => {
		expect(() => assertBrandModelPicks(cloud({ standardModelPicks: 1 }), ["chatgpt", "gemini"])).toThrow(
			/up to 1 tracked model/,
		);
	});

	it("allows exactly the pick limit from the menu", () => {
		expect(() => assertBrandModelPicks(cloud(), ["chatgpt", "gemini", "perplexity", "copilot"])).not.toThrow();
	});

	it("is inert for unlimited (non-cloud) entitlements", () => {
		expect(() => assertBrandModelPicks(UNLIMITED_ENTITLEMENTS, ["anything", "at", "all"])).not.toThrow();
	});
});

describe("assertOrgPromptLimit", () => {
	it("blocks at the cloud limit", () => {
		expect(() => assertOrgPromptLimit(cloud(), 50, 1)).toThrow(EntitlementLimitError);
		expect(() => assertOrgPromptLimit(cloud(), 50, 1)).toThrow(/up to 50 prompts/);
	});

	it("allows landing exactly on the limit", () => {
		expect(() => assertOrgPromptLimit(cloud(), 49, 1)).not.toThrow();
	});

	it("is inert when unlimited (non-cloud)", () => {
		expect(() => assertOrgPromptLimit(UNLIMITED_ENTITLEMENTS, 100000, 100)).not.toThrow();
	});
});

describe("assertClaudePoolHeadroom", () => {
	it("blocks when the projected usage exceeds the pool", () => {
		expect(() => assertClaudePoolHeadroom(cloud(), 3)).toThrow(/Claude pool allows 2 prompts/);
	});

	it("allows exactly the pool size", () => {
		expect(() => assertClaudePoolHeadroom(cloud(), 2)).not.toThrow();
	});

	it("is inert at the unlimited sentinel", () => {
		expect(() => assertClaudePoolHeadroom(cloud({ claudePromptPool: UNLIMITED_COUNT }), 10_000_000)).not.toThrow();
	});
});

describe("assertBrandLimit", () => {
	it("blocks creating past maxBrands", () => {
		expect(() => assertBrandLimit(cloud(), 1)).toThrow(/up to 1 brand/);
	});

	it("allows under the limit and when unlimited", () => {
		expect(() => assertBrandLimit(cloud(), 0)).not.toThrow();
		expect(() => assertBrandLimit(UNLIMITED_ENTITLEMENTS, 5000)).not.toThrow();
	});
});

describe("planConfigWrite", () => {
	const brandIds: ScopeIds = { scope: "brand", organizationId: null, brandId: "b-1", promptId: null };
	const promptIds: ScopeIds = { scope: "prompt", organizationId: null, brandId: null, promptId: "p-1" };

	it("plans an upsert for a valid brand-scope write", () => {
		const plan = planConfigWrite(brandIds, { key: "run.enabled_models", value: ["chatgpt"] });
		expect(plan).toMatchObject({
			action: "upsert",
			scope: "brand",
			brandId: "b-1",
			organizationId: null,
			promptId: null,
			model: null,
			targetId: null,
			key: "run.enabled_models",
			value: ["chatgpt"],
		});
	});

	it("plans an upsert for a prompt-scope model-selector write", () => {
		const plan = planConfigWrite(promptIds, {
			key: "run.model_mode",
			selector: { model: "claude" },
			value: "web",
		});
		expect(plan).toMatchObject({ action: "upsert", promptId: "p-1", model: "claude", value: "web" });
	});

	it("rejects an unknown key", () => {
		expect(() => planConfigWrite(brandIds, { key: "run.does_not_exist", value: 1 })).toThrow(/Unknown config key/);
	});

	it("rejects a key at a scope it does not allow", () => {
		expect(() =>
			planConfigWrite(brandIds, { key: "run.model_mode", selector: { model: "claude" }, value: "web" }),
		).toThrow(/not allowed at scope "brand"/);
	});

	it("rejects a missing required selector", () => {
		expect(() => planConfigWrite(promptIds, { key: "run.model_mode", value: "web" })).toThrow(
			/Selector "none" is not allowed/,
		);
	});

	it("rejects carrying both selectors", () => {
		expect(() =>
			planConfigWrite(promptIds, {
				key: "run.model_mode",
				selector: { model: "claude", targetId: "t-1" },
				value: "web",
			}),
		).toThrow(/cannot carry both/);
	});

	it("rejects a value that fails the key schema", () => {
		expect(() => planConfigWrite(brandIds, { key: "run.cadence_hours", value: -4 })).toThrow(/failed validation/);
	});

	it("plans a delete for null and undefined values (revert to inherit)", () => {
		expect(planConfigWrite(brandIds, { key: "run.enabled_models", value: null })).toMatchObject({
			action: "delete",
			key: "run.enabled_models",
			brandId: "b-1",
		});
		expect(planConfigWrite(brandIds, { key: "run.enabled_models" })).toMatchObject({ action: "delete" });
	});

	it("rejects deleting an unknown key but tolerates a mis-scoped delete (no-op row match)", () => {
		expect(() => planConfigWrite(brandIds, { key: "run.nope" })).toThrow(/Unknown config key/);
		expect(planConfigWrite(brandIds, { key: "run.model_mode" })).toMatchObject({ action: "delete" });
	});
});

describe("buildProviderCredentialStatus", () => {
	it("reports env-configured providers", () => {
		const status = buildProviderCredentialStatus({ provider: "olostep", envConfigured: true, row: null });
		expect(status).toEqual({
			provider: "olostep",
			configuredViaEnv: true,
			hasStoredCredential: false,
			hint: null,
			lastVerifiedAt: null,
			lastVerifyError: null,
			source: "env",
		});
	});

	it("reports stored encrypted credentials with hint and verification state", () => {
		const verifiedAt = new Date("2026-07-01T00:00:00Z");
		const status = buildProviderCredentialStatus({
			provider: "olostep",
			envConfigured: false,
			row: { source: "encrypted", hint: "x9k2", lastVerifiedAt: verifiedAt, lastVerifyError: null },
		});
		expect(status.source).toBe("encrypted");
		expect(status.hasStoredCredential).toBe(true);
		expect(status.hint).toBe("x9k2");
		expect(status.lastVerifiedAt).toBe(verifiedAt.toISOString());
	});

	it("reports unconfigured providers", () => {
		const status = buildProviderCredentialStatus({ provider: "oxylabs", envConfigured: false, row: null });
		expect(status.source).toBe("unconfigured");
	});

	it("never carries payload fields — the shape is exactly the status keys", () => {
		const status = buildProviderCredentialStatus({
			provider: "olostep",
			envConfigured: false,
			row: { source: "encrypted", hint: "abcd", lastVerifiedAt: null, lastVerifyError: null },
		});
		expect(Object.keys(status).sort()).toEqual([
			"configuredViaEnv",
			"hasStoredCredential",
			"hint",
			"lastVerifiedAt",
			"lastVerifyError",
			"provider",
			"source",
		]);
	});
});
