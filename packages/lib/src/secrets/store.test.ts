import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptionKeyError, encryptSecret } from "./crypto";

// instanceCredentialSource reads rows through drizzle; mock the db module so the
// store is testable with no database. `dbState.rows` is the resolved row set for
// `db.select().from().where()`.
const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("../db/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: () => Promise.resolve(dbState.rows) }) }),
	},
}));

import {
	clearCredentialOverlay,
	encryptProviderCredentials,
	getCredential,
	getCredentialKeysForProvider,
	instanceCredentialSource,
	refreshCredentialOverlay,
} from "./store";

const KEY = Buffer.alloc(32, 7);
const KEY_B64 = KEY.toString("base64");

async function encryptedRow(provider: string, record: Record<string, string>, key: Buffer = KEY) {
	return {
		provider,
		encryptedData: await encryptSecret(JSON.stringify(record), { key, aad: `provider-credentials:${provider}` }),
	};
}

beforeEach(() => {
	dbState.rows = [];
	clearCredentialOverlay();
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	clearCredentialOverlay();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("getCredentialKeysForProvider", () => {
	it("maps all eight credentialed providers to their env vars", () => {
		expect(getCredentialKeysForProvider("olostep")).toEqual(["OLOSTEP_API_KEY"]);
		expect(getCredentialKeysForProvider("brightdata")).toEqual(["BRIGHTDATA_API_TOKEN"]);
		expect(getCredentialKeysForProvider("oxylabs")).toEqual(["OXYLABS_USERNAME", "OXYLABS_PASSWORD"]);
		expect(getCredentialKeysForProvider("openai-api")).toEqual(["OPENAI_API_KEY"]);
		expect(getCredentialKeysForProvider("anthropic-api")).toEqual(["ANTHROPIC_API_KEY"]);
		expect(getCredentialKeysForProvider("mistral-api")).toEqual(["MISTRAL_API_KEY"]);
		expect(getCredentialKeysForProvider("dataforseo")).toEqual(["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
		expect(getCredentialKeysForProvider("openrouter")).toEqual(["OPENROUTER_API_KEY"]);
	});

	it("returns [] for credential-less / unknown providers", () => {
		expect(getCredentialKeysForProvider("stub")).toEqual([]);
		expect(getCredentialKeysForProvider("nope")).toEqual([]);
	});

	it("returns a fresh copy each call (no shared mutable state)", () => {
		const keys = getCredentialKeysForProvider("oxylabs");
		keys.push("MUTATED");
		expect(getCredentialKeysForProvider("oxylabs")).toEqual(["OXYLABS_USERNAME", "OXYLABS_PASSWORD"]);
	});
});

describe("getCredential", () => {
	it("falls back to process.env when the overlay is empty", () => {
		vi.stubEnv("OPENAI_API_KEY", "env-value");
		expect(getCredential("OPENAI_API_KEY")).toBe("env-value");
	});

	it("returns undefined when neither overlay nor env has the var", () => {
		vi.stubEnv("SOME_UNSET_CREDENTIAL", undefined);
		expect(getCredential("SOME_UNSET_CREDENTIAL")).toBeUndefined();
	});

	it("a managed value beats process.env, and clearing restores the env fallback", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64);
		vi.stubEnv("OPENAI_API_KEY", "env-value");
		dbState.rows = [await encryptedRow("openai-api", { OPENAI_API_KEY: "db-value" })];

		await refreshCredentialOverlay(instanceCredentialSource);
		expect(getCredential("OPENAI_API_KEY")).toBe("db-value");

		clearCredentialOverlay();
		expect(getCredential("OPENAI_API_KEY")).toBe("env-value");
	});
});

describe("instanceCredentialSource", () => {
	beforeEach(() => vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64));

	it("decrypts rows and applies only the provider's expected keys", async () => {
		vi.stubEnv("UNEXPECTED", undefined);
		dbState.rows = [
			await encryptedRow("oxylabs", { OXYLABS_USERNAME: "u", OXYLABS_PASSWORD: "p", UNEXPECTED: "drop-me" }),
		];

		await refreshCredentialOverlay(instanceCredentialSource);

		expect(getCredential("OXYLABS_USERNAME")).toBe("u");
		expect(getCredential("OXYLABS_PASSWORD")).toBe("p");
		expect(getCredential("UNEXPECTED")).toBeUndefined();
	});

	it("skips encrypted rows when no key is available", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", undefined);
		vi.stubEnv("OPENAI_API_KEY", undefined);
		dbState.rows = [await encryptedRow("openai-api", { OPENAI_API_KEY: "x" })];

		await refreshCredentialOverlay(instanceCredentialSource);

		expect(getCredential("OPENAI_API_KEY")).toBeUndefined();
	});

	it("skips incomplete multi-field credentials instead of mixing them with env values", async () => {
		vi.stubEnv("OXYLABS_USERNAME", undefined);
		dbState.rows = [await encryptedRow("oxylabs", { OXYLABS_USERNAME: "u" })];

		await refreshCredentialOverlay(instanceCredentialSource);

		expect(getCredential("OXYLABS_USERNAME")).toBeUndefined();
	});

	it("does not leak an unknown-provider row's keys onto a real provider", async () => {
		vi.stubEnv("OPENAI_API_KEY", undefined);
		dbState.rows = [await encryptedRow("mystery", { OPENAI_API_KEY: "x" })];

		await refreshCredentialOverlay(instanceCredentialSource);

		expect(getCredential("OPENAI_API_KEY")).toBeUndefined();
	});

	it("a decrypt-failure row omits that provider's keys while healthy providers survive", async () => {
		vi.stubEnv("BRIGHTDATA_API_TOKEN", undefined);
		dbState.rows = [
			await encryptedRow("openai-api", { OPENAI_API_KEY: "ok" }),
			// Encrypted under a different key → GCM auth fails on decrypt.
			await encryptedRow("brightdata", { BRIGHTDATA_API_TOKEN: "nope" }, Buffer.alloc(32, 9)),
		];

		await refreshCredentialOverlay(instanceCredentialSource);

		expect(getCredential("OPENAI_API_KEY")).toBe("ok");
		expect(getCredential("BRIGHTDATA_API_TOKEN")).toBeUndefined();
	});
});

