import { db } from "@workspace/lib/db/db";
import { brands, organization } from "@workspace/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { API_SCOPES, type ApiScope, permissionsToScopes } from "@/lib/api/scopes";
import { getAdminApiKeys, timingSafeStringEqual } from "./policies";

export interface AdminAuth {
	kind: "admin";
	scopes: null;
	organizationId: null;
}

export interface OrganizationAuth {
	kind: "organization";
	keyId: string;
	name: string | null;
	organizationId: string;
	organizationName: string;
	scopes: Set<ApiScope>;
	/** Null reaches every brand in the organization; `[]` reaches none. */
	brandIds: string[] | null;
	createdAt: Date | null;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	rateLimit: { limit: number; window: "minute" };
	rateLimitRemaining: number | null;
}

export type ApiAuth = AdminAuth | OrganizationAuth;

/** Only `/api/mcp` mints one; `ApiAuth` omits it so `/api/v1` cannot see one. */
export interface UserAuth {
	kind: "user";
	userId: string;
	email: string | null;
	name: string | null;
	organizationIds: string[];
	clientId: string;
	expiresAt: Date | null;
}

export type Principal = ApiAuth | UserAuth;

/** The only place that knows there are three kinds of caller; everything
 * downstream asks this instead of switching on `kind`. */
export interface PrincipalReach {
	organizationIds: string[] | null;
	brandIds: string[] | null;
	scopes: Set<ApiScope>;
}

/**
 * Scopes narrow a key below what its holder can already do, so an admin key and
 * a signed-in person hold every one. An OAuth token's `scope` claim is ignored
 * for the same reason: it is not one of these.
 */
export function principalReach(auth: Principal): PrincipalReach {
	switch (auth.kind) {
		case "admin":
			return { organizationIds: null, brandIds: null, scopes: new Set(API_SCOPES) };
		case "organization":
			return { organizationIds: [auth.organizationId], brandIds: auth.brandIds, scopes: auth.scopes };
		case "user":
			return { organizationIds: auth.organizationIds, brandIds: null, scopes: new Set(API_SCOPES) };
	}
}

export function principalScopes(auth: Principal): Set<ApiScope> {
	return principalReach(auth).scopes;
}

export function principalLabel(auth: Principal): string {
	switch (auth.kind) {
		case "admin":
			return "instance admin key";
		case "organization":
			return `API key for ${auth.organizationName}`;
		case "user":
			return auth.email ?? auth.userId;
	}
}

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

/** One message for every failure, so a guess cannot be told from a real key. */
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
 * `metadata` is client-writable, so nothing read from it may widen a key. This
 * one is safe only because it is intersected with the key's organization below.
 */
export function readBrandRestriction(metadata: unknown): string[] | null {
	if (!metadata || typeof metadata !== "object") return null;
	if (!("brandIds" in metadata)) return null;

	const raw = (metadata as Record<string, unknown>).brandIds;
	// Narrowed to something unreadable: reaching nothing is the safe answer.
	if (!Array.isArray(raw)) return [];
	return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function asDate(value: unknown): Date | null {
	if (value instanceof Date) return value;
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
}

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

	// Deferred: constructing auth reads APP_URL and throws without it, which
	// would make every route importing this unimportable in a bare environment.
	let result: Awaited<ReturnType<typeof import("./server").auth.api.verifyApiKey>>;
	try {
		const { auth } = await import("./server");
		result = await auth.api.verifyApiKey({ body: { key: token } });
	} catch (err) {
		// Fail closed: an unavailable database is never a reason to accept a key.
		console.error("[api] key verification failed:", err);
		return { failure: INVALID_KEY };
	}

	const key = result?.key;
	if (!result?.valid || !key) {
		if (result?.error?.code === "RATE_LIMITED") {
			const tryAgainIn = (result.error as { details?: { tryAgainIn?: unknown } }).details?.tryAgainIn;
			return {
				failure: {
					status: 429,
					error: "Too Many Requests",
					message: "Rate limit exceeded for this API key",
					code: "rate_limited",
					retryAfterSeconds: typeof tryAgainIn === "number" ? Math.max(1, Math.ceil(tryAgainIn)) : 60,
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
	// A key whose organization is gone is invalid, not a key with empty scope.
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
			// The fixed-window counter has already consumed this request by the time
			// the row is in hand, so this is the honest remainder. Null, and no
			// header, beats inventing a full window.
			rateLimitRemaining:
				typeof key.requestCount === "number" && typeof key.rateLimitMax === "number"
					? Math.max(0, key.rateLimitMax - key.requestCount)
					: null,
		},
	};
}
