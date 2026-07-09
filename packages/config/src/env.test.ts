import { describe, expect, it } from "vitest";
import { getEnvRequirements, requireEnvVars, validateEnvRequirements } from "./env";

// Vars required specifically because the deployment is cloud.
const CLOUD_ONLY_VARS = ["APP_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"];
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
		};
		const { missing } = validateEnvRequirements(cloudReqs, env);
		const missingIds = new Set(missing.map((entry) => entry.id));
		for (const name of [...CLOUD_ONLY_VARS, ...CLOUD_SHARED_VARS]) {
			expect(missingIds.has(name), `${name} should be satisfied`).toBe(false);
		}
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

describe("whitelabel env requirements", () => {
	const requiredIds = new Set(getEnvRequirements("whitelabel").map((requirement) => requirement.id));

	it("requires the branding vars the deployment factory reads", () => {
		for (const name of ["VITE_APP_NAME", "VITE_APP_ICON", "VITE_APP_URL", "VITE_OPTIMIZATION_URL_TEMPLATE"]) {
			expect(requiredIds.has(name), `${name} should be required in whitelabel`).toBe(true);
		}
	});

	it("leaves the parent-brand vars optional", () => {
		for (const name of ["VITE_APP_PARENT_NAME", "VITE_APP_PARENT_URL"]) {
			expect(requiredIds.has(name), `${name} should be optional in whitelabel`).toBe(false);
		}
	});
});
