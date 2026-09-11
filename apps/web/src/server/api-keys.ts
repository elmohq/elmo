/**
 * The only way to mint a key; the plugin's HTTP endpoints are blocked. This is
 * where the brand narrowing, which lives in client-writable `metadata`, is
 * checked against the organization's own brands.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { isOrgAdminRole } from "@workspace/config/roles";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { API_SCOPES, type ApiScope, permissionsToScopes, scopesToPermissions } from "@/lib/api/scopes";
import { readBrandRestriction } from "@/lib/auth/api-auth";
import { requireAuthSession, requireOrganization } from "@/lib/auth/helpers";
import { auth } from "@/lib/auth/server";

const EXPIRY_DAYS = [30, 90, 180, 365] as const;

export interface ApiKeySummary {
	id: string;
	name: string | null;
	start: string | null;
	scopes: ApiScope[];
	brandIds: string[] | null;
	enabled: boolean;
	createdAt: string | null;
	lastUsedAt: string | null;
	expiresAt: string | null;
}

export type ApiKeysPageData = {
	organization: { id: string; name: string; role: string };
	canManage: boolean;
	keys: ApiKeySummary[];
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

type StoredApiKey = Awaited<ReturnType<typeof auth.api.listApiKeys>>["apiKeys"][number];

function summarize(key: StoredApiKey): ApiKeySummary {
	return {
		id: key.id,
		name: key.name ?? null,
		start: key.start ?? null,
		scopes: permissionsToScopes(key.permissions),
		brandIds: readBrandRestriction(key.metadata),
		enabled: key.enabled !== false,
		createdAt: toDate(key.createdAt),
		lastUsedAt: toDate(key.lastRequest),
		expiresAt: toDate(key.expiresAt),
	};
}

async function requireKeyAccess(organizationId: string) {
	const session = await requireAuthSession();
	const org = await requireOrganization(session.user.id, organizationId);
	return { session, org, canManage: isOrgAdminRole(org.role) };
}

function requireManager(canManage: boolean): void {
	if (!canManage) throw new Error("Only organization admins can manage API keys");
}

export const listApiKeysFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string() }))
	.handler(async ({ data }): Promise<ApiKeysPageData> => {
		const { org, canManage } = await requireKeyAccess(data.organizationId);

		const [keys, organizationBrands] = await Promise.all([
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
			brands: organizationBrands,
			allScopes: API_SCOPES,
			expiryOptions: EXPIRY_DAYS,
		};
	});

const createInput = z.object({
	organizationId: z.string(),
	name: z.string().trim().min(1, "Give the key a name"),
	scopes: z.array(z.enum(API_SCOPES)).min(1, "Choose at least one scope"),
	/** Null is every brand; `[]` is rejected rather than read as "all", which is
	 * the reading that fails open. */
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
		const { session, org, canManage } = await requireKeyAccess(data.organizationId);
		requireManager(canManage);

		if (data.brandIds) {
			const owned = new Set(
				(await db.select({ id: brands.id }).from(brands).where(eq(brands.organizationId, org.id))).map((row) => row.id),
			);
			const stray = data.brandIds.find((id) => !owned.has(id));
			if (stray) throw new Error(`"${stray}" is not a brand in this organization`);
		}

		// No `headers`: the plugin refuses to set `permissions` for a request
		// carrying them, which is what stops a browser minting a scoped key.
		const created = await auth.api.createApiKey({
			body: {
				name: data.name,
				organizationId: org.id,
				userId: session.user.id,
				prefix: "elmo_",
				permissions: scopesToPermissions(data.scopes),
				// Absent, not empty: "every brand" is the absence of a narrowing.
				metadata: data.brandIds ? { brandIds: data.brandIds } : {},
				...(data.expiresInDays !== null && { expiresIn: data.expiresInDays * 24 * 60 * 60 }),
			},
		});

		return { key: created.key, summary: summarize(created) };
	});

export const revokeApiKeyFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), keyId: z.string() }))
	.handler(async ({ data }): Promise<{ revoked: true }> => {
		const { org, canManage } = await requireKeyAccess(data.organizationId);
		requireManager(canManage);

		// The id arrives from the browser and the plugin's delete trusts it.
		const keys = await auth.api.listApiKeys({
			query: { organizationId: org.id },
			headers: getRequestHeaders(),
		});
		if (!keys.apiKeys.some((key) => key.id === data.keyId)) {
			throw new Error("API key not found in this organization");
		}

		// Disabled rather than deleted: it stops authenticating immediately either
		// way, and the row survives so the page can say the key existed.
		await auth.api.updateApiKey({ body: { keyId: data.keyId, enabled: false }, headers: getRequestHeaders() });
		return { revoked: true };
	});
