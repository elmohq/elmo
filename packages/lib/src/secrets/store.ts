import { ENV_REGISTRY } from "@workspace/config/env-registry";
import { isNull } from "drizzle-orm";
import { db } from "../db/db";
import { providerCredentials } from "../db/schema";
import {
	decryptSecret,
	ENCRYPTION_KEY_ENV,
	encryptSecret,
	EncryptionKeyError,
	type EncryptedPayload,
	getEncryptionKey,
} from "./crypto";

// The credential overlay: DB-backed provider credentials, refreshed from
// `provider_credentials` on worker boot + interval and per-request in web.
// `getCredential` reads it, falling back to process.env — so with an empty
// overlay behaviour is byte-identical to reading process.env directly.
const overlay = new Map<string, string>();

/** Provider id → its credential env-var names, derived from the ENV_REGISTRY
 *  entries that declare a provider (requiredBy "dynamic-scrape-targets").
 *  Optional, env-only vars such as BRIGHTDATA_SERP_ZONE carry no provider
 *  marker and so stay out of the DB credential lifecycle. */
export function getCredentialKeysForProvider(providerId: string): string[] {
	return ENV_REGISTRY.filter(
		(spec) => spec.requiredBy === "dynamic-scrape-targets" && spec.provider === providerId,
	).map((spec) => spec.name);
}

/** Overlay value if present, else process.env. Sync so `isConfigured()` stays sync. */
export function getCredential(name: string): string | undefined {
	const overlaid = overlay.get(name);
	return overlaid !== undefined ? overlaid : process.env[name];
}

export function clearCredentialOverlay(): void {
	overlay.clear();
}

/** AAD binds a ciphertext to one provider's credential row, so an attacker with
 *  DB write access can't move a decryptable payload between providers. */
function aadForProvider(provider: string): string {
	return `provider-credentials:${provider}`;
}

export interface CredentialRow {
	provider: string;
	source: string;
	encryptedData: unknown;
}

/** Pure: build the overlay contents from instance credential rows. Decrypt
 *  failures and secret-refs are skipped with one warn each and never fall back
 *  to a stale value — a provider's keys only appear when its row decrypts
 *  cleanly this cycle. Kept side-effect free (no DB) so it's unit-testable. */
export function applyCredentialRows(rows: CredentialRow[], key: Buffer | null): Map<string, string> {
	const next = new Map<string, string>();

	for (const row of rows) {
		if (row.source === "secret-ref") {
			// Infisical/Vault resolution is an explicit follow-up (plan §6).
			console.warn(`[secrets] skipping secret-ref credential for "${row.provider}" — resolver not implemented`);
			continue;
		}
		if (row.source !== "encrypted") {
			console.warn(`[secrets] skipping credential for "${row.provider}" — unknown source "${row.source}"`);
			continue;
		}

		const allowed = getCredentialKeysForProvider(row.provider);
		if (allowed.length === 0) {
			console.warn(`[secrets] skipping credential for unknown provider "${row.provider}"`);
			continue;
		}
		if (!key) {
			console.warn(`[secrets] skipping encrypted credential for "${row.provider}" — ${ENCRYPTION_KEY_ENV} not set`);
			continue;
		}

		let record: unknown;
		try {
			record = JSON.parse(decryptSecret(row.encryptedData, { key, aad: aadForProvider(row.provider) }));
		} catch {
			// Fail closed: skip this row, and its keys stay absent from `next`.
			console.warn(`[secrets] skipping credential for "${row.provider}" — decrypt/parse failed`);
			continue;
		}
		if (typeof record !== "object" || record === null || Array.isArray(record)) {
			console.warn(`[secrets] skipping credential for "${row.provider}" — payload is not a record`);
			continue;
		}

		const allowedSet = new Set(allowed);
		for (const [name, value] of Object.entries(record as Record<string, unknown>)) {
			// Validate keys against the provider's expected env vars; ignore extras.
			if (allowedSet.has(name) && typeof value === "string") next.set(name, value);
		}
	}

	return next;
}

/** Reload the overlay from instance-scope (organizationId IS NULL) credential
 *  rows. Resilient: a bad key or an undecryptable row degrades to env-only for
 *  that provider rather than throwing. */
export async function refreshCredentialOverlay(): Promise<void> {
	let key: Buffer | null = null;
	try {
		key = getEncryptionKey();
	} catch (e) {
		if (e instanceof EncryptionKeyError) {
			console.warn(`[secrets] ${e.message} — encrypted credentials skipped, env credentials unaffected`);
		} else {
			throw e;
		}
	}

	const rows = await db
		.select({
			provider: providerCredentials.provider,
			source: providerCredentials.source,
			encryptedData: providerCredentials.encryptedData,
		})
		.from(providerCredentials)
		.where(isNull(providerCredentials.organizationId));

	const next = applyCredentialRows(rows, key);
	overlay.clear();
	for (const [name, value] of next) overlay.set(name, value);
}

/** Encrypt a provider's credential record for the web write path (Round 4b).
 *  `hint` is the last 4 chars of the longest value — enough to recognise which
 *  key is stored without revealing it. Throws when no encryption key is set. */
export function encryptProviderCredentials(
	providerId: string,
	record: Record<string, string>,
): { encryptedData: EncryptedPayload; hint: string } {
	const key = getEncryptionKey();
	if (!key) {
		throw new EncryptionKeyError(`${ENCRYPTION_KEY_ENV} is not set — cannot store encrypted credentials`);
	}
	const encryptedData = encryptSecret(JSON.stringify(record), { key, aad: aadForProvider(providerId) });
	return { encryptedData, hint: hintFor(record) };
}

function hintFor(record: Record<string, string>): string {
	let longest = "";
	for (const value of Object.values(record)) {
		if (value.length > longest.length) longest = value;
	}
	return longest.slice(-4);
}
