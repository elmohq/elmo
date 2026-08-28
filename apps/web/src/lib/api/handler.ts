/**
 * Shared handler factory for /api/v1 routes.
 *
 * Centralizes the cross-cutting concerns every external API endpoint needs:
 * API key authentication, zod validation of path params and JSON bodies,
 * uniform error envelopes (`{ error, message }`), and a catch-all that turns
 * unexpected failures into a logged 500. Route files supply only the
 * resource-specific logic via `handle`.
 *
 * Handlers signal expected failures (404, 409, ...) by throwing `ApiError`.
 * A plain-object return value is wrapped in `Response.json()` with `status`
 * (default 200); returning a `Response` passes through untouched.
 */
import { WriteDeniedError } from "@workspace/lib/entitlements";
import type { z } from "zod";
import { validateApiKeyFromRequest } from "@/lib/auth/policies";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly error: string,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

function errorResponse(status: number, error: string, message: string): Response {
	return Response.json({ error, message }, { status });
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
}

export function createApiHandler<P = Record<string, string>, B = undefined>(opts: {
	/** Zod schema for route path params, e.g. `z.object({ promptId: z.guid() })`. */
	params?: z.ZodType<P>;
	/** Zod schema for the JSON request body (POST/PATCH). */
	body?: z.ZodType<B>;
	/** Success status used when `handle` returns a plain object (default 200). */
	status?: number;
	/** Translate domain errors thrown by `handle` into `ApiError` before the generic 500. */
	mapError?: (err: unknown) => ApiError | undefined;
	handle: (ctx: ApiHandlerContext<P, B>) => Promise<Response | object>;
}) {
	return async ({ request, params }: { request: Request; params: Record<string, string> }): Promise<Response> => {
		if (!validateApiKeyFromRequest(request)) {
			return errorResponse(401, "Unauthorized", "Valid API key required");
		}

		const parsedParams = opts.params ? parseAgainst(opts.params, params) : { data: params as P };
		if ("response" in parsedParams) return parsedParams.response;

		const parsedBody = opts.body ? await parseJsonBody(opts.body, request) : { data: undefined as B };
		if ("response" in parsedBody) return parsedBody.response;

		try {
			const result = await opts.handle({ params: parsedParams.data, body: parsedBody.data, request });
			return result instanceof Response ? result : Response.json(result, { status: opts.status ?? 200 });
		} catch (err) {
			return errorFromThrow(err, request, opts.mapError);
		}
	};
}

type Parsed<T> = { data: T } | { response: Response };

function parseAgainst<T>(schema: z.ZodType<T>, value: unknown): Parsed<T> {
	const result = schema.safeParse(value);
	if (result.success) return { data: result.data };
	return { response: errorResponse(400, "Validation Error", formatZodError(result.error)) };
}

async function parseJsonBody<B>(schema: z.ZodType<B>, request: Request): Promise<Parsed<B>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { response: errorResponse(400, "Validation Error", "Request body must be valid JSON") };
	}
	return parseAgainst(schema, raw);
}

/**
 * Turn whatever `handle` threw into a response: domain errors carry their own
 * status, a route's mapError gets the next say, and anything left is a 500 the
 * caller shouldn't see the details of.
 */
function errorFromThrow(err: unknown, request: Request, mapError?: (err: unknown) => ApiError | undefined): Response {
	if (err instanceof ApiError || err instanceof WriteDeniedError) {
		return errorResponse(err.status, err.error, err.message);
	}

	const route = `${request.method} ${new URL(request.url).pathname}`;
	try {
		const mapped = mapError?.(err);
		if (mapped) return errorResponse(mapped.status, mapped.error, mapped.message);
	} catch (mapErr) {
		console.error(`[api] ${route} mapError threw:`, mapErr);
	}

	console.error(`[api] ${route} failed:`, err);
	return errorResponse(500, "Internal Server Error", "An unexpected error occurred");
}
