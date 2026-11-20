import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeProvider, getProvider, resolveProviderAccess, validateScrapeTargets } from "./index";

vi.mock("../secrets", () => ({ getCredential: (name: string) => process.env[name] }));

afterEach(() => vi.unstubAllEnvs());

describe("treg configuration", () => {
	it("requires both treg credentials without requiring a direct Cloro key", () => {
		const targets = parseScrapeTargets("bing-ai-mode:treg:online");
		vi.stubEnv("TREG_API_KEY", "");
		vi.stubEnv("TREG_ORG", "");
		expect(() => validateScrapeTargets(targets, getProvider)).toThrow(/TREG_API_KEY.*TREG_ORG/);
		vi.stubEnv("TREG_API_KEY", "test-treg-key");
		expect(() => validateScrapeTargets(targets, getProvider)).toThrow("TREG_ORG");
		vi.stubEnv("TREG_ORG", "example-team");
		vi.stubEnv("CLORO_API_KEY", "");
		expect(() => validateScrapeTargets(targets, getProvider)).not.toThrow();
		expect(resolveProviderAccess(targets[0])).toBe("scraped");
		expect(describeProvider("treg").docsUrl).toMatch(/#treg$/);
	});

	it("coexists with the configured native providers without changing their requirements", () => {
		vi.stubEnv("TREG_API_KEY", "test-treg-key");
		vi.stubEnv("TREG_ORG", "example-team");
		vi.stubEnv("DATAFORSEO_LOGIN", "example-login");
		vi.stubEnv("DATAFORSEO_PASSWORD", "example-password");
		vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
		const targets = parseScrapeTargets(
			"chatgpt:dataforseo:online,google-ai-mode:dataforseo:online,google-ai-overview:dataforseo:online,bing-ai-mode:treg:online,claude:openrouter:example/model",
		);
		expect(() => validateScrapeTargets(targets, getProvider)).not.toThrow();
		expect(targets.map((target) => getProvider(target.provider).id)).toEqual([
			"dataforseo",
			"dataforseo",
			"dataforseo",
			"treg",
			"openrouter",
		]);
		vi.stubEnv("DATAFORSEO_PASSWORD", "");
		expect(() => validateScrapeTargets(targets, getProvider)).toThrow("DATAFORSEO_PASSWORD");
	});
});
