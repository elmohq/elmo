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

	// A local deployment with READ_ONLY set resolves to mode "demo", so gating on
	// the resolved mode would put our support inbox on a self-hosted instance.
	it("returns nothing for a read-only local deployment", () => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		vi.stubEnv("READ_ONLY", "true");

		expect(resolveCrispWebsiteId()).toBeUndefined();
	});
});
