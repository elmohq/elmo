import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	decryptSecret,
	EncryptionKeyError,
	encryptSecret,
	type EncryptedPayload,
	getEncryptionKey,
	SecretDecryptError,
} from "./crypto";

const KEY = Buffer.alloc(32, 7);
const AAD = "provider-credentials:openai-api";

describe("encryptSecret / decryptSecret", () => {
	it("round-trips arbitrary plaintext", () => {
		const plaintext = 'sk-abc123-{"nested":true}-🔐';
		const payload = encryptSecret(plaintext, { key: KEY, aad: AAD });
		expect(decryptSecret(payload, { key: KEY, aad: AAD })).toBe(plaintext);
	});

	it("stamps a stable keyId (rotation detectable) and version 1", () => {
		const a = encryptSecret("x", { key: KEY, aad: AAD });
		const b = encryptSecret("y", { key: KEY, aad: AAD });
		expect(a.v).toBe(1);
		expect(a.keyId).toMatch(/^[0-9a-f]{8}$/);
		expect(b.keyId).toBe(a.keyId);
		expect(encryptSecret("x", { key: Buffer.alloc(32, 9), aad: AAD }).keyId).not.toBe(a.keyId);
	});

	it("uses a fresh IV every call (no GCM nonce reuse)", () => {
		const ivs = new Set<string>();
		const cts = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const p = encryptSecret("same-plaintext", { key: KEY, aad: AAD });
			ivs.add(p.iv);
			cts.add(p.ct);
		}
		expect(ivs.size).toBe(200);
		expect(cts.size).toBe(200);
	});

	describe("tamper matrix — every failure throws SecretDecryptError, never garbage", () => {
		function fresh(): EncryptedPayload {
			return encryptSecret("top-secret-value", { key: KEY, aad: AAD });
		}

		it("flipped tag byte", () => {
			const p = fresh();
			const tag = Buffer.from(p.tag, "base64");
			tag[0] ^= 0xff;
			expect(() => decryptSecret({ ...p, tag: tag.toString("base64") }, { key: KEY, aad: AAD })).toThrow(
				SecretDecryptError,
			);
		});

		it("wrong AAD", () => {
			expect(() => decryptSecret(fresh(), { key: KEY, aad: "provider-credentials:anthropic-api" })).toThrow(
				SecretDecryptError,
			);
		});

		it("wrong key", () => {
			expect(() => decryptSecret(fresh(), { key: Buffer.alloc(32, 8), aad: AAD })).toThrow(SecretDecryptError);
		});

		it("truncated ciphertext", () => {
			const p = fresh();
			const ct = Buffer.from(p.ct, "base64").subarray(0, 3);
			expect(() => decryptSecret({ ...p, ct: ct.toString("base64") }, { key: KEY, aad: AAD })).toThrow(
				SecretDecryptError,
			);
		});

		it("unknown version", () => {
			expect(() => decryptSecret({ ...fresh(), v: 2 }, { key: KEY, aad: AAD })).toThrow(SecretDecryptError);
		});

		it("malformed payloads", () => {
			for (const bad of [null, undefined, {}, "nope", 42, { v: 1, keyId: "x", iv: "a", ct: "b" }]) {
				expect(() => decryptSecret(bad, { key: KEY, aad: AAD })).toThrow(SecretDecryptError);
			}
		});

		it("wrong-length key", () => {
			expect(() => decryptSecret(fresh(), { key: randomBytes(16), aad: AAD })).toThrow(SecretDecryptError);
		});
	});
});

describe("getEncryptionKey", () => {
	it("returns null when unset or blank", () => {
		expect(getEncryptionKey({})).toBeNull();
		expect(getEncryptionKey({ ELMO_ENCRYPTION_KEY: "" })).toBeNull();
		expect(getEncryptionKey({ ELMO_ENCRYPTION_KEY: "   " })).toBeNull();
	});

	it("decodes a valid 32-byte base64 key", () => {
		const key = randomBytes(32);
		const decoded = getEncryptionKey({ ELMO_ENCRYPTION_KEY: key.toString("base64") });
		expect(decoded).not.toBeNull();
		expect(decoded!.equals(key)).toBe(true);
	});

	it("throws EncryptionKeyError for the wrong decoded length", () => {
		expect(() => getEncryptionKey({ ELMO_ENCRYPTION_KEY: randomBytes(16).toString("base64") })).toThrow(
			EncryptionKeyError,
		);
		expect(() => getEncryptionKey({ ELMO_ENCRYPTION_KEY: randomBytes(64).toString("base64") })).toThrow(
			EncryptionKeyError,
		);
	});
});
