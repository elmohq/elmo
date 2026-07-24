import { PROVIDER_CREDENTIAL_KEYS } from "@workspace/config/env-registry";
import { isNull } from "drizzle-orm";
import { db } from "../db/db";
import { providerCredentials } from "../db/schema";
import {
	decryptSecret,
	ENCRYPTION_KEY_ENV,
	type EncryptedPayload,
	EncryptionKeyError,
	encryptSecret,
	getEncryptionKey,
} from "./crypto";

// Providers read every credential through getCredential: a managed override if
// one exists, otherwise process.env. The overlay of managed overrides is rebuilt
// on an interval by refreshCredentialOverlay from a CredentialSource — Infisical
// in managed cloud, the encrypted provider_credentials table when self-hosted.
const overlay = new Map<string, string>();

/** A managed credential source: a flat env-name→value map. Only whole provider
 *  bundles from it reach the overlay (see refreshCredentialOverlay). */
export type CredentialSource = () => Promise<ReadonlyMap<string, string>>;

/** Managed override if present, else process.env. Sync so `isConfigured()` stays sync. */
export function getCredential(name: string): string | undefined {
	return overlay.get(name) ?? process.env[name];
}

/** A provider's credential env-var names (fresh array, safe to mutate). */
export function getCredentialKeysForProvider(providerId: string): string[] {
	return [...(PROVIDER_CREDENTIAL_KEYS.get(providerId) ?? [])];
}

export function clearCredentialOverlay(): void {
	overlay.clear();
}

/** AAD binds each ciphertext to one provider, so a payload can't be replayed
 *  under a different provider even by someone with DB write access. */
function aadForProvider(provider: string): string {
	return `provider-credentials:${provider}`;
}

/** Rebuild the overlay from a managed source. A provider's keys are taken only as
 *  a complete, non-empty set, so a managed username never pairs with an env
 *  password. The overlay is swapped only after the source resolves, so a failed
 *  load (the source throws) keeps the last good values. */
export async function refreshCredentialOverlay(source: CredentialSource): Promise<void> {
	const managed = await source();
	overlay.clear();
	for (const [provider, keys] of PROVIDER_CREDENTIAL_KEYS) {
		const found = keys
			.map((name): [string, string | undefined] => [name, managed.get(name)])
			.filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1].trim().length > 0);
		if (found.length === keys.length) {
			for (const [name, value] of found) overlay.set(name, value);
		} else if (found.length > 0) {
			console.warn(`[secrets] ignoring partial managed credential for "${provider}"`);
		}
	}
}

/** Self-hosted source: decrypt the organization-less provider_credentials rows
 *  into a flat env-name→value map, scoping each row to the keys its provider
 *  declares. A missing key, unknown provider, or undecryptable row contributes
 *  nothing rather than throwing, so one bad row can't take out the others. */
export const instanceCredentialSource: CredentialSource = async () => {
	const managed = new Map<string, string>();

	let key: Buffer | null = null;
	try {
		key = getEncryptionKey();
	} catch (e) {
		if (!(e instanceof EncryptionKeyError)) throw e;
		console.warn(`[secrets] ${e.message} — encrypted credentials skipped, env credentials unaffected`);
	}
	if (!key) return managed;

	const rows = await db
		.select({ provider: providerCredentials.provider, encryptedData: providerCredentials.encryptedData })
		.from(providerCredentials)
		.where(isNull(providerCredentials.organizationId));

	for (const row of rows) {
		const keys = PROVIDER_CREDENTIAL_KEYS.get(row.provider);
		if (!keys) continue;
		let record: unknown;
		try {
			record = JSON.parse(await decryptSecret(row.encryptedData, { key, aad: aadForProvider(row.provider) }));
		} catch {
			console.warn(`[secrets] ignoring undecryptable credential for "${row.provider}"`);
			continue;
		}
		if (typeof record !== "object" || record === null) continue;
		for (const name of keys) {
			const value = (record as Record<string, unknown>)[name];
			if (typeof value === "string") managed.set(name, value);
		}
	}

	return managed;
};

/** Encrypt a provider's full credential set for the write path. `hint` is the
 *  last 4 chars of the longest value — enough to recognise which secret is stored
 *  without revealing it. Throws when no encryption key is set. */
export async function encryptProviderCredentials(
	providerId: string,
	record: Record<string, string>,
): Promise<{ encryptedData: EncryptedPayload; hint: string }> {
	const keys = getCredentialKeysForProvider(providerId);
	if (keys.length === 0) {
		throw new Error(`Provider "${providerId}" has no storable credentials`);
	}
	const isExactBundle =
		Object.keys(record).length === keys.length &&
		keys.every((name) => typeof record[name] === "string" && record[name].trim().length > 0);
	if (!isExactBundle) {
		throw new Error(`Credentials for "${providerId}" must contain exactly: ${keys.join(", ")}`);
	}

	const key = getEncryptionKey();
	if (!key) {
		throw new EncryptionKeyError(`${ENCRYPTION_KEY_ENV} is not set — cannot store encrypted credentials`);
	}
	const encryptedData = await encryptSecret(JSON.stringify(record), { key, aad: aadForProvider(providerId) });
	return { encryptedData, hint: hintFor(record) };
}

function hintFor(record: Record<string, string>): string {
	let longest = "";
	for (const value of Object.values(record)) {
		if (value.length > longest.length) longest = value;
	}
	return longest.slice(-4);
}
