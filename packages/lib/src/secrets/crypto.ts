import { compactDecrypt, CompactEncrypt } from "jose";

const KEY_BYTES = 32; // 256-bit
const CURRENT_VERSION = 1;
const JWE_TYPE = "elmo-provider-credentials";

export const ENCRYPTION_KEY_ENV = "ELMO_ENCRYPTION_KEY";

/** Compact JWE using direct symmetric encryption (`dir`) and AES-256-GCM. */
export type EncryptedPayload = string;

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

export async function encryptSecret(
	plaintext: string,
	opts: { key: Uint8Array; aad: string },
): Promise<EncryptedPayload> {
	return new CompactEncrypt(new TextEncoder().encode(plaintext))
		.setProtectedHeader({
			alg: "dir",
			enc: "A256GCM",
			typ: JWE_TYPE,
			v: CURRENT_VERSION,
			ctx: opts.aad,
		})
		.encrypt(opts.key);
}

export async function decryptSecret(payload: unknown, opts: { key: Uint8Array; aad: string }): Promise<string> {
	try {
		if (typeof payload !== "string") throw new Error("malformed payload");
		const { plaintext, protectedHeader } = await compactDecrypt(payload, opts.key, {
			keyManagementAlgorithms: ["dir"],
			contentEncryptionAlgorithms: ["A256GCM"],
		});
		if (protectedHeader.typ !== JWE_TYPE) throw new Error("unexpected payload type");
		if (protectedHeader.v !== CURRENT_VERSION) {
			throw new Error(`unsupported payload version: ${String(protectedHeader.v)}`);
		}
		if (protectedHeader.ctx !== opts.aad) throw new Error("payload context mismatch");
		return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
	} catch (cause) {
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
