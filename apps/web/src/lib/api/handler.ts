/**
 * Where a `/api/v1` caller is identified. The deployment middleware ahead of
 * this can only check that a bearer is present, so a route not built here
 * answers to anyone holding any token.
 *
 * `handle` throws `ApiError` for expected failures; a plain object is wrapped
 * in `Response.json()`, a `Response` passes through.
 */
import { WriteDeniedError } from "@workspace/lib/entitlements";
import type { z } from "zod";
import { type ApiAuth, type ApiAuthFailure, principalScopes, resolveApiAuth } from "@/lib/auth/api-auth";
import { getDeployment } from "@/lib/config/server";
import type { ApiScope } from "./scopes";

/** A union rather than an enum in the spec, so a generated client does not
 * throw on a code added later. */
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
	| "model_not_in_plan"
	| "model_picks_exceeded"
	| "premium_not_in_plan"
	| "premium_pool_exhausted"
	| "cadence_faster_than_plan"
	| "internal_error";

/** The guards spell codes with hyphens and say "platform"; the wire uses
 * underscores and "model". */
const ENTITLEMENT_CODES: Record<string, ApiErrorCode> = {
	"no-active-plan": "no_active_plan",
	"brand-limit": "brand_limit",
	"prompt-limit": "prompt_limit",
	"platform-not-in-plan": "model_not_in_plan",
	"platform-picks-exceeded": "model_picks_exceeded",
	"premium-not-in-plan": "premium_not_in_plan",
	"premium-pool-exhausted": "premium_pool_exhausted",
	"cadence-faster-than-plan": "cadence_faster_than_plan",
};

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

/** Stamped on every handler here, so the conformance test can ask a route what
 * it wired up rather than grep for the call. */
const API_HANDLER = Symbol.for("elmo.api.handler");

export interface ApiHandlerMeta {
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

export function apiHandlerMeta(value: unknown): ApiHandlerMeta | undefined {
	if (typeof value !== "function") return undefined;
	return (value as unknown as Record<symbol, ApiHandlerMeta | undefined>)[API_HANDLER];
}

/** Params then body, short-circuiting on the first that fails validation. */
async function parseInputs<P, B>(
	opts: { params?: z.ZodType<P>; body?: z.ZodType<B> },
	request: Request,
	params: Record<string, string>,
): Promise<{ response: Response } | { params: P; body: B }> {
	const parsedParams = opts.params ? parseAgainst(opts.params, params) : { data: params as P };
	if ("response" in parsedParams) return { response: parsedParams.response };

	const parsedBody = opts.body ? await parseJsonBody(opts.body, request) : { data: undefined as B };
	if ("response" in parsedBody) return { response: parsedBody.response };

	return { params: parsedParams.data, body: parsedBody.data };
}

export function createApiHandler<P = Record<string, string>, B = undefined>(opts: {
	params?: z.ZodType<P>;
	body?: z.ZodType<B>;
	status?: number;
	scopes?: ApiScope[];
	adminOnly?: boolean;
	adminOnlyHint?: string;
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

		const parsed = await parseInputs(opts, request, params);
		if ("response" in parsed) return withRateLimit(parsed.response, auth);

		try {
			const result = await opts.handle({ params: parsed.params, body: parsed.body, request, auth });
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
 * Without this an unclaimed verb falls through the file router to the SPA and
 * answers 200 with HTML, so a write would look like it worked.
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

function refuseRequest(
	auth: ApiAuth,
	request: Request,
	opts: { scopes?: ApiScope[]; adminOnly?: boolean; adminOnlyHint?: string },
): Response | null {
	const headers = rateLimitHeaders(auth);

	if (opts.adminOnly && auth.kind !== "admin") {
		const hint = opts.adminOnlyHint ? ` ${opts.adminOnlyHint}` : "";
		return errorResponse(
			403,
			"Forbidden",
			`This endpoint requires an instance admin key.${hint}`,
			"forbidden",
			headers,
		);
	}

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

	if (getDeployment().features.readOnly && WRITE_METHODS.has(request.method)) {
		return errorResponse(403, "Demo Mode", "Write operations are disabled in demo mode", "read_only", headers);
	}

	return null;
}

/**
 * The plugin counts a fixed window with a read-modify-write per request, so
 * `Remaining` is a guide to back off on rather than a ledger to ride to zero.
 */
function rateLimitHeaders(auth: ApiAuth): Record<string, string> | undefined {
	if (auth.kind !== "organization") return undefined;
	const headers: Record<string, string> = { "X-RateLimit-Limit": String(auth.rateLimit.limit) };
	if (auth.rateLimitRemaining !== null) headers["X-RateLimit-Remaining"] = String(auth.rateLimitRemaining);
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
