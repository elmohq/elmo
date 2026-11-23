import { describe, expect, it } from "vitest";
import { getTregProviders, tregConfigurationError, tregProviderSelected } from "./treg";

describe("Treg provider selection", () => {
	it("is opt-in and parses a trimmed, unique selection", () => {
		expect(getTregProviders(undefined)).toEqual([]);
		expect(getTregProviders(" , ")).toEqual([]);
		expect(getTregProviders(" cloro, dataforseo,cloro ")).toEqual(["cloro", "dataforseo"]);
		expect(tregProviderSelected("cloro", {})).toBe(false);
		expect(tregProviderSelected("cloro", { TREG_PROVIDERS: "dataforseo,cloro" })).toBe(true);
	});

	it.each(["searchapi", "openai", "OpenAI", "treg", "cloro,unknown"])("fails closed for %s", (value) => {
		expect(() => getTregProviders(value)).toThrow(/TREG_PROVIDERS.*unsupported/i);
		expect(() => tregProviderSelected("cloro", { TREG_PROVIDERS: value })).toThrow(/TREG_PROVIDERS/);
	});

	it("requires a gateway key and explicit budget only for selected providers, with an optional org", () => {
		expect(tregConfigurationError("cloro", {})).toBeNull();
		expect(tregConfigurationError("cloro", { TREG_PROVIDERS: "dataforseo" })).toBeNull();
		expect(tregConfigurationError("cloro", { TREG_PROVIDERS: "cloro" })).toContain("TREG_API_KEY");
		expect(tregConfigurationError("cloro", { TREG_PROVIDERS: "cloro", TREG_API_KEY: "key" })).toContain(
			"TREG_MAX_COST_USD",
		);
		expect(
			tregConfigurationError("cloro", { TREG_PROVIDERS: "cloro", TREG_API_KEY: "key", TREG_MAX_COST_USD: "2.5" }),
		).toBeNull();
		expect(tregConfigurationError("cloro", { TREG_PROVIDERS: "searchapi" })).toContain("unsupported");
	});

	it.each([undefined, "", " ", "0", "-1", "Infinity", "NaN", "invalid"])("rejects missing/invalid caps: %s", (cap) => {
		expect(
			tregConfigurationError("cloro", { TREG_PROVIDERS: "cloro", TREG_API_KEY: "key", TREG_MAX_COST_USD: cap }),
		).toContain("TREG_MAX_COST_USD");
	});

	it("rejects whitespace-only credentials", () => {
		expect(
			tregConfigurationError("cloro", { TREG_PROVIDERS: "cloro", TREG_API_KEY: "  ", TREG_MAX_COST_USD: "1" }),
		).toContain("TREG_API_KEY");
	});
});
