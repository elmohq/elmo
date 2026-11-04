import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudAuthOptions } from "./cloud";

function makeUser(email: string) {
	return {
		id: "user_1",
		name: "Test User",
		email,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

/** Everything getCloudAuthOptions needs to construct; individual tests vary the rest. */
beforeEach(() => {
	vi.stubEnv("APP_URL", "https://app.example.com");
	vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
	vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
	vi.stubEnv("RESEND_FROM_EMAIL", "Elmo <notifications@example.com>");
	vi.stubEnv("RESEND_API_KEY", "re_test_x");
	vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
	vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
	vi.stubEnv("CLOUD_SIGNUP_ALLOWLIST", "*");
	vi.stubEnv("TURNSTILE_SECRET_KEY", "");
	vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("getCloudAuthOptions", () => {
	it("injects the Stripe billing plugin", () => {
		const plugins = getCloudAuthOptions().extraPlugins ?? [];
		expect(plugins.map((plugin) => plugin.id)).toContain("stripe");
	});

	it("requires email verification and sends it on signup and unverified sign-in", () => {
		const options = getCloudAuthOptions();
		expect(options.requireEmailVerification).toBe(true);
		expect(options.emailVerification?.sendOnSignUp).toBe(true);
		expect(options.emailVerification?.sendOnSignIn).toBe(true);
	});

	it("configures Google OAuth from env", () => {
		const google = getCloudAuthOptions().socialProviders?.google;
		if (!google || typeof google === "function") {
			throw new Error("expected the google provider to be a plain options object");
		}
		expect(google.clientId).toBe("test-google-client-id");
	});

	it("rejects disposable-email signups in the user.create.before hook", async () => {
		const createBefore = getCloudAuthOptions().databaseHooks?.user?.create?.before;
		expect(createBefore).toBeDefined();
		await expect(createBefore?.(makeUser("x@mailinator.com"), null)).rejects.toThrow();
	});

	it("allows regular-email signups through the user.create.before hook", async () => {
		const createBefore = getCloudAuthOptions().databaseHooks?.user?.create?.before;
		expect(createBefore).toBeDefined();
		await expect(createBefore?.(makeUser("x@gmail.com"), null)).resolves.toBeUndefined();
	});
});

/**
 * The invite-only gate, exercised through the hook that actually runs it.
 * Entries are exact addresses, "@domain" suffixes, or "*"; an unset allowlist
 * fails closed so a misconfigured cloud deployment cannot be signed up to.
 */
describe("signup allowlist", () => {
	async function signUp(email: string, allowlist: string) {
		vi.stubEnv("CLOUD_SIGNUP_ALLOWLIST", allowlist);
		const createBefore = getCloudAuthOptions().databaseHooks?.user?.create?.before;
		if (!createBefore) throw new Error("expected a user.create.before hook");
		return createBefore(makeUser(email), null);
	}

	it("denies everyone when the allowlist is unset", async () => {
		await expect(signUp("anyone@example.com", "")).rejects.toThrow();
	});

	it("admits an exact address and rejects one that is not listed", async () => {
		await expect(signUp("alice@partner.com", "alice@partner.com")).resolves.toBeUndefined();
		await expect(signUp("bob@partner.com", "alice@partner.com")).rejects.toThrow();
	});

	it("admits any address at an allowed domain", async () => {
		await expect(signUp("anyone@elmohq.com", "@elmohq.com")).resolves.toBeUndefined();
		await expect(signUp("anyone@gmail.com", "@elmohq.com")).rejects.toThrow();
	});

	it("matches case-insensitively", async () => {
		await expect(signUp("Alice@Elmohq.com", "@ELMOHQ.COM")).resolves.toBeUndefined();
	});

	it("does not let a domain entry match a lookalike domain", async () => {
		await expect(signUp("x@evil-elmohq.com", "@elmohq.com")).rejects.toThrow();
		await expect(signUp("x@elmohq.com.evil.com", "@elmohq.com")).rejects.toThrow();
	});

	it("opens signup to everyone when '*' is present", async () => {
		await expect(signUp("anyone@anywhere.com", "@elmohq.com,*")).resolves.toBeUndefined();
	});

	it("ignores blank entries", async () => {
		await expect(signUp("a@b.com", " , ,a@b.com")).resolves.toBeUndefined();
		await expect(signUp("a@b.com", " , ")).rejects.toThrow();
	});

	it("admits an address with no domain only when listed exactly", async () => {
		await expect(signUp("not-an-email", "@elmohq.com")).rejects.toThrow();
		await expect(signUp("not-an-email", "not-an-email")).resolves.toBeUndefined();
	});
});

describe("Turnstile bot protection", () => {
	const silentLogger = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };

	function enableTurnstile() {
		vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
		vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "turnstile-site-key");
	}

	async function send(path: string, captchaToken?: string): Promise<Response | undefined> {
		const request = new Request(`https://app.example.com/api/auth${path}`, {
			method: "POST",
			headers: captchaToken ? { "x-captcha-response": captchaToken } : {},
		});
		for (const plugin of getCloudAuthOptions().extraPlugins ?? []) {
			if (!plugin.onRequest) continue;
			const ctx = { options: { basePath: "/api/auth" }, logger: silentLogger };
			const result = await plugin.onRequest(request, ctx as unknown as Parameters<typeof plugin.onRequest>[1]);
			if (result && "response" in result) return result.response;
		}
		return undefined;
	}

	function stubSiteverify(success: boolean, hostname = "app.example.com") {
		const fetchMock = vi.fn(async () =>
			Response.json({ success, hostname, "error-codes": success ? [] : ["invalid-input-response"] }),
		);
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	it("rejects email sign-up, sign-in, password reset, and verification resend without a token", async () => {
		enableTurnstile();
		for (const path of ["/sign-up/email", "/sign-in/email", "/request-password-reset", "/send-verification-email"]) {
			const response = await send(path);
			expect(response?.status, path).toBe(400);
		}
	});

	it("rejects a token Cloudflare does not accept", async () => {
		enableTurnstile();
		stubSiteverify(false);
		const response = await send("/sign-up/email", "forged-token");
		expect(response?.status).toBe(403);
	});

	it("rejects a token solved on another site", async () => {
		enableTurnstile();
		stubSiteverify(true, "evil.example.net");
		const response = await send("/sign-up/email", "borrowed-token");
		expect(response?.status).toBe(403);
	});

	it("accepts Cloudflare test keys on any host so local sign-in works", async () => {
		vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
		vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
		stubSiteverify(true, "example.com");
		expect(await send("/sign-up/email", "XXXX.DUMMY.TOKEN.XXXX")).toBeUndefined();
	});

	it("lets a request with a token Cloudflare accepts through", async () => {
		enableTurnstile();
		const fetchMock = stubSiteverify(true);
		expect(await send("/sign-up/email", "good-token")).toBeUndefined();
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("leaves Google sign-in and session reads unchallenged", async () => {
		enableTurnstile();
		expect(await send("/sign-in/social")).toBeUndefined();
		expect(await send("/get-session")).toBeUndefined();
	});

	it("is off until both keys are configured", async () => {
		expect(await send("/sign-up/email")).toBeUndefined();
		vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
		expect(await send("/sign-up/email")).toBeUndefined();
	});
});

describe("remembering the cloud login method", () => {
	const baseURL = "https://app.example.com";
	const email = "reader@example.com";
	const password = "test-password-for-login";
	const methodCookie = "better-auth.last_used_login_method";

	async function createLoginAuth() {
		const options = getCloudAuthOptions();
		const auth = betterAuth({
			baseURL,
			secret: "test-secret-for-remembering-login-methods",
			database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
			emailAndPassword: { enabled: true, requireEmailVerification: options.requireEmailVerification },
			socialProviders: options.socialProviders,
			plugins: [organization(), ...(options.extraPlugins ?? [])],
		});
		await auth.api.signUpEmail({ body: { email, password, name: "Example Reader" } });
		const context = await auth.$context;
		const user = await context.internalAdapter.findUserByEmail(email);
		if (!user) throw new Error("expected the test user to exist");
		await context.internalAdapter.updateUser(user.user.id, { emailVerified: true });
		return auth;
	}

	function cookieHeader(response: Response) {
		return response.headers
			.getSetCookie()
			.map((cookie) => cookie.split(";")[0])
			.join("; ");
	}

	it("remembers a successful email sign-in for 30 days and keeps the hint after sign-out", async () => {
		const auth = await createLoginAuth();
		const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
		const cookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${methodCookie}=`));

		expect(response.status).toBe(200);
		expect(cookie).toContain(`${methodCookie}=email`);
		expect(cookie).toContain("Max-Age=2592000");
		expect(cookie?.toLowerCase()).not.toContain("httponly");

		const signOut = await auth.api.signOut({
			headers: new Headers({ cookie: cookieHeader(response) }),
			asResponse: true,
		});
		expect(signOut.status).toBe(200);
		expect(signOut.headers.getSetCookie().some((cookie) => cookie.startsWith(`${methodCookie}=`))).toBe(false);
	});

	it("does not replace the previous method when a password is incorrect", async () => {
		const auth = await createLoginAuth();
		const response = await auth.api.signInEmail({
			body: { email, password: "incorrect-password" },
			headers: new Headers({ cookie: `${methodCookie}=google` }),
			asResponse: true,
		});

		expect(response.status).toBe(401);
		expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${methodCookie}=`))).toBe(false);
	});

	it("does not remember an email sign-in that still requires verification", async () => {
		const auth = await createLoginAuth();
		const context = await auth.$context;
		const user = await context.internalAdapter.findUserByEmail(email);
		if (!user) throw new Error("expected the test user to exist");
		await context.internalAdapter.updateUser(user.user.id, { emailVerified: false });
		const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });

		expect(response.status).toBe(403);
		expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith(`${methodCookie}=`))).toBe(false);
	});

	it("remembers Google only after its callback succeeds and updates the hint when switching to email", async () => {
		const auth = await createLoginAuth();
		const context = await auth.$context;
		const google = context.socialProviders.find((provider) => provider.id === "google");
		if (!google) throw new Error("expected the Google provider to exist");
		vi.spyOn(google, "validateAuthorizationCode").mockResolvedValue({ accessToken: "test-google-token" });
		vi.spyOn(google, "getUserInfo").mockResolvedValue({
			user: { name: "Example Reader", email, emailVerified: true },
			data: { sub: "google-reader" },
		});

		const start = await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/app" }, asResponse: true });
		expect(start.headers.getSetCookie().some((cookie) => cookie.startsWith(`${methodCookie}=`))).toBe(false);
		const { url } = (await start.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");
		if (!state) throw new Error("expected OAuth state in the Google authorization URL");
		const callback = await auth.handler(
			new Request(`${baseURL}/api/auth/callback/google?${new URLSearchParams({ code: "test-code", state })}`, {
				headers: { cookie: cookieHeader(start) },
			}),
		);

		expect(callback.status).toBe(302);
		expect(callback.headers.get("location")).toBe("/app");
		expect(cookieHeader(callback)).toContain(`${methodCookie}=google`);

		const emailLogin = await auth.api.signInEmail({
			body: { email, password },
			headers: new Headers({ cookie: cookieHeader(callback) }),
			asResponse: true,
		});
		expect(emailLogin.status).toBe(200);
		expect(cookieHeader(emailLogin)).toContain(`${methodCookie}=email`);
	});
});
