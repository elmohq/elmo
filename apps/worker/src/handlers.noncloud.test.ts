import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { resetDeploymentCache } from "@workspace/deployment";
import { CLOUD_BILLING_RECONCILIATION_QUEUE } from "@workspace/cloud/billing-control";
import { CLOUD_TRACKING_DISPATCH_QUEUE, CLOUD_TRACKING_TASK_QUEUE } from "@workspace/lib/cloud/tracking-policy";
import { registerHandlers } from "./handlers";

const bootEnvironment = vi.hoisted(() => {
	const names = [
		"DATABASE_URL",
		"STRIPE_SECRET_KEY",
		"STRIPE_WEBHOOK_SECRET",
		"STRIPE_BILLING_PORTAL_CONFIGURATION_ID",
	] as const;
	const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
	process.env.DATABASE_URL = "postgres://smoke:smoke@127.0.0.1:5432/smoke";
	delete process.env.STRIPE_SECRET_KEY;
	delete process.env.STRIPE_WEBHOOK_SECRET;
	delete process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID;
	return { names, original };
});

const managedEnvironment = [
	"DEPLOYMENT_MODE",
	"VITE_APP_NAME",
	"VITE_APP_ICON",
	"VITE_APP_URL",
	"VITE_OPTIMIZATION_URL_TEMPLATE",
] as const;
const originalEnvironment = Object.fromEntries(managedEnvironment.map((name) => [name, process.env[name]]));

function setMode(mode: "local" | "demo" | "whitelabel"): void {
	for (const name of managedEnvironment) delete process.env[name];
	process.env.DEPLOYMENT_MODE = mode;
	if (mode === "whitelabel") {
		process.env.VITE_APP_NAME = "Customer Elmo";
		process.env.VITE_APP_ICON = "https://customer.example/icon.png";
		process.env.VITE_APP_URL = "https://customer.example";
		process.env.VITE_OPTIMIZATION_URL_TEMPLATE = "https://customer.example/optimize/{brandId}";
	}
	resetDeploymentCache();
}

describe("noncloud worker registration", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		for (const name of managedEnvironment) {
			const value = originalEnvironment[name];
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		resetDeploymentCache();
	});

	afterAll(() => {
		for (const name of bootEnvironment.names) {
			const value = bootEnvironment.original[name];
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it.each(["local", "demo", "whitelabel"] as const)(
		"does not register cloud billing or tracking handlers in %s mode",
		async (mode) => {
			setMode(mode);
			const work = vi.fn(async (_queueName: string, ..._args: unknown[]) => undefined);
			await registerHandlers({ work } as unknown as PgBoss);

			const registeredQueues = work.mock.calls.map(([queueName]) => queueName);
			expect(registeredQueues).toEqual(
				expect.arrayContaining(["process-prompt", "generate-report", "analyze-brand", "schedule-maintenance"]),
			);
			expect(registeredQueues).not.toContain(CLOUD_BILLING_RECONCILIATION_QUEUE);
			expect(registeredQueues).not.toContain(CLOUD_TRACKING_DISPATCH_QUEUE);
			expect(registeredQueues).not.toContain(CLOUD_TRACKING_TASK_QUEUE);
			expect(registeredQueues.includes("sync-auth0-memberships")).toBe(mode === "whitelabel");
		},
	);
});
