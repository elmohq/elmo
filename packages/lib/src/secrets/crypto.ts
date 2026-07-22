import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM secret encryption, node:crypto only (zero deps). Discipline per
// the config-hierarchy plan §6: a fresh random 96-bit IV per operation (GCM
// nonce reuse is catastrophic), the auth tag verified on decrypt (fail closed),
// and AAD binding ciphertext to its row purpose so rows can't be swapped.

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // 256-bit
const IV_BYTES = 12; // 96-bit GCM nonce
const TAG_BYTES = 16;
const CURRENT_VERSION = 1;

export const ENCRYPTION_KEY_ENV = "ELMO_ENCRYPTION_KEY";

export interface EncryptedPayload {
	/** Payload format version; only `1` is understood today. */
	v: number;
	/** First 8 hex chars of sha256(key) — lets rotation be detected on read. */
	keyId: string;
	iv: string; // base64
	ct: string; // base64
	tag: string; // base64
}

/** Thrown for ANY decryption failure — bad tag, wrong AAD, wrong key,
 *  malformed payload, unknown version. Never leaks plaintext or key material. */
export class SecretDecryptError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "SecretDecryptError";
	}
}

/** Thrown when ELMO_ENCRYPTION_KEY is present but unusable (wrong length). */
export class EncryptionKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EncryptionKeyError";
	}
}

function keyIdFor(key: Buffer): string {
	return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function encryptSecret(plaintext: string, opts: { key: Buffer; aad: string }): EncryptedPayload {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, opts.key, iv);
	cipher.setAAD(Buffer.from(opts.aad, "utf8"));
	const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return {
		v: CURRENT_VERSION,
		keyId: keyIdFor(opts.key),
		iv: iv.toString("base64"),
		ct: ct.toString("base64"),
		tag: tag.toString("base64"),
	};
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
	if (typeof value !== "object" || value === null) return false;
	const p = value as Record<string, unknown>;
	return (
		typeof p.v === "number" &&
		typeof p.keyId === "string" &&
		typeof p.iv === "string" &&
		typeof p.ct === "string" &&
		typeof p.tag === "string"
	);
}

export function decryptSecret(payload: unknown, opts: { key: Buffer; aad: string }): string {
	try {
		if (!isEncryptedPayload(payload)) throw new Error("malformed payload");
		if (payload.v !== CURRENT_VERSION) throw new Error(`unsupported payload version: ${payload.v}`);
		// The key id is advisory: a mismatch means this row was encrypted under a
		// different key (rotation / wrong env), so surface that precise cause
		// instead of letting it fall through to an opaque GCM auth failure.
		if (payload.keyId !== keyIdFor(opts.key)) throw new Error("payload encrypted under a different key");

		const iv = Buffer.from(payload.iv, "base64");
		const ct = Buffer.from(payload.ct, "base64");
		const tag = Buffer.from(payload.tag, "base64");
		if (iv.length !== IV_BYTES) throw new Error("invalid iv length");
		if (tag.length !== TAG_BYTES) throw new Error("invalid tag length");

		const decipher = createDecipheriv(ALGORITHM, opts.key, iv);
		decipher.setAAD(Buffer.from(opts.aad, "utf8"));
		decipher.setAuthTag(tag);
		const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
		return plaintext.toString("utf8");
	} catch (cause) {
		// Single typed failure — no partial output, no detail that could echo
		// ciphertext/plaintext. The inner cause carries only our own messages.
		throw new SecretDecryptError("failed to decrypt secret", { cause });
	}
}

/** Read ELMO_ENCRYPTION_KEY (base64 → exactly 32 bytes). Returns null when
 *  unset (storage disabled, env credentials unaffected); throws
 *  EncryptionKeyError when set to the wrong length. */
export function getEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
	const raw = env[ENCRYPTION_KEY_ENV];
	if (typeof raw !== "string" || raw.trim().length === 0) return null;
	const key = Buffer.from(raw, "base64");
	if (key.length !== KEY_BYTES) {
		throw new EncryptionKeyError(
			`${ENCRYPTION_KEY_ENV} must be base64 for exactly ${KEY_BYTES} bytes (decoded to ${key.length})`,
		);
	}
	return key;
}
