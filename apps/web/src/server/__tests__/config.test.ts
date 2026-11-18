import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCrispWebsiteId, resolvePosthogKey } from "../config";

afterEach(() => vi.unstubAllEnvs());

describe("resolveCrispWebsiteId", () => {
	it.each(["cloud", "demo"])("returns a website ID in %s mode", (mode) => {
		vi.stubEnv("DEPLOYMENT_MODE", mode);

		expect(resolveCrispWebsiteId()).toBeTruthy();
	});

	it.each(["local", "whitelabel"])("returns nothing in %s mode", (mode) => {
		vi.stubEnv("DEPLOYMENT_MODE", mode);

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});

	// READ_ONLY makes a local deployment resolve to mode "demo".
	it("returns nothing for a read-only local deployment", () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		vi.stubEnv("READ_ONLY", "true");

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});
});

describe("resolvePosthogKey", () => {
	beforeEach(() => {
		vi.stubEnv("DISABLE_TELEMETRY", undefined);
		vi.stubEnv("VITE_POSTHOG_KEY", undefined);
	});

	it.each(["local", "demo"] as const)("omits the built-in browser key in %s mode", (mode) => {
		expect(resolvePosthogKey(mode)).toBeUndefined();
	});

	it.each(["cloud", "whitelabel"] as const)("keeps the built-in browser key in %s mode", (mode) => {
		expect(resolvePosthogKey(mode)).toBeTruthy();
	});

	it.each(["local", "demo"] as const)("honors a configured browser key in %s mode", (mode) => {
		vi.stubEnv("VITE_POSTHOG_KEY", "example-project-key");

		expect(resolvePosthogKey(mode)).toBe("example-project-key");
	});

	it("omits the browser key when telemetry is disabled, even with a configured key", () => {
		vi.stubEnv("DISABLE_TELEMETRY", "1");
		vi.stubEnv("VITE_POSTHOG_KEY", "example-project-key");

		expect(resolvePosthogKey("cloud")).toBeUndefined();
	});
});
