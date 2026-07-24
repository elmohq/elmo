import { randomBytes } from "node:crypto";
import { CompactEncrypt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { decryptSecret, EncryptionKeyError, encryptSecret, getEncryptionKey, SecretDecryptError } from "./crypto";

const KEY = Buffer.alloc(32, 7);
const AAD = "provider-credentials:openai-api";

describe("encryptSecret / decryptSecret", () => {
	it("round-trips arbitrary plaintext", async () => {
		const plaintext = 'sk-abc123-{"nested":true}-🔐';
		const payload = await encryptSecret(plaintext, { key: KEY, aad: AAD });
		await expect(decryptSecret(payload, { key: KEY, aad: AAD })).resolves.toBe(plaintext);
	});

	it("uses the standard direct A256GCM JWE format with authenticated metadata", async () => {
		const payload = await encryptSecret("x", { key: KEY, aad: AAD });
		expect(payload.split(".")).toHaveLength(5);
		expect(decodeProtectedHeader(payload)).toEqual({
			alg: "dir",
			enc: "A256GCM",
			typ: "elmo-provider-credentials",
			v: 1,
			ctx: AAD,
		});
	});

	it("uses a fresh IV every call (no GCM nonce reuse)", async () => {
		const ivs = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const payload = await encryptSecret("same-plaintext", { key: KEY, aad: AAD });
			ivs.add(payload.split(".")[2]);
		}
		expect(ivs.size).toBe(200);
	});

	describe("tamper matrix — every failure throws SecretDecryptError, never garbage", () => {
		function fresh(): Promise<string> {
			return encryptSecret("top-secret-value", { key: KEY, aad: AAD });
		}

		function corruptSegment(payload: string, index: number): string {
			const segments = payload.split(".");
			const segment = segments[index];
			segments[index] = `${segment[0] === "A" ? "B" : "A"}${segment.slice(1)}`;
			return segments.join(".");
		}

		it("flipped tag byte", async () => {
			await expect(decryptSecret(corruptSegment(await fresh(), 4), { key: KEY, aad: AAD })).rejects.toThrow(
				SecretDecryptError,
			);
		});

		it("wrong AAD", async () => {
			await expect(
				decryptSecret(await fresh(), { key: KEY, aad: "provider-credentials:anthropic-api" }),
			).rejects.toThrow(SecretDecryptError);
		});

		it("wrong key", async () => {
			await expect(decryptSecret(await fresh(), { key: Buffer.alloc(32, 8), aad: AAD })).rejects.toThrow(
				SecretDecryptError,
			);
		});

		it("truncated ciphertext", async () => {
			const segments = (await fresh()).split(".");
			segments[3] = segments[3].slice(0, 3);
			await expect(decryptSecret(segments.join("."), { key: KEY, aad: AAD })).rejects.toThrow(SecretDecryptError);
		});

		it("unknown version", async () => {
			const payload = await new CompactEncrypt(new TextEncoder().encode("top-secret-value"))
				.setProtectedHeader({
					alg: "dir",
					enc: "A256GCM",
					typ: "elmo-provider-credentials",
					v: 2,
					ctx: AAD,
				})
				.encrypt(KEY);
			await expect(decryptSecret(payload, { key: KEY, aad: AAD })).rejects.toThrow(SecretDecryptError);
		});

		it("malformed payloads", async () => {
			for (const bad of [null, undefined, {}, "nope", 42, { v: 1, keyId: "x", iv: "a", ct: "b" }]) {
				await expect(decryptSecret(bad, { key: KEY, aad: AAD })).rejects.toThrow(SecretDecryptError);
			}
		});

		it("wrong-length key", async () => {
			await expect(decryptSecret(await fresh(), { key: randomBytes(16), aad: AAD })).rejects.toThrow(
				SecretDecryptError,
			);
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
