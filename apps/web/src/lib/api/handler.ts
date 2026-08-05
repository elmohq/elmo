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
import type { z } from "zod";
import {
	type ApiAuthenticationResult,
	type ApiRequestScope,
	authenticateApiRequest,
} from "@/lib/api/authentication.server";

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
	scope: ApiRequestScope;
}

export function evaluateApiHandlerScope(scope: ApiRequestScope, cloudOrganizationScoped: boolean): "allow" | "deny" {
	return scope.kind === "organization" && !cloudOrganizationScoped ? "deny" : "allow";
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
	/**
	 * Cloud routes stay unavailable until their queries are explicitly scoped
	 * to the authenticated organization. Set this only when `handle` consumes
	 * `ctx.scope.organizationId` for every resource read and write.
	 */
	cloudOrganizationScoped?: true;
	handle: (ctx: ApiHandlerContext<P, B>) => Promise<Response | object>;
}) {
	return async ({ request, params }: { request: Request; params: Record<string, string> }): Promise<Response> => {
		let authentication: ApiAuthenticationResult;
		try {
			authentication = await authenticateApiRequest(request);
		} catch (error) {
			console.error(`[api] ${request.method} ${new URL(request.url).pathname} authentication failed:`, error);
			return errorResponse(500, "Internal Server Error", "An unexpected error occurred");
		}
		if (!authentication.ok) {
			return errorResponse(authentication.status, authentication.error, authentication.message);
		}
		if (evaluateApiHandlerScope(authentication.scope, opts.cloudOrganizationScoped === true) === "deny") {
			return errorResponse(403, "Forbidden", "This API route has not enabled organization-scoped cloud access");
		}

		let parsedParams = params as P;
		if (opts.params) {
			const result = opts.params.safeParse(params);
			if (!result.success) {
				return errorResponse(400, "Validation Error", formatZodError(result.error));
			}
			parsedParams = result.data;
		}

		let parsedBody = undefined as B;
		if (opts.body) {
			let raw: unknown;
			try {
				raw = await request.json();
			} catch {
				return errorResponse(400, "Validation Error", "Request body must be valid JSON");
			}
			const result = opts.body.safeParse(raw);
			if (!result.success) {
				return errorResponse(400, "Validation Error", formatZodError(result.error));
			}
			parsedBody = result.data;
		}

		try {
			const result = await opts.handle({
				params: parsedParams,
				body: parsedBody,
				request,
				scope: authentication.scope,
			});
			if (result instanceof Response) {
				return result;
			}
			return Response.json(result, { status: opts.status ?? 200 });
		} catch (err) {
			if (err instanceof ApiError) {
				return errorResponse(err.status, err.error, err.message);
			}
			let mapped: ApiError | undefined;
			try {
				mapped = opts.mapError?.(err);
			} catch (mapErr) {
				console.error(`[api] ${request.method} ${new URL(request.url).pathname} mapError threw:`, mapErr);
			}
			if (mapped) {
				return errorResponse(mapped.status, mapped.error, mapped.message);
			}
			console.error(`[api] ${request.method} ${new URL(request.url).pathname} failed:`, err);
			return errorResponse(500, "Internal Server Error", "An unexpected error occurred");
		}
	};
}
