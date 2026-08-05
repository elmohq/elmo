import { afterEach, describe, expect, it, vi } from "vitest";

const managedEnvironment = [
	"DATABASE_URL",
	"BETTER_AUTH_SECRET",
	"APP_URL",
	"VITE_APP_URL",
	"DEPLOYMENT_MODE",
	"AUTH0_DOMAIN",
	"AUTH0_CLIENT_ID",
	"AUTH0_CLIENT_SECRET",
	"AUTH0_MGMT_API_DOMAIN",
	"STRIPE_SECRET_KEY",
	"STRIPE_WEBHOOK_SECRET",
	"STRIPE_BILLING_PORTAL_CONFIGURATION_ID",
] as const;
const originalEnvironment = Object.fromEntries(managedEnvironment.map((name) => [name, process.env[name]]));
const mutableEnvironment = process.env as Record<string, string | undefined>;

function setMode(mode: "local" | "demo" | "whitelabel"): void {
	for (const name of managedEnvironment) delete mutableEnvironment[name];
	mutableEnvironment.DATABASE_URL = "postgres://smoke:smoke@127.0.0.1:5432/smoke";
	mutableEnvironment.BETTER_AUTH_SECRET = "noncloud-auth-isolation-secret-000000000";
	mutableEnvironment.DEPLOYMENT_MODE = mode;
	if (mode === "whitelabel") {
		mutableEnvironment.VITE_APP_URL = "https://customer.example";
		mutableEnvironment.AUTH0_DOMAIN = "customer.auth0.example";
		mutableEnvironment.AUTH0_CLIENT_ID = "customer-client";
		mutableEnvironment.AUTH0_CLIENT_SECRET = "customer-secret";
		mutableEnvironment.AUTH0_MGMT_API_DOMAIN = "customer.auth0.example";
	} else {
		mutableEnvironment.APP_URL = "http://localhost:3000";
	}
}

describe("noncloud auth billing isolation", () => {
	afterEach(() => {
		for (const name of managedEnvironment) {
			const value = originalEnvironment[name];
			if (value === undefined) delete mutableEnvironment[name];
			else mutableEnvironment[name] = value;
		}
		vi.resetModules();
	});

	it.each(["local", "demo", "whitelabel"] as const)(
		"initializes %s auth without Stripe configuration",
		async (mode) => {
			setMode(mode);
			vi.resetModules();
			const { auth, requireCloudBillingRuntime } = await import("./server");

			expect(auth.handler).toBeTypeOf("function");
			expect(() => requireCloudBillingRuntime()).toThrow("Cloud billing is not available in this deployment");
		},
	);
});
