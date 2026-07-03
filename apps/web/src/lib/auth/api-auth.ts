/**
 * External API (v1) authentication: resolves a Bearer token to an
 * `ApiAuthContext`.
 *
 * Two kinds of keys, deliberately asymmetric:
 *
 * - **Instance-admin keys** come from the `ADMIN_API_KEYS` env var
 *   (comma-separated, compared timing-safe). Full access, including the
 *   admin-only endpoints. Set by the instance operator for automation;
 *   never stored in the database.
 * - **Dashboard keys** are better-auth API keys (`apikey` table, created in
 *   Settings → API Keys). They are never admin. Their scope is *derived*,
 *   not stored: the owner's org memberships at request time (org id ==
 *   brand id), optionally narrowed by a per-key brand restriction saved in
 *   the key's metadata (`{ brandIds: [...] }`). Removing someone from an
 *   org instantly changes what their keys reach, and deleting the owner
 *   cascades their memberships away, leaving the key with access to
 *   nothing — there is no authorization state to go stale.
 */
import { timingSafeEqual } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { member } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "./server";

export type ApiAuthContext =
	| { type: "admin" }
	| { type: "user"; userId: string; keyId: string; brandIds: string[]; readOnly: boolean };

interface ApiAuthFailure {
	status: 401 | 429;
	error: string;
	message: string;
}

export type ApiAuthResult = { ok: true; auth: ApiAuthContext } | ({ ok: false } & ApiAuthFailure);

/** Dependencies injected for unit testing; resolveApiAuth binds the real ones. */
export interface ApiAuthDeps {
	/** Parsed `ADMIN_API_KEYS` values; a timing-safe match grants admin. */
	adminApiKeys: string[];
	verifyApiKey(key: string): Promise<{
		valid: boolean;
		error: { code?: string | null; message?: string | null } | null;
		key: { id: string; referenceId: string; metadata?: unknown } | null;
	}>;
	/** Org ids the user is a member of (org id == brand id). */
	listOrgIds(userId: string): Promise<string[]>;
}

const UNAUTHORIZED_MISSING_TOKEN: ApiAuthFailure = {
	status: 401,
	error: "Unauthorized",
	message: "Valid API key required as Bearer token in Authorization header",
};

const UNAUTHORIZED_INVALID_KEY: ApiAuthFailure = {
	status: 401,
	error: "Unauthorized",
	message: "Invalid API key",
};

/**
 * Extract the raw token from an `Authorization: Bearer <token>` header.
 * Case-sensitive on the scheme, matching what the API has always accepted.
 * Returns null for a missing header, a non-Bearer scheme, or a blank token.
 */
export function parseBearerToken(header: string | null | undefined): string | null {
	if (!header?.startsWith("Bearer ")) {
		return null;
	}
	const token = header.slice("Bearer ".length).trim();
	return token.length > 0 ? token : null;
}

/** Parse comma-separated ADMIN_API_KEYS env var into a trimmed, non-empty array. */
function getAdminApiKeys(): string[] {
	return (process.env.ADMIN_API_KEYS || "")
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean);
}

/**
 * Constant-time string comparison to prevent timing attacks on API keys.
 * Returns true if the strings are equal, false otherwise.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		// Compare against itself to consume constant time, then return false
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

/**
 * Extract the per-key brand restriction from key metadata.
 *
 * Only a well-formed `{ brandIds: [...] }` restricts, keeping the string
 * entries. `null` means "no restriction". The asymmetry is deliberate: a
 * missing or malformed field cannot *narrow* anything (the dashboard always
 * writes a well-formed array), while a present array — even empty, even
 * full of garbage — restricts to exactly its valid entries, so hand-rolled
 * metadata can only ever shrink a key's reach, never widen it.
 */
export function parseBrandRestriction(metadata: unknown): string[] | null {
	if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
		return null;
	}
	const brandIds = (metadata as Record<string, unknown>).brandIds;
	if (!Array.isArray(brandIds)) {
		return null;
	}
	return brandIds.filter((id): id is string => typeof id === "string");
}

/**
 * Whether a key's metadata marks it read-only. Only an explicit
 * `readOnly === true` restricts; anything else (absent, malformed, false) is a
 * normal read-write key. A read-only key may call GET endpoints only — the
 * write-method rejection lives in `createApiHandler`, the single API gate.
 */
export function parseReadOnly(metadata: unknown): boolean {
	if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
		return false;
	}
	return (metadata as Record<string, unknown>).readOnly === true;
}

