/**
 * Issuing and revoking a workspace's API keys.
 *
 * These are the *only* way to mint a key. The api-key plugin's HTTP endpoints
 * are blocked outright (see `evaluateDeploymentPolicy`), for two reasons:
 *
 *  - `permissions` — where a key's scopes live — is a server-only property the
 *    plugin refuses to accept from a request carrying headers, so a browser
 *    could only ever create a scopeless key; and
 *  - `metadata`, where the brand narrowing lives, *is* client-writable, and
 *    this is where that narrowing gets checked against the organization's own
 *    brands before it is stored.
 *
 * The organization binding itself needs no checking here: the plugin is
 * configured with `references: "organization"`, so it sets `referenceId` from a
 * membership check of its own and refuses outright to create a key for a
 * workspace the caller doesn't belong to.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { isOrgAdminRole } from "@workspace/config/roles";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { API_SCOPES, type ApiScope, permissionsToScopes, scopesToPermissions } from "@/lib/api/scopes";
import { requireAuthSession, requireBrandOrganization } from "@/lib/auth/helpers";
import { auth } from "@/lib/auth/server";

/** How long a key may be issued for. Null is "until revoked". */
const EXPIRY_DAYS = [30, 90, 180, 365] as const;

export interface ApiKeySummary {
	id: string;
	name: string | null;
	/** The first characters, for telling keys apart in a list. */
	start: string | null;
	scopes: ApiScope[];
	/** Null when the key reaches every brand in the workspace. */
	brandIds: string[] | null;
	enabled: boolean;
	createdAt: string | null;
	lastUsedAt: string | null;
	expiresAt: string | null;
}

export type ApiKeysPageData = {
	organization: { id: string; name: string; role: string };
	/** Whether this member's role may issue and revoke keys. */
	canManage: boolean;
	keys: ApiKeySummary[];
	/** Brands a new key can be narrowed to — the workspace's own, and only those. */
	brands: { id: string; name: string }[];
	allScopes: readonly ApiScope[];
	expiryOptions: readonly number[];
};

function toDate(value: unknown): string | null {
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	return null;
}

function readBrandIds(metadata: unknown): string[] | null {
	if (!metadata || typeof metadata !== "object") return null;
	const raw = (metadata as Record<string, unknown>).brandIds;
	if (!Array.isArray(raw)) return null;
	const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0);
	return ids.length > 0 ? ids : null;
}

/** The plugin's own row shape, whichever endpoint it came back from. */
type StoredApiKey = Awaited<ReturnType<typeof auth.api.listApiKeys>>["apiKeys"][number];

function summarize(key: StoredApiKey): ApiKeySummary {
	return {
		id: key.id,
		name: key.name ?? null,
		start: key.start ?? null,
		scopes: permissionsToScopes(key.permissions),
		brandIds: readBrandIds(key.metadata),
		enabled: key.enabled !== false,
		createdAt: toDate(key.createdAt),
		lastUsedAt: toDate(key.lastRequest),
		expiresAt: toDate(key.expiresAt),
	};
}

/**
 * The organization behind a brand, plus whether this member may manage its
 * keys. Managing is an owner/admin action: a key can act as the whole
 * workspace, so handing one out is closer to inviting a teammate than to
 * editing a prompt.
 */
async function requireWorkspace(brandId: string) {
	const session = await requireAuthSession();
	const org = await requireBrandOrganization(session.user.id, brandId);
	return { session, org, canManage: isOrgAdminRole(org.role) };
}

function requireManager(canManage: boolean): void {
	if (!canManage) throw new Error("Only workspace admins can manage API keys");
}

export const listApiKeysFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<ApiKeysPageData> => {
		const { org, canManage } = await requireWorkspace(data.brandId);

		const [keys, workspaceBrands] = await Promise.all([
			auth.api.listApiKeys({ query: { organizationId: org.id }, headers: getRequestHeaders() }),
			db
				.select({ id: brands.id, name: brands.name })
				.from(brands)
				.where(eq(brands.organizationId, org.id))
				.orderBy(brands.name),
		]);

		return {
			organization: org,
			canManage,
			keys: keys.apiKeys.map(summarize),
			brands: workspaceBrands,
			allScopes: API_SCOPES,
			expiryOptions: EXPIRY_DAYS,
		};
	});

const createInput = z.object({
	brandId: z.string(),
	name: z.string().trim().min(1, "Give the key a name"),
	scopes: z.array(z.enum(API_SCOPES)).min(1, "Choose at least one scope"),
	/**
	 * Null means every brand in the workspace. An empty array is rejected rather
	 * than read as "all": a restriction that lists no brands is either a mistake
	 * or a key that reaches nothing, and treating it as "everything" is the one
	 * reading that fails open.
	 */
	brandIds: z
		.array(z.string())
		.min(1, "Choose at least one brand, or leave the key unrestricted")
		.nullable()
		.default(null),
	expiresInDays: z
		.number()
		.int()
		.refine((days) => (EXPIRY_DAYS as readonly number[]).includes(days), "Unsupported expiry")
		.nullable()
		.default(null),
});

export const createApiKeyFn = createServerFn({ method: "POST" })
	.validator(createInput)
	.handler(async ({ data }): Promise<{ key: string; summary: ApiKeySummary }> => {
		const { session, org, canManage } = await requireWorkspace(data.brandId);
		requireManager(canManage);

		// The narrowing is checked against the workspace's own brands before it is
		// stored. It can only ever narrow — the resolver intersects it again on
		// every request — but storing an id from another tenant would be
		// misleading in the list, and there is no reason to accept one.
		if (data.brandIds) {
			const owned = new Set(
				(await db.select({ id: brands.id }).from(brands).where(eq(brands.organizationId, org.id))).map((row) => row.id),
			);
			const stray = data.brandIds.find((id) => !owned.has(id));
			if (stray) throw new Error(`"${stray}" is not a brand in this workspace`);
		}

		// Deliberately no `headers`. The plugin treats any request carrying them as
		// a client request and refuses to set `permissions` — which is exactly the
		// guard that stops a browser minting a scoped key, and exactly what we need
		// to get past here. Passing `userId` instead makes this the server-side call
		// it actually is; the plugin still runs its own membership and role check on
		// `organizationId` before it will create anything.
		const created = await auth.api.createApiKey({
			body: {
				name: data.name,
				organizationId: org.id,
				userId: session.user.id,
				prefix: "elmo_",
				permissions: scopesToPermissions(data.scopes),
				// Absent rather than empty: "every brand" is the absence of a
				// narrowing, not a narrowing to nothing. The resolver reads it back
				// the same way.
				metadata: data.brandIds ? { brandIds: data.brandIds } : {},
				...(data.expiresInDays !== null && { expiresIn: data.expiresInDays * 24 * 60 * 60 }),
			},
		});

		// The plaintext key is returned exactly once; only its hash is stored.
		return { key: created.key, summary: summarize(created) };
	});

export const revokeApiKeyFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), keyId: z.string() }))
	.handler(async ({ data }): Promise<{ revoked: true }> => {
		const { org, canManage } = await requireWorkspace(data.brandId);
		requireManager(canManage);

		// Confirm the key belongs to this workspace before deleting it: the id
		// arrives from the browser, and the plugin's delete takes it at face value.
		const keys = await auth.api.listApiKeys({
			query: { organizationId: org.id },
			headers: getRequestHeaders(),
		});
		if (!keys.apiKeys.some((key) => key.id === data.keyId)) {
			throw new Error("API key not found in this workspace");
		}

		await auth.api.deleteApiKey({ body: { keyId: data.keyId }, headers: getRequestHeaders() });
		return { revoked: true };
	});
