/**
 * Shared handler factory for /api/v1 routes.
 *
 * Centralizes the cross-cutting concerns every external API endpoint needs:
 * resolving the caller (admin key or organization key), checking the scope the
 * operation requires, refusing writes in read-only mode, zod validation of path
 * params and JSON bodies, uniform error envelopes (`{ error, message, code }`),
 * and a catch-all that turns unexpected failures into a logged 500. Route files
 * supply only the resource-specific logic via `handle`.
 *
 * This is where a caller is identified. The deployment middleware ahead of it
 * can only check that a bearer is present — resolving one needs a database
 * lookup, and that middleware is pure and synchronous — so a route not built
 * with this factory would answer to anyone holding any token. A conformance
 * test is what keeps that from happening.
 *
 * Handlers signal expected failures (404, 409, ...) by throwing `ApiError`.
 * A plain-object return value is wrapped in `Response.json()` with `status`
 * (default 200); returning a `Response` passes through untouched.
 */
import { WriteDeniedError } from "@workspace/lib/entitlements";
import type { z } from "zod";
import { type ApiAuth, type ApiAuthFailure, principalScopes, resolveApiAuth } from "@/lib/auth/api-auth";
import { getDeployment } from "@/lib/config/server";
import type { ApiScope } from "./scopes";

/**
 * Stable machine-readable codes. Deliberately a plain union rather than an
 * enum in the published spec: new values are added without a version bump, and
 * a generated client that turned this into a closed type would throw on the
 * first one it hasn't seen.
 */
export type ApiErrorCode =
	| "unauthorized"
	| "insufficient_scope"
	| "forbidden"
	| "not_found"
	| "validation_error"
	| "conflict"
	| "rate_limited"
	| "method_not_allowed"
	| "read_only"
	| "no_active_plan"
	| "brand_limit"
	| "prompt_limit"
	| "platform_not_in_plan"
	| "platform_picks_exceeded"
	| "premium_not_in_plan"
	| "premium_pool_exhausted"
	| "cadence_faster_than_plan"
	| "system_tag_immutable"
	| "internal_error";

/**
 * The entitlement guards spell their codes with hyphens internally. The wire
 * spells every code with underscores. One mapping, here, rather than two
 * conventions leaking into each other.
 */
const ENTITLEMENT_CODES: Record<string, ApiErrorCode> = {
	"no-active-plan": "no_active_plan",
	"brand-limit": "brand_limit",
	"prompt-limit": "prompt_limit",
	"platform-not-in-plan": "platform_not_in_plan",
	"platform-picks-exceeded": "platform_picks_exceeded",
	"premium-not-in-plan": "premium_not_in_plan",
	"premium-pool-exhausted": "premium_pool_exhausted",
	"cadence-faster-than-plan": "cadence_faster_than_plan",
};

/**
 * What a status means when a thrower didn't say. Most failures have exactly one
 * sensible code, so routes only pass one explicitly when they mean something
 * more specific than "this is what a 409 is".
 */
const CODE_FOR_STATUS: Record<number, ApiErrorCode> = {
	400: "validation_error",
	401: "unauthorized",
	402: "no_active_plan",
	403: "forbidden",
	404: "not_found",
	405: "method_not_allowed",
	409: "conflict",
	429: "rate_limited",
};

export class ApiError extends Error {
	readonly code: ApiErrorCode;

	constructor(
		public readonly status: number,
		public readonly error: string,
		message: string,
		code?: ApiErrorCode,
	) {
		super(message);
		this.name = "ApiError";
		this.code = code ?? CODE_FOR_STATUS[status] ?? "internal_error";
	}
}

function errorResponse(
	status: number,
	error: string,
	message: string,
	code: ApiErrorCode,
	headers?: Record<string, string>,
): Response {
	return Response.json({ error, message, code }, { status, headers });
}

function formatZodError(error: z.ZodError): string {
	return error.issues
		.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
		.join("; ");
}