/**
 * Map a failed `verifyApiKey` outcome to the HTTP status/envelope we return
 * to API clients. Unknown or absent error codes fail closed as a generic
 * "Invalid API key" — we never leak which specific check failed beyond the
 * cases the client can act on (rate limit vs. expired/disabled vs. invalid).
 */
function mapVerifyFailure(error: { code?: string | null; message?: string | null } | null): ApiAuthFailure {
	switch (error?.code) {
		case "RATE_LIMIT_EXCEEDED":
			return {
				status: 429,
				error: "Rate Limit Exceeded",
				message: "API key rate limit exceeded. Try again later.",
			};
		case "USAGE_EXCEEDED":
			return {
				status: 429,
				error: "Rate Limit Exceeded",
				message: "API key usage limit exceeded.",
			};
		case "KEY_EXPIRED":
			return {
				status: 401,
				error: "Unauthorized",
				message: "API key has expired.",
			};
		case "KEY_DISABLED":
			return {
				status: 401,
				error: "Unauthorized",
				message: "API key is disabled.",
			};
		default:
			return UNAUTHORIZED_INVALID_KEY;
	}
}

/**
 * Resolve an `ApiAuthContext` for an incoming request using injected deps.
 * Pure(ish) orchestration — no module-level state — so it is fully
 * unit-testable with fakes. `resolveApiAuth` below binds the real deps.
 */
export async function resolveApiAuthWithDeps(request: Request, deps: ApiAuthDeps): Promise<ApiAuthResult> {
	const token = parseBearerToken(request.headers.get("Authorization"));
	if (!token) {
		return { ok: false, ...UNAUTHORIZED_MISSING_TOKEN };
	}

	// Instance-admin env keys are checked first and never touch the database
	// (or a dashboard key's rate-limit counters).
	if (deps.adminApiKeys.some((key) => timingSafeStringEqual(key, token))) {
		return { ok: true, auth: { type: "admin" } };
	}

	let verified: Awaited<ReturnType<ApiAuthDeps["verifyApiKey"]>>;
	try {
		verified = await deps.verifyApiKey(token);
	} catch (err) {
		// Fail closed: never let a verification-layer exception (e.g. a
		// transient DB error) propagate into "authenticated" behavior.
		console.error(err);
		return { ok: false, ...UNAUTHORIZED_INVALID_KEY };
	}

	if (!verified.valid || !verified.key) {
		return { ok: false, ...mapVerifyFailure(verified.error) };
	}

	const { key } = verified;
	const orgIds = await deps.listOrgIds(key.referenceId);
	const restriction = parseBrandRestriction(key.metadata);
	// The intersection means a restriction can only narrow the owner-derived
	// scope — a key must never grant more than its owner currently has.
	const brandIds = restriction === null ? orgIds : orgIds.filter((id) => restriction.includes(id));
	const readOnly = parseReadOnly(key.metadata);

	return { ok: true, auth: { type: "user", userId: key.referenceId, keyId: key.id, brandIds, readOnly } };
}

/**
 * Per-`Request` memoization so `resolveApiAuth` verifies a given request at
 * most once. `verifyApiKey` increments per-key rate-limit/usage counters as
 * a side effect, so re-verifying the same Request object (e.g. because
 * multiple middleware layers each call this) would double-charge it.
 */
const requestAuthCache = new WeakMap<Request, Promise<ApiAuthResult>>();

const realDeps: Omit<ApiAuthDeps, "adminApiKeys"> = {
	async verifyApiKey(key: string) {
		// better-auth's own return type mis-types `error.message` as the
		// `RawError` object (not `string`) on one union branch — a narrow
		// upstream typing quirk. We only ever read `error.code` (see
		// `mapVerifyFailure`), so re-shape defensively instead of trusting
		// the declared type or casting past it.
		const result = await auth.api.verifyApiKey({ body: { key } });
		return {
			valid: result.valid,
			error: result.error ? { code: result.error.code, message: String(result.error.message) } : null,
			key: result.key
				? { id: result.key.id, referenceId: result.key.referenceId, metadata: result.key.metadata }
				: null,
		};
	},
	async listOrgIds(userId: string) {
		const rows = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId));
		return rows.map((row) => row.id);
	},
};

/**
 * Resolve an `ApiAuthContext` for an incoming request, binding the real
 * better-auth / drizzle dependencies (env admin keys are re-read per call).
 * Memoized per `Request` object — see `requestAuthCache` above.
 */
export function resolveApiAuth(request: Request): Promise<ApiAuthResult> {
	const cached = requestAuthCache.get(request);
	if (cached) return cached;

	const result = resolveApiAuthWithDeps(request, { ...realDeps, adminApiKeys: getAdminApiKeys() });
	requestAuthCache.set(request, result);
	return result;
}
