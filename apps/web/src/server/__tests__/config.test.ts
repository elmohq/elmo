import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCrispWebsiteId } from "../config";

afterEach(() => vi.unstubAllEnvs());

describe("resolveCrispWebsiteId", () => {
	it.each(["cloud", "demo"] as const)("returns the configured ID in %s mode", (mode) => {
		vi.stubEnv("VITE_CRISP_WEBSITE_ID", "website-id");

		expect(resolveCrispWebsiteId(mode)).toBe("website-id");
	});

	// `local` + READ_ONLY=true reports mode "demo", so a self-hosted instance can
	// pass the mode check — the unset env var is what keeps our inbox off it.
	it.each(["local", "whitelabel"] as const)("stays off in %s mode even when configured", (mode) => {
		vi.stubEnv("VITE_CRISP_WEBSITE_ID", "website-id");

		expect(resolveCrispWebsiteId(mode)).toBeUndefined();
	});

	it("stays off when no ID is configured", () => {
		vi.stubEnv("VITE_CRISP_WEBSITE_ID", undefined);

		expect(resolveCrispWebsiteId("cloud")).toBeUndefined();
	});

	it("treats an empty ID as opting out", () => {
		vi.stubEnv("VITE_CRISP_WEBSITE_ID", "");

		expect(resolveCrispWebsiteId("cloud")).toBeUndefined();
	});
});
