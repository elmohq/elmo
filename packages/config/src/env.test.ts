import { describe, expect, it } from "vitest";
import { getEnvRequirements, requireEnvVars, validateEnvRequirements } from "./env";

function missingIds(mode: Parameters<typeof getEnvRequirements>[0], env: Record<string, string>): Set<string> {
	return new Set(validateEnvRequirements(getEnvRequirements(mode), env).missing.map((entry) => entry.id));
}

// Vars required specifically because the deployment is cloud.
const CLOUD_ONLY_VARS = [
	"APP_URL",
	"STRIPE_SECRET_KEY",
	"STRIPE_WEBHOOK_SECRET",
	"RESEND_API_KEY",
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
	"RESEND_FROM_EMAIL",
];
// Infra vars every validated mode needs — cloud now among them.
const CLOUD_SHARED_VARS = ["DATABASE_URL", "BETTER_AUTH_SECRET", "SCRAPE_TARGETS", "DEPLOYMENT_MODE"];

describe("cloud env requirements", () => {
	const cloudReqs = getEnvRequirements("cloud");
	const requiredIds = new Set(cloudReqs.map((requirement) => requirement.id));

	it("requires the cloud-specific service credentials", () => {
		for (const name of CLOUD_ONLY_VARS) {
			expect(requiredIds.has(name), `${name} should be required in cloud`).toBe(true);
		}
	});

	it("requires the shared infra vars", () => {
		for (const name of CLOUD_SHARED_VARS) {
			expect(requiredIds.has(name), `${name} should be required in cloud`).toBe(true);
		}
	});

	it("flags every cloud var missing on an empty env", () => {
		const { missing, isValid } = validateEnvRequirements(cloudReqs, {});
		const missingIds = new Set(missing.map((entry) => entry.id));
		for (const name of [...CLOUD_ONLY_VARS, ...CLOUD_SHARED_VARS]) {
			expect(missingIds.has(name), `${name} should be reported missing`).toBe(true);
		}
		expect(isValid).toBe(false);
	});

	it("does not flag the cloud vars once they are set", () => {
		const env: Record<string, string> = {
			DEPLOYMENT_MODE: "cloud",
			DATABASE_URL: "postgres://localhost/elmo",
			BETTER_AUTH_SECRET: "secret",
			SCRAPE_TARGETS: "chatgpt:olostep:online",
			APP_URL: "https://app.elmo.com/",
			STRIPE_SECRET_KEY: "sk_test_x",
			STRIPE_WEBHOOK_SECRET: "whsec_x",
			RESEND_API_KEY: "re_test_x",
			GOOGLE_CLIENT_ID: "test-google-client-id",
			GOOGLE_CLIENT_SECRET: "test-google-client-secret",
			RESEND_FROM_EMAIL: "Elmo <notifications@example.com>",
		};
		const { missing } = validateEnvRequirements(cloudReqs, env);
		const missingIds = new Set(missing.map((entry) => entry.id));
		for (const name of [...CLOUD_ONLY_VARS, ...CLOUD_SHARED_VARS]) {
			expect(missingIds.has(name), `${name} should be satisfied`).toBe(false);
		}
	});
});

describe("ELMO_ENCRYPTION_KEY", () => {
	it("is required by local, which the CLI provisions", () => {
		const ids = new Set(getEnvRequirements("local").map((requirement) => requirement.id));
		expect(ids.has("ELMO_ENCRYPTION_KEY")).toBe(true);
	});

	it("is not required by the modes provisioned out of band", () => {
		for (const mode of ["demo", "whitelabel", "cloud"] as const) {
			const ids = new Set(getEnvRequirements(mode).map((requirement) => requirement.id));
			expect(ids.has("ELMO_ENCRYPTION_KEY"), `${mode} should not require it`).toBe(false);
		}
	});
});

describe("whitelabel env requirements", () => {
	it("requires AUTH0_DOMAIN, which SSO is built on", () => {
		expect(missingIds("whitelabel", {}).has("AUTH0_DOMAIN")).toBe(true);
	});

	it("does not require the optional parent-app link", () => {
		const missing = missingIds("whitelabel", {});
		expect(missing.has("VITE_APP_PARENT_NAME")).toBe(false);
		expect(missing.has("VITE_APP_PARENT_URL")).toBe(false);
	});
});

describe("research provider requirement", () => {
	it("is missing when no direct LLM key is set, in every mode", () => {
		for (const mode of ["local", "demo", "whitelabel", "cloud"] as const) {
			expect(missingIds(mode, {}).has("RESEARCH_PROVIDER"), mode).toBe(true);
		}
	});

	it("is satisfied by any one direct LLM key", () => {
		for (const key of ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "MISTRAL_API_KEY"]) {
			expect(missingIds("local", { [key]: "x" }).has("RESEARCH_PROVIDER"), key).toBe(false);
		}
	});

	it("is not satisfied by scraper keys alone", () => {
		expect(missingIds("local", { OLOSTEP_API_KEY: "x", CLORO_API_KEY: "x" }).has("RESEARCH_PROVIDER")).toBe(true);
	});

	it("follows ONBOARDING_LLM_TARGET to that provider's keys", () => {
		const target = { ONBOARDING_LLM_TARGET: "claude:anthropic-api" };
		expect(missingIds("local", { ...target, OPENAI_API_KEY: "x" }).has("RESEARCH_PROVIDER")).toBe(true);
		expect(missingIds("local", { ...target, ANTHROPIC_API_KEY: "x" }).has("RESEARCH_PROVIDER")).toBe(false);
		expect(missingIds("local", { ONBOARDING_LLM_TARGET: "stub:stub" }).has("RESEARCH_PROVIDER")).toBe(false);
	});
});

describe("requireEnvVars", () => {
	it("reports every missing required env var at once", () => {
		expect(() =>
			requireEnvVars(["VITE_APP_NAME", "VITE_APP_ICON", "VITE_APP_URL"], { VITE_APP_URL: "https://app.elmo.com" }),
		).toThrow("Missing required environment variables: VITE_APP_NAME, VITE_APP_ICON");
	});

	it("uses the singular message when a single var is missing", () => {
		expect(() => requireEnvVars(["VITE_APP_NAME"], {})).toThrow("Missing required environment variable: VITE_APP_NAME");
	});

	it("returns the resolved values when every var is present", () => {
		const env = { VITE_APP_NAME: "Acme", VITE_APP_URL: "https://app.elmo.com" };
		expect(requireEnvVars(["VITE_APP_NAME", "VITE_APP_URL"], env)).toEqual(env);
	});
});
