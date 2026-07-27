import { CREDENTIAL_ENV_NAMES } from "@workspace/config/env-registry";
import { db } from "../db/db";
import { secrets } from "../db/schema";
import {
	decryptSecret,
	ENCRYPTION_KEY_ENV,
	type EncryptedPayload,
	EncryptionKeyError,
	encryptSecret,
	getKeyring,
	type Keyring,
	UnknownKeyError,
} from "./crypto";

// Providers read every credential through getCredential: a stored override if
// one exists, otherwise process.env. The overlay of stored overrides is rebuilt
// on an interval by refreshCredentialOverlay (see ./refresh).
const overlay = new Map<string, string>();

/** Stored override if present, else process.env. Sync so `isConfigured()` stays sync. */
export function getCredential(name: string): string | undefined {
	return overlay.get(name) ?? process.env[name];
}

export function clearCredentialOverlay(): void {
	overlay.clear();
}

/** AAD binds each ciphertext to the env var it stands in for, so a payload can't
 *  be replayed under a different name even by someone with DB write access. */
function aadForName(name: string): string {
	return `secret:${name}`;
}

/** Rebuild the overlay from the secrets table. A row whose name is not a known
 *  credential, or that will not decrypt, contributes nothing rather than
 *  throwing, so one bad row can't take out the others. The overlay is swapped
 *  only after every row has been read, so a failed load leaves it untouched. */
export async function refreshCredentialOverlay(): Promise<void> {
	let keyring: Keyring | null = null;
	try {
		keyring = getKeyring();
	} catch (e) {
		if (!(e instanceof EncryptionKeyError)) throw e;
		console.error(`[secrets] ${e.message} — every stored credential is unreadable until this is corrected`);
	}
	// No key means nothing can be stored, so there is no query to make.
	if (!keyring) {
		overlay.clear();
		return;
	}

	const rows = await db.select({ name: secrets.name, encryptedValue: secrets.encryptedValue }).from(secrets);

	const next = new Map<string, string>();
	for (const row of rows) {
		if (!CREDENTIAL_ENV_NAMES.has(row.name)) continue;
		try {
			next.set(row.name, await decryptSecret(row.encryptedValue, { keyring, aad: aadForName(row.name) }));
		} catch (e) {
			console.error(
				e instanceof UnknownKeyError
					? `[secrets] stored secret "${row.name}" is ${e.message} — restore that key there to finish the rotation`
					: `[secrets] stored secret "${row.name}" will not decrypt under the key it names — it may be corrupt or tampered with`,
			);
		}
	}

	overlay.clear();
	for (const [name, value] of next) overlay.set(name, value);
}

/** Encrypt one credential for the write path. Throws when the name is not an
 *  overridable credential, or when no encryption key is set. */
export async function encryptCredential(name: string, value: string): Promise<EncryptedPayload> {
	if (!CREDENTIAL_ENV_NAMES.has(name)) {
		throw new Error(`"${name}" is not an overridable credential`);
	}
	const keyring = getKeyring();
	if (!keyring) {
		throw new EncryptionKeyError(`${ENCRYPTION_KEY_ENV} is not set — cannot store encrypted credentials`);
	}
	return encryptSecret(value, { key: keyring.primary, aad: aadForName(name) });
}
