import spec from "@workspace/api-spec";
import { resetDeploymentCache } from "@workspace/deployment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, createApiHandler } from "../handler";

// A token that is not the admin key goes on to be looked up as an organization
// key, which needs a database. Standing in for that keeps the 401 here a
// statement about an unrecognized key rather than about an unreachable one.
const verifyApiKey = vi.hoisted(() => vi.fn().mockResolvedValue({ valid: false }));
vi.mock("@/lib/auth/server", () => ({ auth: { api: { verifyApiKey } } }));

const API_KEY = "test-api-key";

function makeRequest(options?: { method?: string; body?: string; apiKey?: string | null }) {
	const headers = new Headers();
	const apiKey = options?.apiKey === undefined ? API_KEY : options.apiKey;
	if (apiKey !== null) {
		headers.set("Authorization", `Bearer ${apiKey}`);
	}
	return new Request("http://localhost/api/v1/test", {
		method: options?.method ?? "GET",
		headers,
		body: options?.body,
	});
}

describe("createApiHandler", () => {
	beforeEach(() => {
		vi.stubEnv("ADMIN_API_KEYS", API_KEY);
		// The handler refuses writes in read-only mode, so it reads the
		// deployment. Nothing here exercises that; the mode just has to resolve.
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		resetDeploymentCache();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		resetDeploymentCache();
	});

	it("returns 401 when the API key is missing", async () => {
		const handler = createApiHandler({ handle: async () => ({ ok: true }) });
		const response = await handler({ request: makeRequest({ apiKey: null }), params: {} });
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
			message: "Valid API key required as Bearer token in Authorization header",
			code: "unauthorized",
		});
	});

	it("returns 401 when the API key is wrong", async () => {
		const handler = createApiHandler({ handle: async () => ({ ok: true }) });
		const response = await handler({ request: makeRequest({ apiKey: "wrong-key" }), params: {} });
		expect(response.status).toBe(401);
	});

	it("wraps a plain object return in Response.json with status 200", async () => {
		const handler = createApiHandler({ handle: async () => ({ ok: true }) });
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it("uses the configured success status for plain object returns", async () => {
		const handler = createApiHandler({ status: 201, handle: async () => ({ id: "abc" }) });
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(201);
	});

	it("passes through a Response returned by handle", async () => {
		const handler = createApiHandler({
			handle: async () => Response.json({ custom: true }, { status: 418 }),
		});
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(418);
		expect(await response.json()).toEqual({ custom: true });
	});

	it("returns 400 when params fail validation", async () => {
		const handler = createApiHandler({
			params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
			handle: async () => ({ ok: true }),
		});
		const response = await handler({ request: makeRequest(), params: { promptId: "not-a-uuid" } });
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe("Validation Error");
		expect(body.message).toContain("promptId");
	});

	it("passes validated params to handle", async () => {
		const promptId = "123e4567-e89b-12d3-a456-426614174000";
		const handler = createApiHandler({
			params: z.object({ promptId: z.guid() }),
			handle: async ({ params }) => ({ received: params.promptId }),
		});
		const response = await handler({ request: makeRequest(), params: { promptId } });
		expect(await response.json()).toEqual({ received: promptId });
	});

	it("accepts IDs without RFC version bits, like the old isValidUUID regex", async () => {
		const promptId = "00000000-0000-0000-0000-000000000001";
		const handler = createApiHandler({
			params: z.object({ promptId: z.guid() }),
			handle: async ({ params }) => ({ received: params.promptId }),
		});
		const response = await handler({ request: makeRequest(), params: { promptId } });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: promptId });
	});

	it("returns 400 when the body is not valid JSON", async () => {
		const handler = createApiHandler({
			body: z.object({ name: z.string() }),
			handle: async () => ({ ok: true }),
		});
		const response = await handler({
			request: makeRequest({ method: "POST", body: "{not json" }),
			params: {},
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Validation Error",
			message: "Request body must be valid JSON",
			code: "validation_error",
		});
	});

	it("returns 400 with a zod summary when the body fails validation", async () => {
		const handler = createApiHandler({
			body: z.object({ name: z.string().min(1) }),
			handle: async () => ({ ok: true }),
		});
		const response = await handler({
			request: makeRequest({ method: "POST", body: JSON.stringify({ name: 42 }) }),
			params: {},
		});
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe("Validation Error");
		expect(body.message).toContain("name");
	});

	it("passes the parsed body to handle", async () => {
		const handler = createApiHandler({
			body: z.object({ name: z.string().trim() }),
			handle: async ({ body }) => ({ name: body.name }),
		});
		const response = await handler({
			request: makeRequest({ method: "POST", body: JSON.stringify({ name: "  elmo  " }) }),
			params: {},
		});
		expect(await response.json()).toEqual({ name: "elmo" });
	});

	it("converts a thrown ApiError into its error response", async () => {
		const handler = createApiHandler({
			handle: async () => {
				throw new ApiError(404, "Not Found", "Prompt not found");
			},
		});
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: "Not Found",
			message: "Prompt not found",
			code: "not_found",
		});
	});

	it("uses mapError to translate domain errors", async () => {
		class ConflictError extends Error {}
		const handler = createApiHandler({
			mapError: (err) => {
				if (err instanceof ConflictError) {
					return new ApiError(409, "Conflict", err.message);
				}
			},
			handle: async () => {
				throw new ConflictError("Already exists");
			},
		});
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			error: "Conflict",
			message: "Already exists",
			code: "conflict",
		});
	});

	it("falls back to the enveloped 500 when mapError itself throws", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const handler = createApiHandler({
			mapError: () => {
				throw new Error("mapError exploded");
			},
			handle: async () => {
				throw new Error("db exploded");
			},
		});
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: "Internal Server Error",
			message: "An unexpected error occurred",
			code: "internal_error",
		});
		expect(consoleError).toHaveBeenCalled();
	});

	it("returns a logged 500 for unknown errors", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		const handler = createApiHandler({
			handle: async () => {
				throw new Error("db exploded");
			},
		});
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: "Internal Server Error",
			message: "An unexpected error occurred",
			code: "internal_error",
		});
		expect(consoleError).toHaveBeenCalledOnce();
	});

	it("checks auth before validating params", async () => {
		const handler = createApiHandler({
			params: z.object({ promptId: z.guid() }),
			handle: async () => ({ ok: true }),
		});
		const response = await handler({
			request: makeRequest({ apiKey: null }),
			params: { promptId: "not-a-uuid" },
		});
		expect(response.status).toBe(401);
	});
});

