/**
 * External API (v1) authentication: resolves a Bearer API key to an
 * `ApiAuthContext`.
 *
 * Authority is *derived*, not stored on the key: we look up the key's
 * owner (`referenceId`) and read their current role and org memberships
 * at request time. An owner with `role === "admin"` gets instance-wide
 * access; any other owner is scoped to the organizations they belong to
 * (org id == brand id in this codebase). This means demoting an admin or
 * removing someone from an org instantly changes what their existing API
 * keys can reach — there is no separate authorization state to go stale.
 */
import { db } from "@workspace/lib/db/db";
import { member, user } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "./server";

export type ApiAuthContext =
	| { type: "admin"; userId: string; keyId: string }
	| { type: "user"; userId: string; keyId: string; brandIds: string[] };

interface ApiAuthFailure {
	status: 401 | 429;
	error: string;
	message: string;
}

export type ApiAuthResult = { ok: true; auth: ApiAuthContext } | ({ ok: false } & ApiAuthFailure);

/** Dependencies injected for unit testing; resolveApiAuth binds the real ones. */
export interface ApiAuthDeps {
	verifyApiKey(key: string): Promise<{
		valid: boolean;
		error: { code?: string | null; message?: string | null } | null;
		key: { id: string; referenceId: string } | null;
	}>;
	/**
	 * Returns the owning user row (role may be null for users created outside
	 * the admin plugin, e.g. whitelabel SSO sync) or null when no row exists.
	 * "Row missing" and "role null" are distinct: the former orphans the key,
	 * the latter is just a regular non-admin user.
	 */
	getOwner(userId: string): Promise<{ role: string | null } | null>;
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
	const userId = key.referenceId;

	const owner = await deps.getOwner(userId);
	if (owner === null) {
		// Owner's user row is gone (deleted account) — the key is orphaned.
		return { ok: false, ...UNAUTHORIZED_INVALID_KEY };
	}

	if (owner.role === "admin") {
		return { ok: true, auth: { type: "admin", userId, keyId: key.id } };
	}

	const brandIds = await deps.listOrgIds(userId);
	return { ok: true, auth: { type: "user", userId, keyId: key.id, brandIds } };
}

/**
 * Per-`Request` memoization so `resolveApiAuth` verifies a given request at
 * most once. `verifyApiKey` increments per-key rate-limit/usage counters as
 * a side effect, so re-verifying the same Request object (e.g. because
 * multiple middleware layers each call this) would double-charge it.
 */
const requestAuthCache = new WeakMap<Request, Promise<ApiAuthResult>>();

const realDeps: ApiAuthDeps = {
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
			key: result.key,
		};
	},
	async getOwner(userId: string) {
		const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
		return row ? { role: row.role } : null;
	},
	async listOrgIds(userId: string) {
		const rows = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId));
		return rows.map((row) => row.id);
	},
};

/**
 * Resolve an `ApiAuthContext` for an incoming request, binding the real
 * better-auth / drizzle dependencies. Memoized per `Request` object — see
 * `requestAuthCache` above.
 */
export function resolveApiAuth(request: Request): Promise<ApiAuthResult> {
	const cached = requestAuthCache.get(request);
	if (cached) return cached;

	const result = resolveApiAuthWithDeps(request, realDeps);
	requestAuthCache.set(request, result);
	return result;
}
