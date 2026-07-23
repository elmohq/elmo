import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptionKeyError, encryptSecret } from "./crypto";

// refreshCredentialOverlay reads instance credential rows through drizzle; mock
// the db module so the store is testable with no database. `dbState.rows` is the
// resolved row set for `db.select().from().where()`.
const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("../db/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: () => Promise.resolve(dbState.rows) }) }),
	},
}));

import {
	applyCredentialRows,
	clearCredentialOverlay,
	type CredentialRow,
	encryptProviderCredentials,
	getCredential,
	getCredentialKeysForProvider,
	refreshCredentialOverlay,
} from "./store";

const KEY = Buffer.alloc(32, 7);
const KEY_B64 = KEY.toString("base64");

function encryptedRow(provider: string, record: Record<string, string>, key: Buffer = KEY): CredentialRow {
	return {
		provider,
		source: "encrypted",
		encryptedData: encryptSecret(JSON.stringify(record), { key, aad: `provider-credentials:${provider}` }),
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

	it("overlay value beats process.env, and clearing restores the env fallback", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64);
		vi.stubEnv("OPENAI_API_KEY", "env-value");
		dbState.rows = [encryptedRow("openai-api", { OPENAI_API_KEY: "db-value" })];

		await refreshCredentialOverlay();
		expect(getCredential("OPENAI_API_KEY")).toBe("db-value");

		clearCredentialOverlay();
		expect(getCredential("OPENAI_API_KEY")).toBe("env-value");
	});
});

describe("applyCredentialRows", () => {
	it("decrypts encrypted rows and applies only the provider's expected keys", () => {
		const map = applyCredentialRows(
			[encryptedRow("oxylabs", { OXYLABS_USERNAME: "u", OXYLABS_PASSWORD: "p", UNEXPECTED: "drop-me" })],
			KEY,
		);
		expect(map.get("OXYLABS_USERNAME")).toBe("u");
		expect(map.get("OXYLABS_PASSWORD")).toBe("p");
		expect(map.has("UNEXPECTED")).toBe(false);
	});

	it("skips secret-ref rows (resolver is a follow-up)", () => {
		const map = applyCredentialRows([{ provider: "openai-api", source: "secret-ref", encryptedData: null }], KEY);
		expect(map.size).toBe(0);
		expect(console.warn).toHaveBeenCalled();
	});

	it("skips encrypted rows when no key is available", () => {
		const map = applyCredentialRows([encryptedRow("openai-api", { OPENAI_API_KEY: "x" })], null);
		expect(map.size).toBe(0);
	});

	it("skips rows for unknown providers", () => {
		const map = applyCredentialRows([encryptedRow("mystery", { OPENAI_API_KEY: "x" })], KEY);
		expect(map.size).toBe(0);
	});

	it("a decrypt-failure row omits that provider's keys while healthy providers survive", () => {
		const good = encryptedRow("openai-api", { OPENAI_API_KEY: "ok" });
		// Encrypted under a different key → GCM auth fails on decrypt.
		const broken = encryptedRow("brightdata", { BRIGHTDATA_API_TOKEN: "nope" }, Buffer.alloc(32, 9));
		const map = applyCredentialRows([good, broken], KEY);
		expect(map.get("OPENAI_API_KEY")).toBe("ok");
		expect(map.has("BRIGHTDATA_API_TOKEN")).toBe(false);
	});
});

describe("refreshCredentialOverlay", () => {
	it("never keeps a stale overlay value once a provider's row stops decrypting", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64);
		vi.stubEnv("BRIGHTDATA_API_TOKEN", undefined); // no env fallback for this var

		dbState.rows = [encryptedRow("brightdata", { BRIGHTDATA_API_TOKEN: "first" })];
		await refreshCredentialOverlay();
		expect(getCredential("BRIGHTDATA_API_TOKEN")).toBe("first");

		// Same provider, now undecryptable — must not fall back to "first".
		dbState.rows = [encryptedRow("brightdata", { BRIGHTDATA_API_TOKEN: "second" }, Buffer.alloc(32, 3))];
		await refreshCredentialOverlay();
		expect(getCredential("BRIGHTDATA_API_TOKEN")).toBeUndefined();
	});

	it("degrades to env-only (never throws) when ELMO_ENCRYPTION_KEY is the wrong length", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
		vi.stubEnv("OPENAI_API_KEY", "env-value");
		dbState.rows = [encryptedRow("openai-api", { OPENAI_API_KEY: "db-value" })];

		await expect(refreshCredentialOverlay()).resolves.toBeUndefined();
		expect(getCredential("OPENAI_API_KEY")).toBe("env-value");
	});
});

describe("encryptProviderCredentials", () => {
	it("produces a payload that round-trips through the overlay, with a longest-value hint", async () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", KEY_B64);
		const { encryptedData, hint } = encryptProviderCredentials("oxylabs", {
			OXYLABS_USERNAME: "user",
			OXYLABS_PASSWORD: "longer-secret",
		});
		expect(hint).toBe("cret"); // last 4 of the longest value "longer-secret"

		dbState.rows = [{ provider: "oxylabs", source: "encrypted", encryptedData }];
		await refreshCredentialOverlay();
		expect(getCredential("OXYLABS_USERNAME")).toBe("user");
		expect(getCredential("OXYLABS_PASSWORD")).toBe("longer-secret");
	});

	it("throws EncryptionKeyError when no encryption key is set", () => {
		vi.stubEnv("ELMO_ENCRYPTION_KEY", undefined);
		expect(() => encryptProviderCredentials("openai-api", { OPENAI_API_KEY: "x" })).toThrow(EncryptionKeyError);
	});
});
