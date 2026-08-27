/**
 * Who is calling `/api/v1`.
 *
 * Two kinds of Bearer token resolve here and nowhere else:
 *
 *  - an instance admin key from `ADMIN_API_KEYS` — every organization, every
 *    scope, no database round trip;
 *  - an organization key issued from the dashboard — bound to exactly one
 *    organization, holding an explicit set of scopes, optionally narrowed to a
 *    subset of that organization's brands.
 *
 * Everything authorization-bearing about an organization key comes from columns
 * the api-key plugin protects: `referenceId` (the organization, set from a
 * membership check at creation) and `permissions` (the scopes, rejected as a
 * server-only property on any request carrying headers). `metadata` is the one
 * column a session can write, so the only thing read from it is the brand
 * narrowing — which is intersected with the organization's brands and can
 * therefore never grant anything.
 */
import { db } from "@workspace/lib/db/db";
import { brands, organization } from "@workspace/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { type ApiScope, permissionsToScopes } from "@/lib/api/scopes";
import { getAdminApiKeys, timingSafeStringEqual } from "./policies";

export interface AdminAuth {
	kind: "admin";
	scopes: null;
	/** Admin keys are not bound to an organization; they reach every one. */
	organizationId: null;
}

export interface OrganizationAuth {
	kind: "organization";
	keyId: string;
	name: string | null;
	organizationId: string;
	organizationName: string;
	scopes: Set<ApiScope>;
	/** Null means every brand in the organization. Never an empty array. */
	brandIds: string[] | null;
	createdAt: Date | null;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	rateLimit: { limit: number; window: "minute" };
	/** Echoed back as `X-RateLimit-*` so a caller can pace itself. */
	rateLimitRemaining: number | null;
}

export type ApiAuth = AdminAuth | OrganizationAuth;

export interface ApiAuthFailure {
	status: 401 | 429;
	error: string;
	message: string;
	code: "unauthorized" | "rate_limited";
	retryAfterSeconds?: number;
}

export type ApiAuthResult = { auth: ApiAuth } | { failure: ApiAuthFailure };

const UNAUTHORIZED: ApiAuthFailure = {
	status: 401,
	error: "Unauthorized",
	message: "Valid API key required as Bearer token in Authorization header",
	code: "unauthorized",
};

/**
 * A single message for every way a key can fail to resolve — unknown, expired,
 * revoked, malformed. Distinguishing them would tell an attacker which of their
 * guesses was once real.
 */
const INVALID_KEY: ApiAuthFailure = {
	status: 401,
	error: "Unauthorized",
	message: "Invalid API key",
	code: "unauthorized",
};

function bearerToken(request: Request): string | null {
	const header = request.headers.get("Authorization");
	if (!header?.startsWith("Bearer ")) return null;
	const token = header.slice(7).trim();
	return token.length > 0 ? token : null;
}

function isAdminKey(token: string): boolean {
	const keys = getAdminApiKeys();
	return keys.length > 0 && keys.some((key) => timingSafeStringEqual(key, token));
}

/**
 * The brand narrowing, if the key carries one.
 *
 * ---------------------------------------------------------------------------
 * `metadata` is client-writable. Nothing read from it may ever widen a key.
 * ---------------------------------------------------------------------------
 *
 * The api-key plugin declares `metadata` with `input: true`, so anyone holding
 * a session that reaches the plugin's create or update endpoint can set it to
 * whatever they like. It is the one column on the row that works that way.
 *
 * `brandIds` is safe to keep here only because of what is done with it: it is
 * intersected with the brands of the organization the key is already bound to,
 * so a forged value can shrink a key's reach and never grow it. The worst a
 * caller who writes this field directly achieves is handing their own key
 * everything inside their own organization — which it already had.
 *
 * Anything that *grants* — the organization id, the scopes, a rate-limit
 * override, an admin flag — lives in `referenceId` or `permissions`, both of
 * which the plugin refuses to take from a request carrying headers.
 *
 * Before adding a field here, ask: what is the worst a caller who writes this
 * field directly can do? If the answer is anything other than "nothing they
 * couldn't already do", it does not belong in metadata.
 *
 * Anything malformed is read as "no narrowing" rather than raised as an error:
 * a client-writable field must not be able to break a key either.
 */