describe("refreshCredentialOverlay", () => {
	it("never keeps a stale overlay value once a provider's row stops decrypting", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64);
		vi.stubEnv("BRIGHTDATA_API_TOKEN", undefined); // no env fallback for this var

		dbState.rows = [await encryptedRow("brightdata", { BRIGHTDATA_API_TOKEN: "first" })];
		await refreshCredentialOverlay(instanceCredentialSource);
		expect(getCredential("BRIGHTDATA_API_TOKEN")).toBe("first");

		// Same provider, now undecryptable — must not fall back to "first".
		dbState.rows = [await encryptedRow("brightdata", { BRIGHTDATA_API_TOKEN: "second" }, Buffer.alloc(32, 3))];
		await refreshCredentialOverlay(instanceCredentialSource);
		expect(getCredential("BRIGHTDATA_API_TOKEN")).toBeUndefined();
	});

	it("degrades to env-only (never throws) when ELMO_ENCRYPTION_KEY is the wrong length", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
		vi.stubEnv("OPENAI_API_KEY", "env-value");
		dbState.rows = [await encryptedRow("openai-api", { OPENAI_API_KEY: "db-value" })];

		await expect(refreshCredentialOverlay(instanceCredentialSource)).resolves.toBeUndefined();
		expect(getCredential("OPENAI_API_KEY")).toBe("env-value");
	});

	it("takes managed values from any source and ignores non-provider keys", async () => {
		vi.stubEnv("OPENAI_API_KEY", "env-value");
		const source = vi.fn(
			async () =>
				new Map([
					["OPENAI_API_KEY", "managed-value"],
					["NOT_A_PROVIDER_KEY", "ignored"],
				]),
		);

		await refreshCredentialOverlay(source);

		expect(source).toHaveBeenCalledOnce();
		expect(getCredential("OPENAI_API_KEY")).toBe("managed-value");
		expect(getCredential("NOT_A_PROVIDER_KEY")).toBeUndefined();
	});

	it("does not mix a partial managed bundle with env values", async () => {
		vi.stubEnv("OXYLABS_PASSWORD", "env-password");

		await refreshCredentialOverlay(async () => new Map([["OXYLABS_USERNAME", "cloud-user"]]));

		expect(getCredential("OXYLABS_USERNAME")).toBeUndefined();
		expect(getCredential("OXYLABS_PASSWORD")).toBe("env-password");
	});

	it("keeps the current overlay when a refresh fails", async () => {
		await refreshCredentialOverlay(async () => new Map([["OPENAI_API_KEY", "current"]]));

		await expect(
			refreshCredentialOverlay(async () => {
				throw new Error("Infisical unavailable");
			}),
		).rejects.toThrow("Infisical unavailable");
		expect(getCredential("OPENAI_API_KEY")).toBe("current");
	});
});

describe("encryptProviderCredentials", () => {
	it("produces a payload that round-trips through the overlay, with a longest-value hint", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64);
		const { encryptedData, hint } = await encryptProviderCredentials("oxylabs", {
			OXYLABS_USERNAME: "user",
			OXYLABS_PASSWORD: "longer-secret",
		});
		expect(hint).toBe("cret"); // last 4 of the longest value "longer-secret"

		dbState.rows = [{ provider: "oxylabs", encryptedData }];
		await refreshCredentialOverlay(instanceCredentialSource);
		expect(getCredential("OXYLABS_USERNAME")).toBe("user");
		expect(getCredential("OXYLABS_PASSWORD")).toBe("longer-secret");
	});

	it("rejects incomplete multi-field credentials", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64);
		await expect(encryptProviderCredentials("oxylabs", { OXYLABS_USERNAME: "user" })).rejects.toThrow(
			/must contain exactly/,
		);
	});

	it("throws EncryptionKeyError when no encryption key is set", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", undefined);
		await expect(encryptProviderCredentials("openai-api", { OPENAI_API_KEY: "x" })).rejects.toThrow(EncryptionKeyError);
	});
});
