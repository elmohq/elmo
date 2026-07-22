/**
 * Server-only implementations behind `instance-config.ts` (§3b): the
 * model-target catalog, provider credentials, and organization settings
 * (entitlements). Kept apart from the `createServerFn` surface so the wrapper
 * module carries no server-only imports outside handler bodies.
 *
 * All writes gate through `requireEntityWrite` — instance-admin only in every
 * writable mode, denied wholesale in demo (plus the global readOnly
 * middleware). Reads are instance-admin surfaces (admin UI) and stay readable
 * in demo so the pages can render.
 *
 * CREDENTIAL SAFETY: credential values are write-only. No response ever carries
 * plaintext, `encryptedData`, or `secretRef` — list/upsert/delete/verify all
 * return the status shape from `buildProviderCredentialStatus` (presence, a
 * 4-char hint, verification bookkeeping), and the list query never selects the
 * payload columns at all.
 */
import { PLANS } from "@workspace/config/plans";
import { getEntitlements } from "@workspace/lib/config/entitlements";
import { clearConfigCache } from "@workspace/lib/config/resolve";
import { db } from "@workspace/lib/db/db";
import { modelTargets, organization, organizationSettings, providerCredentials } from "@workspace/lib/db/schema";
import { getAllProviders, getProvider } from "@workspace/lib/providers";
import {
	encryptProviderCredentials,
	getCredentialKeysForProvider,
	refreshCredentialOverlay,
} from "@workspace/lib/secrets";
import { and, asc, eq, isNull } from "drizzle-orm";
import { isAdmin, requireAuthSession } from "@/lib/auth/helpers";
import { requireEntityWrite } from "@/lib/auth/config-gates";
import {
	buildProviderCredentialStatus,
	type JsonValue,
	type ProviderCredentialStatus,
} from "@/server/config-enforcement";
// Type-only (erased at runtime — no circular import): the write validator and
// its inferred shape live in the wrapper module.
import type { EntitlementOverridesInput } from "./instance-config";

/** Read gate for the admin config surfaces (demo renders them read-only). */
export async function requireInstanceAdminRead() {
	const session = await requireAuthSession();
	if (!isAdmin(session)) throw new Error("Unauthorized: Admin access required");
	return session;
}

// ============================================================================
// Model targets (the catalog)
// ============================================================================

/** Same set `validateScrapeTargets` requires a version slug for. */
const VERSION_REQUIRED_PROVIDERS = new Set(["openai-api", "anthropic-api", "mistral-api", "openrouter"]);

/**
 * Shape/placement validation for a catalog row. Deliberately does NOT require
 * the provider to be configured: targets may be added before their credentials,
 * and the resolver skips-and-surfaces unready targets instead of failing.
 */
function validateTargetInput(input: {
	model: string;
	provider: string;
	version: string | null;
	webSearch: boolean;
}): void {
	let provider: ReturnType<typeof getProvider>;
	try {
		provider = getProvider(input.provider);
	} catch {
		const available = getAllProviders()
			.map((p) => p.id)
			.join(", ");
		throw new Error(`Unknown provider "${input.provider}". Available providers: ${available}.`);
	}
	if (VERSION_REQUIRED_PROVIDERS.has(input.provider) && !input.version) {
		throw new Error(`Provider "${input.provider}" requires a version slug (e.g. the model identifier).`);
	}
	const targetError = provider.validateTarget?.({
		model: input.model,
		provider: input.provider,
		version: input.version ?? undefined,
		webSearch: input.webSearch,
	});
	if (targetError) {
		throw new Error(`Invalid target "${input.model}:${input.provider}": ${targetError}`);
	}
}

function isUniqueViolation(error: unknown): boolean {
	const code =
		(error as { code?: string })?.code ?? ((error as { cause?: { code?: string } })?.cause?.code as string | undefined);
	return code === "23505";
}

/** Catalog row with jsonb `unknown` narrowed for serialization. */
function toTargetRow(row: typeof modelTargets.$inferSelect) {
	return { ...row, requestPolicy: row.requestPolicy as JsonValue | null };
}

const DUPLICATE_TARGET_MESSAGE = "A target with this model, provider, version, and web-search flag already exists.";

export interface ModelTargetInput {
	model: string;
	provider: string;
	version?: string | null;
	webSearch: boolean;
	enabled: boolean;
	priority: number;
	requiredEntitlement?: "webSearchApiTargets" | "custom" | null;
}

export interface ModelTargetUpdateInput {
	id: string;
	model?: string;
	provider?: string;
	version?: string | null;
	webSearch?: boolean;
	enabled?: boolean;
	priority?: number;
	requiredEntitlement?: "webSearchApiTargets" | "custom" | null;
}

/** The instance catalog, every row (enabled and disabled), for the admin UI. */
export async function listModelTargetsImpl() {
	await requireInstanceAdminRead();
	const rows = await db
		.select()
		.from(modelTargets)
		.where(isNull(modelTargets.organizationId))
		.orderBy(asc(modelTargets.model), asc(modelTargets.priority), asc(modelTargets.provider));
	return rows.map(toTargetRow);
}