function readBrandRestriction(metadata: unknown): string[] | null {
	if (!metadata || typeof metadata !== "object") return null;
	const raw = (metadata as Record<string, unknown>).brandIds;
	if (!Array.isArray(raw)) return null;
	const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0);
	return ids.length > 0 ? ids : null;
}

function asDate(value: unknown): Date | null {
	if (value instanceof Date) return value;
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
}

/**
 * Narrow a stored restriction to brands that actually belong to the key's
 * organization. This is what makes a forged `metadata.brandIds` harmless: the
 * intersection can only ever shrink the key's reach, never widen it past the
 * organization `referenceId` already pinned it to.
 */
async function intersectWithOrgBrands(organizationId: string, restriction: string[] | null): Promise<string[] | null> {
	if (!restriction) return null;
	const rows = await db
		.select({ id: brands.id })
		.from(brands)
		.where(and(inArray(brands.id, restriction), eq(brands.organizationId, organizationId)));
	return rows.map((row) => row.id);
}

export async function resolveApiAuth(request: Request): Promise<ApiAuthResult> {
	const token = bearerToken(request);
	if (!token) return { failure: UNAUTHORIZED };

	if (isAdminKey(token)) {
		return { auth: { kind: "admin", scopes: null, organizationId: null } };
	}

	// Imported here rather than at module scope: constructing the auth instance
	// reads APP_URL and throws without it, which would make every module that
	// reaches this one — including createApiHandler, and so every route —
	// unimportable outside a configured environment. An admin key never gets
	// this far, so it never pays for it either.
	let result: Awaited<ReturnType<typeof import("./server").auth.api.verifyApiKey>>;
	try {
		const { auth } = await import("./server");
		result = await auth.api.verifyApiKey({ body: { key: token } });
	} catch (err) {
		// A resolver that throws must fail closed: an unavailable database is a
		// reason to reject a key, never a reason to accept one.
		console.error("[api] key verification failed:", err);
		return { failure: INVALID_KEY };
	}

	const key = result?.key;
	if (!result?.valid || !key) {
		if (result?.error?.code === "RATE_LIMITED") {
			return {
				failure: {
					status: 429,
					error: "Too Many Requests",
					message: "Rate limit exceeded for this API key",
					code: "rate_limited",
					retryAfterSeconds: 60,
				},
			};
		}
		return { failure: INVALID_KEY };
	}

	const organizationId = key.referenceId;
	const [org] = await db
		.select({ id: organization.id, name: organization.name })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);
	// A key whose organization is gone reaches nothing; treat it as invalid
	// rather than as a key with an empty scope, so the failure is legible.
	if (!org) return { failure: INVALID_KEY };

	const scopes = new Set(permissionsToScopes(key.permissions));
	const brandIds = await intersectWithOrgBrands(organizationId, readBrandRestriction(key.metadata));

	return {
		auth: {
			kind: "organization",
			keyId: key.id,
			name: key.name ?? null,
			organizationId,
			organizationName: org.name,
			scopes,
			brandIds,
			createdAt: asDate(key.createdAt),
			lastUsedAt: asDate(key.lastRequest),
			expiresAt: asDate(key.expiresAt),
			rateLimit: { limit: key.rateLimitMax ?? 120, window: "minute" },
			rateLimitRemaining: typeof key.remaining === "number" ? key.remaining : null,
		},
	};
}

export function hasScope(auth: ApiAuth, scope: ApiScope): boolean {
	return auth.kind === "admin" || auth.scopes.has(scope);
}