interface DocumentedHeader {
	required?: boolean;
	schema: { type: string };
}

const RATE_LIMIT_HEADERS = (spec.components.responses.RateLimitError as { headers: Record<string, DocumentedHeader> })
	.headers;

describe("createApiHandler, for a key over its rate limit", () => {
	beforeEach(() => {
		vi.stubEnv("ADMIN_API_KEYS", API_KEY);
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		resetDeploymentCache();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		resetDeploymentCache();
	});

	// What better-auth's verifyApiKey answers once a key's window is spent. It
	// counts the window in milliseconds, so `tryAgainIn` is milliseconds too.
	async function overLimit(tryAgainIn?: number): Promise<Response> {
		verifyApiKey.mockResolvedValueOnce({
			valid: false,
			key: null,
			error: {
				message: "Rate limit exceeded.",
				code: "RATE_LIMITED",
				...(tryAgainIn === undefined ? {} : { details: { tryAgainIn } }),
			},
		});
		const handler = createApiHandler({ handle: async () => ({ ok: true }) });
		return handler({ request: makeRequest({ apiKey: "elmo_spent" }), params: {} });
	}

	it("answers 429 without running the handler", async () => {
		const handle = vi.fn();
		verifyApiKey.mockResolvedValueOnce({ valid: false, key: null, error: { code: "RATE_LIMITED" } });
		const handler = createApiHandler({ handle });
		const response = await handler({ request: makeRequest({ apiKey: "elmo_spent" }), params: {} });

		expect(response.status).toBe(429);
		expect(await response.json()).toEqual({
			error: "Too Many Requests",
			message: "Rate limit exceeded for this API key",
			code: "rate_limited",
		});
		expect(handle).not.toHaveBeenCalled();
	});

	it("tells the caller how many seconds are left in the window", async () => {
		const response = await overLimit(41_250);

		expect(response.headers.get("Retry-After")).toBe("42");
	});

	it("never asks a caller to wait longer than the one-minute window", async () => {
		const response = await overLimit(60_000);

		expect(response.headers.get("Retry-After")).toBe("60");
	});

	it("asks for at least a second when the window is about to reset", async () => {
		const response = await overLimit(1);

		expect(response.headers.get("Retry-After")).toBe("1");
	});

	it("asks for a full window when better-auth does not say how long", async () => {
		const response = await overLimit();

		expect(response.headers.get("Retry-After")).toBe("60");
	});

	it.each([
		["with a wait from better-auth", 30_000],
		["without one", undefined],
	])("sends the headers the API reference documents for a 429, %s", async (_, tryAgainIn) => {
		const response = await overLimit(tryAgainIn);

		const sent = [...response.headers.keys()].filter((name) => name !== "content-type");
		expect(sent).toEqual(Object.keys(RATE_LIMIT_HEADERS).map((name) => name.toLowerCase()));
		for (const [name, header] of Object.entries(RATE_LIMIT_HEADERS)) {
			if (header.required) expect(response.headers.has(name)).toBe(true);
			if (header.schema.type === "integer") expect(response.headers.get(name)).toMatch(/^[1-9]\d*$/);
		}
	});
});