export interface ApiHandlerContext<P, B> {
	params: P;
	body: B;
	request: Request;
	auth: ApiAuth;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Stamped onto every handler this module produces, so a test can ask a route
 * what it actually wired up instead of reading its source and hoping.
 *
 * Grepping a file for `createApiHandler(` proves only that the string occurs in
 * it — not that the exported handler came from it.
 */
const API_HANDLER = Symbol.for("elmo.api.handler");

export interface ApiHandlerMeta {
	/** `method-guard` is a generated 405 filler; `endpoint` is a real operation. */
	kind: "endpoint" | "method-guard";
	scopes: readonly ApiScope[];
	adminOnly: boolean;
}

function brand<T extends object>(handler: T, meta: ApiHandlerMeta): T {
	Object.defineProperty(handler, API_HANDLER, {
		value: Object.freeze(meta),
		enumerable: false,
		writable: false,
		configurable: false,
	});
	return handler;
}

/** The stamp, or undefined for anything not built here. */
export function apiHandlerMeta(value: unknown): ApiHandlerMeta | undefined {
	if (typeof value !== "function") return undefined;
	return (value as unknown as Record<symbol, ApiHandlerMeta | undefined>)[API_HANDLER];
}

export function createApiHandler<P = Record<string, string>, B = undefined>(opts: {
	/** Zod schema for route path params, e.g. `z.object({ promptId: z.guid() })`. */
	params?: z.ZodType<P>;
	/** Zod schema for the JSON request body (POST/PATCH). */
	body?: z.ZodType<B>;
	/** Success status used when `handle` returns a plain object (default 200). */
	status?: number;
	/** Scopes an organization key must hold. Admin keys hold every scope. */
	scopes?: ApiScope[];
	/** Reachable only with an instance admin key; no scope grants it. */
	adminOnly?: boolean;
	/** Translate domain errors thrown by `handle` into `ApiError` before the generic 500. */
	mapError?: (err: unknown) => ApiError | undefined;
	handle: (ctx: ApiHandlerContext<P, B>) => Promise<Response | object>;
}) {
	const handler = async ({
		request,
		params,
	}: {
		request: Request;
		params: Record<string, string>;
	}): Promise<Response> => {
		const resolved = await resolveApiAuth(request);
		if ("failure" in resolved) return authFailureResponse(resolved.failure);

		const auth = resolved.auth;
		const refusal = refuseRequest(auth, request, opts);
		if (refusal) return refusal;

		const parsedParams = opts.params ? parseAgainst(opts.params, params) : { data: params as P };
		if ("response" in parsedParams) return withRateLimit(parsedParams.response, auth);

		const parsedBody = opts.body ? await parseJsonBody(opts.body, request) : { data: undefined as B };
		if ("response" in parsedBody) return withRateLimit(parsedBody.response, auth);

		try {
			const result = await opts.handle({ params: parsedParams.data, body: parsedBody.data, request, auth });
			const response = result instanceof Response ? result : Response.json(result, { status: opts.status ?? 200 });
			return withRateLimit(response, auth);
		} catch (err) {
			return withRateLimit(errorFromThrow(err, request, opts.mapError), auth);
		}
	};

	return brand(handler, {
		kind: "endpoint",
		scopes: opts.scopes ?? [],
		adminOnly: opts.adminOnly === true,
	});
}

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Fill in the verbs a route doesn't implement with a `405`.
 *
 * Without this, a method no handler claims falls through the file router to the
 * SPA and answers `200` with HTML — so `PATCH /organizations/x/billing` would
 * look like it worked. Wrapping the handler map makes "this resource is
 * read-only" something the API states rather than something a caller has to
 * infer from a page of markup.
 */
export function withMethodGuard<T extends Record<string, unknown>>(handlers: T): T {
	const allowed = ALL_METHODS.filter((method) => method in handlers);
	const guarded: Record<string, unknown> = { ...handlers };
	for (const method of ALL_METHODS) {
		if (method in handlers) continue;
		guarded[method] = brand(
			async () =>
				Response.json(
					{
						error: "Method Not Allowed",
						message: `${method} is not supported here; this resource accepts ${allowed.join(", ")}`,
						code: "method_not_allowed",
					},
					{ status: 405, headers: { Allow: allowed.join(", ") } },
				),
			{ kind: "method-guard", scopes: [], adminOnly: false },
		);
	}
	return guarded as T;
}

function authFailureResponse(failure: ApiAuthFailure): Response {
	const { status, error, message, code, retryAfterSeconds } = failure;
	return errorResponse(
		status,
		error,
		message,
		code,
		retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
	);
}

/**
 * Everything that can refuse a request once the caller is known: the endpoint
 * being admin-only, a scope the key doesn't hold, or the deployment being
 * read-only. Returns null when the request may proceed.
 */
function refuseRequest(
	auth: ApiAuth,
	request: Request,
	opts: { scopes?: ApiScope[]; adminOnly?: boolean },
): Response | null {
	const headers = rateLimitHeaders(auth);

	if (opts.adminOnly && auth.kind !== "admin") {
		return errorResponse(403, "Forbidden", "This endpoint requires an instance admin key", "forbidden", headers);
	}

	// Asked of the principal rather than of its kind: an admin key holds every
	// scope, which is a fact about the principal and not an absence of a check.
	const held = principalScopes(auth);
	const missing = (opts.scopes ?? []).find((scope) => !held.has(scope));
	if (missing) {
		return errorResponse(
			403,
			"Forbidden",
			`This API key is missing the ${missing} scope`,
			"insufficient_scope",
			headers,
		);
	}

	// Read-only mode is not a property of the key, so it is checked after the
	// caller is known but before anything they asked for happens.
	if (getDeployment().features.readOnly && WRITE_METHODS.has(request.method)) {
		return errorResponse(403, "Demo Mode", "Write operations are disabled in demo mode", "read_only", headers);
	}

	return null;
}

/**
 * Tell an organization key where it stands. The plugin counts a fixed window
 * with a read-modify-write per request, so `Remaining` is a guide to back off
 * on rather than a ledger to ride to zero.
 */
function rateLimitHeaders(auth: ApiAuth): Record<string, string> | undefined {
	if (auth.kind !== "organization") return undefined;
	const headers: Record<string, string> = { "X-RateLimit-Limit": String(auth.rateLimit.limit) };
	headers["X-RateLimit-Remaining"] = String(auth.rateLimitRemaining ?? auth.rateLimit.limit);
	return headers;
}

function withRateLimit(response: Response, auth: ApiAuth): Response {
	const headers = rateLimitHeaders(auth);
	if (!headers) return response;
	for (const [name, value] of Object.entries(headers)) {
		if (!response.headers.has(name)) response.headers.set(name, value);
	}
	return response;
}

type Parsed<T> = { data: T } | { response: Response };

function parseAgainst<T>(schema: z.ZodType<T>, value: unknown): Parsed<T> {
	const result = schema.safeParse(value);
	if (result.success) return { data: result.data };
	return { response: errorResponse(400, "Validation Error", formatZodError(result.error), "validation_error") };
}

async function parseJsonBody<B>(schema: z.ZodType<B>, request: Request): Promise<Parsed<B>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return {
			response: errorResponse(400, "Validation Error", "Request body must be valid JSON", "validation_error"),
		};
	}
	return parseAgainst(schema, raw);
}

/**
 * Turn whatever `handle` threw into a response: domain errors carry their own
 * status, a route's mapError gets the next say, and anything left is a 500 the
 * caller shouldn't see the details of.
 */
function errorFromThrow(err: unknown, request: Request, mapError?: (err: unknown) => ApiError | undefined): Response {
	if (err instanceof ApiError) {
		return errorResponse(err.status, err.error, err.message, err.code);
	}
	if (err instanceof WriteDeniedError) {
		return errorResponse(err.status, err.error, err.message, ENTITLEMENT_CODES[err.code] ?? "conflict");
	}

	const route = `${request.method} ${new URL(request.url).pathname}`;
	try {
		const mapped = mapError?.(err);
		if (mapped) return errorResponse(mapped.status, mapped.error, mapped.message, mapped.code);
	} catch (mapErr) {
		console.error(`[api] ${route} mapError threw:`, mapErr);
	}

	console.error(`[api] ${route} failed:`, err);
	return errorResponse(500, "Internal Server Error", "An unexpected error occurred", "internal_error");
}
