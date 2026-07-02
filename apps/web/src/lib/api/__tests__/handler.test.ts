import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApiAuthContext } from "@/lib/auth/api-auth";
import { ApiError, createApiHandler } from "../handler";

const { resolveApiAuth } = vi.hoisted(() => ({
	resolveApiAuth: vi.fn(),
}));

vi.mock("@/lib/auth/api-auth", () => ({
	resolveApiAuth,
}));

const ADMIN_AUTH: ApiAuthContext = { type: "admin", userId: "admin-user-id", keyId: "admin-key-id" };

function userAuth(brandIds: string[] = ["brand-1"]): ApiAuthContext {
	return { type: "user", userId: "user-id", keyId: "user-key-id", brandIds };
}

function mockAuthAdmin() {
	resolveApiAuth.mockResolvedValue({ ok: true, auth: ADMIN_AUTH });
}

function mockAuthUser(brandIds?: string[]) {
	resolveApiAuth.mockResolvedValue({ ok: true, auth: userAuth(brandIds) });
}

function mockAuthFailure(status: 401 | 429, error: string, message: string) {
	resolveApiAuth.mockResolvedValue({ ok: false, status, error, message });
}

function makeRequest(options?: { method?: string; body?: string }) {
	return new Request("http://localhost/api/v1/test", {
		method: options?.method ?? "GET",
		body: options?.body,
	});
}

describe("createApiHandler", () => {
	beforeEach(() => {
		mockAuthAdmin();
	});

	afterEach(() => {
		resolveApiAuth.mockReset();
		vi.restoreAllMocks();
	});

	it("returns the resolver's error envelope verbatim on 401 failure", async () => {
		mockAuthFailure(401, "Unauthorized", "Valid API key required as Bearer token in Authorization header");
		const handler = createApiHandler({ handle: async () => ({ ok: true }) });
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: "Unauthorized",
			message: "Valid API key required as Bearer token in Authorization header",
		});
	});

	it("returns the resolver's error envelope verbatim on 429 failure", async () => {
		mockAuthFailure(429, "Rate Limit Exceeded", "API key rate limit exceeded. Try again later.");
		const handler = createApiHandler({ handle: async () => ({ ok: true }) });
		const response = await handler({ request: makeRequest(), params: {} });
		expect(response.status).toBe(429);
		expect(await response.json()).toEqual({
			error: "Rate Limit Exceeded",
			message: "API key rate limit exceeded. Try again later.",
		});
	});

	it("never evaluates params/body validation or handle when auth fails", async () => {
		mockAuthFailure(401, "Unauthorized", "Invalid API key");
		const params = vi.fn();
		const handle = vi.fn(async () => ({ ok: true }));
		const handler = createApiHandler({
			params: { safeParse: params } as unknown as z.ZodType<Record<string, string>>,
			handle,
		});
		await handler({ request: makeRequest(), params: { promptId: "not-a-uuid" } });
		expect(params).not.toHaveBeenCalled();
		expect(handle).not.toHaveBeenCalled();
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
		expect(await response.json()).toEqual({ error: "Not Found", message: "Prompt not found" });
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
		expect(await response.json()).toEqual({ error: "Conflict", message: "Already exists" });
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
		});
		expect(consoleError).toHaveBeenCalledOnce();
	});

	it("checks auth before validating params", async () => {
		mockAuthFailure(401, "Unauthorized", "Valid API key required as Bearer token in Authorization header");
		const handler = createApiHandler({
			params: z.object({ promptId: z.guid() }),
			handle: async () => ({ ok: true }),
		});
		const response = await handler({
			request: makeRequest(),
			params: { promptId: "not-a-uuid" },
		});
		expect(response.status).toBe(401);
	});

	it("calls resolveApiAuth exactly once per request, with the Request object", async () => {
		const request = makeRequest();
		const handler = createApiHandler({ handle: async () => ({ ok: true }) });
		await handler({ request, params: {} });
		expect(resolveApiAuth).toHaveBeenCalledOnce();
		expect(resolveApiAuth).toHaveBeenCalledWith(request);
	});

	describe("scope: admin", () => {
		it("returns 403 when a user-scoped key hits an admin-scoped endpoint", async () => {
			mockAuthUser();
			const handle = vi.fn(async () => ({ ok: true }));
			const handler = createApiHandler({ scope: "admin", handle });
			const response = await handler({ request: makeRequest(), params: {} });
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({
				error: "Forbidden",
				message: "This endpoint requires an admin API key",
			});
			expect(handle).not.toHaveBeenCalled();
		});

		it("calls handle when an admin-scoped key hits an admin-scoped endpoint", async () => {
			mockAuthAdmin();
			const handle = vi.fn(async () => ({ ok: true }));
			const handler = createApiHandler({ scope: "admin", handle });
			const response = await handler({ request: makeRequest(), params: {} });
			expect(response.status).toBe(200);
			expect(handle).toHaveBeenCalledOnce();
		});

		it("runs the scope check before params/body validation", async () => {
			mockAuthUser();
			const handle = vi.fn(async () => ({ ok: true }));
			const handler = createApiHandler({
				scope: "admin",
				params: z.object({ promptId: z.guid() }),
				handle,
			});
			const response = await handler({ request: makeRequest(), params: { promptId: "not-a-uuid" } });
			expect(response.status).toBe(403);
			expect(handle).not.toHaveBeenCalled();
		});
	});

	describe("ctx.auth", () => {
		it("passes the exact admin auth context through to handle when no scope is set", async () => {
			mockAuthAdmin();
			let received: ApiAuthContext | undefined;
			const handler = createApiHandler({
				handle: async (ctx) => {
					received = ctx.auth;
					return { ok: true };
				},
			});
			await handler({ request: makeRequest(), params: {} });
			expect(received).toEqual(ADMIN_AUTH);
		});

		it("passes the exact user auth context through to handle when no scope is set", async () => {
			mockAuthUser(["brand-1", "brand-2"]);
			let received: ApiAuthContext | undefined;
			const handler = createApiHandler({
				handle: async (ctx) => {
					received = ctx.auth;
					return { ok: true };
				},
			});
			const response = await handler({ request: makeRequest(), params: {} });
			expect(response.status).toBe(200);
			expect(received).toEqual({
				type: "user",
				userId: "user-id",
				keyId: "user-key-id",
				brandIds: ["brand-1", "brand-2"],
			});
		});
	});
});