export async function createModelTargetImpl(data: ModelTargetInput) {
	await requireEntityWrite("model_targets");
	const version = data.version ?? null;
	validateTargetInput({ model: data.model, provider: data.provider, version, webSearch: data.webSearch });

	const [row] = await db
		.insert(modelTargets)
		.values({
			organizationId: null,
			model: data.model,
			provider: data.provider,
			version,
			webSearch: data.webSearch,
			enabled: data.enabled,
			priority: data.priority,
			requiredEntitlement: data.requiredEntitlement ?? null,
		})
		.onConflictDoNothing()
		.returning();
	if (!row) throw new Error(DUPLICATE_TARGET_MESSAGE);

	clearConfigCache();
	return toTargetRow(row);
}

export async function updateModelTargetImpl(data: ModelTargetUpdateInput) {
	await requireEntityWrite("model_targets");

	const [existing] = await db
		.select()
		.from(modelTargets)
		.where(and(eq(modelTargets.id, data.id), isNull(modelTargets.organizationId)))
		.limit(1);
	if (!existing) throw new Error("Target not found");

	const next = {
		model: data.model ?? existing.model,
		provider: data.provider ?? existing.provider,
		version: data.version === undefined ? existing.version : data.version,
		webSearch: data.webSearch ?? existing.webSearch,
		enabled: data.enabled ?? existing.enabled,
		priority: data.priority ?? existing.priority,
		requiredEntitlement:
			data.requiredEntitlement === undefined ? existing.requiredEntitlement : data.requiredEntitlement,
	};
	validateTargetInput(next);

	try {
		const [row] = await db
			.update(modelTargets)
			.set({ ...next, updatedAt: new Date() })
			.where(and(eq(modelTargets.id, data.id), isNull(modelTargets.organizationId)))
			.returning();
		if (!row) throw new Error("Target not found");
		clearConfigCache();
		return toTargetRow(row);
	} catch (error) {
		if (isUniqueViolation(error)) throw new Error(DUPLICATE_TARGET_MESSAGE);
		throw error;
	}
}

export async function deleteModelTargetImpl(data: { id: string }) {
	await requireEntityWrite("model_targets");
	const rows = await db
		.delete(modelTargets)
		.where(and(eq(modelTargets.id, data.id), isNull(modelTargets.organizationId)))
		.returning({ id: modelTargets.id });
	if (rows.length === 0) throw new Error("Target not found");
	clearConfigCache();
	return { deleted: true };
}

// ============================================================================
// Provider credentials
// ============================================================================

/** Instance credential rows, safe columns ONLY — payloads are never selected. */
async function fetchCredentialRowsSafe() {
	return db
		.select({
			provider: providerCredentials.provider,
			source: providerCredentials.source,
			hint: providerCredentials.hint,
			lastVerifiedAt: providerCredentials.lastVerifiedAt,
			lastVerifyError: providerCredentials.lastVerifyError,
		})
		.from(providerCredentials)
		.where(isNull(providerCredentials.organizationId));
}

function envConfigured(keys: string[]): boolean {
	return keys.length > 0 && keys.every((name) => !!process.env[name]);
}

async function credentialStatusFor(providerId: string): Promise<ProviderCredentialStatus> {
	const rows = await fetchCredentialRowsSafe();
	const row = rows.find((r) => r.provider === providerId) ?? null;
	return buildProviderCredentialStatus({
		provider: providerId,
		envConfigured: envConfigured(getCredentialKeysForProvider(providerId)),
		row,
	});
}

/**
 * Credential status per provider that has registry-declared credential keys.
 * Providers without credential env vars (e.g. the stub) have nothing to store
 * and are omitted.
 */
export async function listProviderCredentialsImpl(): Promise<(ProviderCredentialStatus & { keys: string[] })[]> {
	const rows = await fetchCredentialRowsSafe();
	const byProvider = new Map(rows.map((row) => [row.provider, row]));

	return getAllProviders()
		.map((provider) => ({ provider, keys: getCredentialKeysForProvider(provider.id) }))
		.filter(({ keys }) => keys.length > 0)
		.map(({ provider, keys }) => ({
			...buildProviderCredentialStatus({
				provider: provider.id,
				envConfigured: envConfigured(keys),
				row: byProvider.get(provider.id) ?? null,
			}),
			keys,
		}));
}

/**
 * Store a provider's credential record encrypted (AES-256-GCM). `values` is
 * keyed by the provider's env-var names (validated against the registry) and is
 * write-only — the response is the status shape, never the stored values.
 * Requires `ELMO_ENCRYPTION_KEY`; without it this fails with the typed
 * EncryptionKeyError message and env-based credentials remain untouched.
 */
