import { describe, expect, it } from "vitest";
import { validateWorkerStartupEnv } from "./startup-env";

describe("worker startup environment", () => {
	it("requires the billing client credential before a cloud worker becomes ready", () => {
		expect(() =>
			validateWorkerStartupEnv({ DEPLOYMENT_MODE: "cloud", SENTRY_DSN: "https://sentry.example/1" }),
		).toThrow(/STRIPE_SECRET_KEY/);
	});

	it("accepts the worker-only cloud requirements together", () => {
		expect(() =>
			validateWorkerStartupEnv({
				DEPLOYMENT_MODE: "cloud",
				SENTRY_DSN: "https://sentry.example/1",
				STRIPE_SECRET_KEY: "sk_test_example",
			}),
		).not.toThrow();
	});

	it("does not impose cloud billing credentials on local or white-label workers", () => {
		expect(() => validateWorkerStartupEnv({ DEPLOYMENT_MODE: "local" })).not.toThrow();
		expect(() => validateWorkerStartupEnv({ DEPLOYMENT_MODE: "whitelabel" })).not.toThrow();
	});
});
