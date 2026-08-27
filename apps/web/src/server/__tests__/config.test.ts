import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCrispWebsiteId } from "../config";

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
