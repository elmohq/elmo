import { describe, expect, it } from "vitest";
import { validateWorkerStartupEnv } from "./startup-env";

const RUNTIME_FENCE_ENV = {
	DATABASE_URL_UNPOOLED: "postgres://user@localhost/elmo",
	ELMO_RUNTIME_FENCE_GENERATION: "0020",
};

describe("worker startup environment", () => {
	it("requires the billing client credential before a cloud worker becomes ready", () => {
		expect(() =>
			validateWorkerStartupEnv({
				...RUNTIME_FENCE_ENV,
				DEPLOYMENT_MODE: "cloud",
				SENTRY_DSN: "https://sentry.example/1",
			}),
		).toThrow(/STRIPE_SECRET_KEY/);
	});

	it("accepts the worker-only cloud requirements together", () => {
		expect(() =>
			validateWorkerStartupEnv({
				...RUNTIME_FENCE_ENV,
				DEPLOYMENT_MODE: "cloud",
				SENTRY_DSN: "https://sentry.example/1",
				STRIPE_SECRET_KEY: "sk_test_example",
			}),
		).not.toThrow();
	});

	it("requires a direct database session and the image's exact fence generation", () => {
		expect(() => validateWorkerStartupEnv({ DEPLOYMENT_MODE: "local", ELMO_RUNTIME_FENCE_GENERATION: "0020" })).toThrow(
			/DATABASE_URL_UNPOOLED/,
		);
		expect(() =>
			validateWorkerStartupEnv({
				...RUNTIME_FENCE_ENV,
				DEPLOYMENT_MODE: "local",
				ELMO_RUNTIME_FENCE_GENERATION: "0011",
			}),
		).toThrow(/must be 0020/);
	});

	it("does not allow a source-deployed cloud worker to omit the generation fence", () => {
		expect(() =>
			validateWorkerStartupEnv({
				DATABASE_URL_UNPOOLED: "postgres://user@localhost/elmo",
				DEPLOYMENT_MODE: "cloud",
				SENTRY_DSN: "https://sentry.example/1",
				STRIPE_SECRET_KEY: "sk_test_example",
			}),
		).toThrow(/ELMO_RUNTIME_FENCE_GENERATION/);
	});

	it("does not impose cloud billing credentials on fenced local or white-label workers", () => {
		expect(() => validateWorkerStartupEnv({ ...RUNTIME_FENCE_ENV, DEPLOYMENT_MODE: "local" })).not.toThrow();
		expect(() => validateWorkerStartupEnv({ ...RUNTIME_FENCE_ENV, DEPLOYMENT_MODE: "whitelabel" })).not.toThrow();
	});

	it("keeps ordinary source development optional", () => {
		expect(() => validateWorkerStartupEnv({ DEPLOYMENT_MODE: "local" })).not.toThrow();
	});
});