export async function upsertProviderCredentialImpl(data: {
	provider: string;
	values: Record<string, string>;
}): Promise<ProviderCredentialStatus> {
	await requireEntityWrite("provider_credentials");

	const allowed = getCredentialKeysForProvider(data.provider);
	if (allowed.length === 0) {
		throw new Error(`Provider "${data.provider}" has no storable credentials.`);
	}
	const names = Object.keys(data.values);
	if (names.length === 0) {
		throw new Error("At least one credential value is required.");
	}
	const unknown = names.filter((name) => !allowed.includes(name));
	if (unknown.length > 0) {
		throw new Error(
			`Unknown credential key(s) for "${data.provider}": ${unknown.join(", ")}. Expected: ${allowed.join(", ")}.`,
		);
	}

	// Throws the typed EncryptionKeyError when ELMO_ENCRYPTION_KEY is absent/invalid.
	const { encryptedData, hint } = encryptProviderCredentials(data.provider, data.values);

	await db
		.insert(providerCredentials)
		.values({
			organizationId: null,
			provider: data.provider,
			source: "encrypted",
			encryptedData,
			secretRef: null,
			hint,
			lastVerifiedAt: null,
			lastVerifyError: null,
		})
		.onConflictDoUpdate({
			target: [providerCredentials.provider, providerCredentials.organizationId],
			set: {
				source: "encrypted",
				encryptedData,
				secretRef: null,
				hint,
				lastVerifiedAt: null,
				lastVerifyError: null,
				updatedAt: new Date(),
			},
		});

	await refreshCredentialOverlay();
	return credentialStatusFor(data.provider);
}

export async function deleteProviderCredentialImpl(data: { provider: string }): Promise<ProviderCredentialStatus> {
	await requireEntityWrite("provider_credentials");
	const rows = await db
		.delete(providerCredentials)
		.where(and(eq(providerCredentials.provider, data.provider), isNull(providerCredentials.organizationId)))
		.returning({ provider: providerCredentials.provider });
	if (rows.length === 0) throw new Error("No stored credential for this provider");
	await refreshCredentialOverlay();
	return credentialStatusFor(data.provider);
}

/**
 * Verify a provider's credentials: refresh the overlay from the DB, then ask
 * the provider whether it considers itself configured. No live provider calls
 * in this round — `isConfigured()` is a key-presence check. Records the result
 * on the stored row when one exists.
 */
export async function verifyProviderCredentialImpl(data: { provider: string }) {
	await requireEntityWrite("provider_credentials");

	let provider: ReturnType<typeof getProvider>;
	try {
		provider = getProvider(data.provider);
	} catch {
		throw new Error(`Unknown provider "${data.provider}"`);
	}

	await refreshCredentialOverlay();
	const ok = provider.isConfigured();
	const verifiedAt = new Date();
	const error = ok ? null : `Required credentials for "${data.provider}" are missing or not readable.`;

	await db
		.update(providerCredentials)
		.set({ lastVerifiedAt: verifiedAt, lastVerifyError: error, updatedAt: verifiedAt })
		.where(and(eq(providerCredentials.provider, data.provider), isNull(providerCredentials.organizationId)));

	return { provider: data.provider, ok, verifiedAt: verifiedAt.toISOString(), error };
}

// ============================================================================
// Organization settings (entitlements) — staff-only
// ============================================================================

async function requireOrganizationExists(organizationId: string): Promise<void> {
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);
	if (!org) throw new Error("Organization not found");
}

export async function getOrganizationSettingsImpl(data: { organizationId: string }) {
	await requireInstanceAdminRead();
	await requireOrganizationExists(data.organizationId);

	const [row] = await db
		.select()
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, data.organizationId))
		.limit(1);
	const entitlements = await getEntitlements(data.organizationId);

	return {
		organizationId: data.organizationId,
		planKey: row?.planKey ?? null,
		entitlementOverrides: (row?.entitlementOverrides as JsonValue | null) ?? null,
		entitlements,
	};
}

/** Set an org's planKey + overrides. Staff-only (entity gate): org admins can never edit their own entitlements. */
export async function setOrganizationSettingsImpl(data: {
	organizationId: string;
	planKey: string | null;
	entitlementOverrides: EntitlementOverridesInput | null;
}) {
	await requireEntityWrite("organization_settings");
	await requireOrganizationExists(data.organizationId);

	if (data.planKey !== null && !(data.planKey in PLANS)) {
		throw new Error(`Unknown plan "${data.planKey}". Known plans: ${Object.keys(PLANS).join(", ")}.`);
	}

	await db
		.insert(organizationSettings)
		.values({
			organizationId: data.organizationId,
			planKey: data.planKey,
			entitlementOverrides: data.entitlementOverrides,
		})
		.onConflictDoUpdate({
			target: organizationSettings.organizationId,
			set: {
				planKey: data.planKey,
				entitlementOverrides: data.entitlementOverrides,
				updatedAt: new Date(),
			},
		});

	const entitlements = await getEntitlements(data.organizationId);
	return {
		organizationId: data.organizationId,
		planKey: data.planKey,
		entitlementOverrides: data.entitlementOverrides,
		entitlements,
	};
}
