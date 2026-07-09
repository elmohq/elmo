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

describe("getCloudAuthOptions", () => {
	beforeEach(() => {
		vi.stubEnv("APP_URL", "https://app.example.com");
		vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
		vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
		vi.stubEnv("RESEND_FROM_EMAIL", "Elmo <notifications@example.com>");
		vi.stubEnv("RESEND_API_KEY", "re_test_x");
	});

	it("requires email verification and sends it on signup", () => {
		const options = getCloudAuthOptions();
		expect(options.requireEmailVerification).toBe(true);
		expect(options.emailVerification?.sendOnSignUp).toBe(true);
	});

	it("configures Google OAuth from env", () => {
		const google = getCloudAuthOptions().socialProviders?.google;
		if (!google || typeof google === "function") {
			throw new Error("expected the google provider to be a plain options object");
		}
		expect(google.clientId).toBe("test-google-client-id");
	});

	it("rejects disposable-email signups in the user.create.before hook", async () => {
		const before = getCloudAuthOptions().databaseHooks?.user?.create?.before;
		expect(before).toBeDefined();
		await expect(before?.(makeUser("x@mailinator.com"), null)).rejects.toThrow();
	});

	it("allows regular-email signups through the user.create.before hook", async () => {
		const before = getCloudAuthOptions().databaseHooks?.user?.create?.before;
		expect(before).toBeDefined();
		await expect(before?.(makeUser("x@gmail.com"), null)).resolves.toBeUndefined();
	});
});
