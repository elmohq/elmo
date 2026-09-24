import { createHash } from "node:crypto";
import { CompactEncrypt, compactDecrypt, decodeProtectedHeader } from "jose";

const KEY_BYTES = 32; // 256-bit

export const ENCRYPTION_KEY_ENV = "ELMO_ENCRYPTION_KEY";
export const RETIRED_KEYS_ENV = "ELMO_ENCRYPTION_KEY_OLD";

/** Compact JWE using direct symmetric encryption (`dir`) and AES-256-GCM. */
export type EncryptedPayload = string;

/** Thrown for ANY decryption failure — bad tag, wrong context, wrong key,
 *  malformed payload. Never leaks plaintext or key material. */
export class SecretDecryptError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "SecretDecryptError";
	}
}

/** Thrown when a configured key is unusable (wrong length, or a retired key set
 *  with no current one). */
export class EncryptionKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EncryptionKeyError";
	}
}

/** Thrown when a payload names a key the keyring doesn't hold. Distinct from a
 *  decryption failure: the payload is likely intact, and the fix is to restore
 *  the key rather than to re-enter the secret. */
export class UnknownKeyError extends Error {
	constructor(readonly keyId: string) {
		super(`encrypted under key ${keyId}, which is in neither ${ENCRYPTION_KEY_ENV} nor ${RETIRED_KEYS_ENV}`);
		this.name = "UnknownKeyError";
	}
}

export interface Keyring {
	/** The key new payloads are encrypted under. */
	primary: Buffer;
	/** Every key accepted for decryption, keyed by id — primary included. */
	byId: ReadonlyMap<string, Buffer>;
}

/** Stable, non-secret identifier for a key, stamped into each payload so a
 *  rotation can be completed without re-entering every secret. Domain-separated
 *  so it can never double as a plain hash of the key in another context. */
export function keyId(key: Uint8Array): string {
	return createHash("sha256").update("elmo-secret-key-id\0").update(key).digest("hex").slice(0, 16);
}

export async function encryptSecret(
	plaintext: string,
	opts: { key: Uint8Array; aad: string },
): Promise<EncryptedPayload> {
	return new CompactEncrypt(new TextEncoder().encode(plaintext))
		.setProtectedHeader({ alg: "dir", enc: "A256GCM", kid: keyId(opts.key), ctx: opts.aad })
		.encrypt(opts.key);
}

function readKeyId(payload: unknown): string {
	try {
		if (typeof payload !== "string") throw new Error("malformed payload");
		const { kid } = decodeProtectedHeader(payload);
		if (typeof kid !== "string" || kid.length === 0) throw new Error("payload names no key");
		return kid;
	} catch (cause) {
		throw new SecretDecryptError("failed to decrypt secret", { cause });
	}
}

export async function decryptSecret(payload: unknown, opts: { keyring: Keyring; aad: string }): Promise<string> {
	const kid = readKeyId(payload);
	const key = opts.keyring.byId.get(kid);
	// Choosing the key from a not-yet-authenticated header is safe: the header is
	// the AEAD's additional data, so a rewritten `kid` fails the tag below rather
	// than steering the payload at a key that would decrypt it.
	if (!key) throw new UnknownKeyError(kid);

	try {
		const { plaintext, protectedHeader } = await compactDecrypt(payload as string, key, {
			keyManagementAlgorithms: ["dir"],
			contentEncryptionAlgorithms: ["A256GCM"],
		});
		// Both halves are needed. Editing `ctx` breaks the tag — but jose
		// authenticates the header the payload carries, not the one the caller
		// expected. Comparing them is what stops a whole ciphertext being moved
		// onto another credential's row by someone with DB write access.
		if (protectedHeader.ctx !== opts.aad) throw new Error("payload context mismatch");
		return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
	} catch (cause) {
		throw new SecretDecryptError("failed to decrypt secret", { cause });
	}
}

function decodeKey(raw: string, source: string): Buffer {
	const key = Buffer.from(raw, "base64");
	if (key.length !== KEY_BYTES) {
		throw new EncryptionKeyError(`${source} must be base64 for exactly ${KEY_BYTES} bytes (decoded to ${key.length})`);
	}
	return key;
}

/** Resolve the keyring from the environment: ELMO_ENCRYPTION_KEY encrypts, and
 *  the comma-separated ELMO_ENCRYPTION_KEY_OLD keys stay readable so a rotation
 *  doesn't strand existing rows. Returns null when no key is set at all
 *  (storage disabled, environment credentials unaffected); throws
 *  EncryptionKeyError when a key is set but unusable. */
export function getKeyring(env: NodeJS.ProcessEnv = process.env): Keyring | null {
	const retired = (env[RETIRED_KEYS_ENV] ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	const raw = env[ENCRYPTION_KEY_ENV];
	if (typeof raw !== "string" || raw.trim().length === 0) {
		// Silently ignoring this would leave a half-finished rotation looking
		// complete while every stored secret had quietly stopped being read.
		if (retired.length > 0) {
			throw new EncryptionKeyError(`${RETIRED_KEYS_ENV} is set without ${ENCRYPTION_KEY_ENV}`);
		}
		return null;
	}

	const primary = decodeKey(raw.trim(), ENCRYPTION_KEY_ENV);
	const byId = new Map([[keyId(primary), primary]]);
	for (const key of retired.map((part) => decodeKey(part, RETIRED_KEYS_ENV))) {
		const id = keyId(key);
		if (!byId.has(id)) byId.set(id, key);
	}
	return { primary, byId };
}
