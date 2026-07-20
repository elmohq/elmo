import { describe, expect, it } from "vitest";
import { assertValidConfigWrite, getPropertyForKey, getRegistryEntry, REGISTRY } from "./registry";
import type { RegistryEntry } from "./types";

const entries = Object.entries(REGISTRY) as [string, RegistryEntry][];

// Dotted, snake_case, lowercase segments (keys are DB-stored data — DB naming).
const KEY_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*)+$/;
// Resolved-object properties are camelCase identifiers.
const PROPERTY_NAME = /^[a-z][a-zA-Z0-9]*$/;

// Representative valid/invalid samples per key — proves each schema actually
// discriminates, beyond the default validating.
const SAMPLES: Record<string, { valid: unknown[]; invalid: unknown[] }> = {
	"run.cadence_hours": { valid: [24, 3.43, 0.5], invalid: [0, -1, "24", null] },
	"run.replication": { valid: [1, 5], invalid: [0, -1, 5.5, "5"] },
	"run.enabled_models": { valid: [[], ["chatgpt"], ["chatgpt", "gemini"]], invalid: ["chatgpt", [1], null, {}] },
	"run.model_enabled": { valid: [true, false], invalid: ["true", 1, null] },
	"run.model_mode": { valid: ["base", "web"], invalid: ["hybrid", "", null] },
	"onboarding.target": { valid: ["chatgpt:openai-api", "claude:anthropic-api"], invalid: ["", 1, null] },
};

describe("REGISTRY", () => {
	it("covers exactly the keys shipped in PR 1", () => {
		expect(new Set(entries.map(([key]) => key))).toEqual(
			new Set([
				"run.cadence_hours",
				"run.replication",
				"run.enabled_models",
				"run.model_enabled",
				"run.model_mode",
				"onboarding.target",
			]),
		);
	});

	it("uses the map key as the entry key", () => {
		for (const [key, entry] of entries) expect(entry.key).toBe(key);
	});

	it("names every key dotted snake_case with a domain prefix", () => {
		for (const [key, entry] of entries) {
			expect(key, `key "${key}" must be dotted snake_case`).toMatch(KEY_NAME);
			expect(key.split(".")[0], `domain must prefix key "${key}"`).toBe(entry.domain);
		}
	});

	it("maps every key to a unique camelCase property", () => {
		const properties = entries.map(([, entry]) => entry.property);
		for (const [key, entry] of entries) {
			expect(entry.property).toMatch(PROPERTY_NAME);
			expect(getPropertyForKey(key)).toBe(entry.property);
		}
		expect(new Set(properties).size, "properties must be unique").toBe(properties.length);
	});

	it("declares a default that validates its own schema (null = documented absent sentinel)", () => {
		for (const [key, entry] of entries) {
			const ok = entry.default === null || entry.valueSchema.safeParse(entry.default).success;
			expect(ok, `default for "${key}" must validate or be the null sentinel`).toBe(true);
		}
	});

	it("accepts valid values and rejects invalid ones for every key", () => {
		for (const [key, entry] of entries) {
			const sample = SAMPLES[key];
			expect(sample, `missing samples for "${key}"`).toBeDefined();
			for (const value of sample.valid) {
				expect(entry.valueSchema.safeParse(value).success, `${key} should accept ${JSON.stringify(value)}`).toBe(true);
			}
			for (const value of sample.invalid) {
				expect(entry.valueSchema.safeParse(value).success, `${key} should reject ${JSON.stringify(value)}`).toBe(
					false,
				);
			}
		}
	});
});

describe("getRegistryEntry", () => {
	it("returns the entry for a known key", () => {
		expect(getRegistryEntry("run.cadence_hours")?.property).toBe("cadenceHours");
	});

	it("returns undefined for an unknown key", () => {
		expect(getRegistryEntry("run.nope")).toBeUndefined();
	});
});

describe("assertValidConfigWrite", () => {
	it("accepts a valid write and returns the parsed value", () => {
		const result = assertValidConfigWrite({ key: "run.cadence_hours", scope: "brand", value: 12 });
		expect(result).toMatchObject({ ok: true, value: 12 });
	});

	it("rejects an unknown key", () => {
		const result = assertValidConfigWrite({ key: "made.up_key", scope: "instance", value: 1 });
		expect(result).toMatchObject({ ok: false, code: "unknown-key" });
	});

	it("rejects a key at a disallowed scope", () => {
		expect(assertValidConfigWrite({ key: "run.cadence_hours", scope: "prompt", value: 12 })).toMatchObject({
			ok: false,
			code: "scope-not-allowed",
		});
		expect(assertValidConfigWrite({ key: "run.enabled_models", scope: "instance", value: [] })).toMatchObject({
			ok: false,
			code: "scope-not-allowed",
		});
	});

	it("enforces per-scope selector rules", () => {
		// instance + org may carry a model/target selector.
		expect(
			assertValidConfigWrite({ key: "run.cadence_hours", scope: "instance", selector: { model: "claude" }, value: 24 }),
		).toMatchObject({ ok: true });
		// brand rows are selector-less.
		expect(
			assertValidConfigWrite({ key: "run.cadence_hours", scope: "brand", selector: { model: "claude" }, value: 24 }),
		).toMatchObject({ ok: false, code: "selector-not-allowed" });
		// prompt rows require a model selector.
		expect(assertValidConfigWrite({ key: "run.model_enabled", scope: "prompt", value: true })).toMatchObject({
			ok: false,
			code: "selector-not-allowed",
		});
		expect(
			assertValidConfigWrite({ key: "run.model_enabled", scope: "prompt", selector: { model: "claude" }, value: true }),
		).toMatchObject({ ok: true });
		// a target selector is not a model selector.
		expect(
			assertValidConfigWrite({
				key: "run.model_enabled",
				scope: "prompt",
				selector: { targetId: "t1" },
				value: true,
			}),
		).toMatchObject({ ok: false, code: "selector-not-allowed" });
	});

	it("rejects a row that sets both a model and a target selector", () => {
		expect(
			assertValidConfigWrite({
				key: "run.cadence_hours",
				scope: "instance",
				selector: { model: "claude", targetId: "t1" },
				value: 24,
			}),
		).toMatchObject({ ok: false, code: "selector-not-allowed" });
	});

	it("rejects a value that fails the key schema", () => {
		const result = assertValidConfigWrite({ key: "run.cadence_hours", scope: "brand", value: -3 });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("invalid-value");
			if (result.code === "invalid-value") expect(result.issues.length).toBeGreaterThan(0);
		}
	});
});
