import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudAuthOptions } from "./auth-hooks";

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
