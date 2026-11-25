import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeProvider, getProvider, resolveProviderAccess, validateScrapeTargets } from "./index";

vi.mock("../secrets", () => ({ getCredential: (name: string) => process.env[name] }));

beforeEach(() => {
	for (const name of [
		"TREG_PROVIDERS",
		"TREG_API_KEY",
		"TREG_ORG",
		"TREG_MAX_COST_USD",
		"CLORO_API_KEY",
		"DATAFORSEO_LOGIN",
		"DATAFORSEO_PASSWORD",
	]) {
		vi.stubEnv(name, undefined);
	}
});
afterEach(() => vi.unstubAllEnvs());

describe("shared treg gateway configuration", () => {
	it("requires the selected gateway key and explicit cost guard without falling back to native credentials", () => {
		const targets = parseScrapeTargets("bing-ai-mode:cloro:online");
		vi.stubEnv("TREG_PROVIDERS", "cloro");
		vi.stubEnv("CLORO_API_KEY", "unused-direct-key");
		expect(getProvider("cloro").isConfigured()).toBe(false);
		expect(() => validateScrapeTargets(targets, getProvider)).toThrow("TREG_API_KEY");
		vi.stubEnv("TREG_API_KEY", "test-treg-key");
		expect(() => validateScrapeTargets(targets, getProvider)).toThrow("TREG_MAX_COST_USD");
		vi.stubEnv("TREG_MAX_COST_USD", "0.25");
		vi.stubEnv("CLORO_API_KEY", undefined);
		expect(() => validateScrapeTargets(targets, getProvider)).not.toThrow();
		expect(getProvider("cloro").isConfigured()).toBe(true);
		expect(getProvider("cloro").id).toBe("cloro");
		expect(resolveProviderAccess(targets[0])).toBe("scraped");
		expect(describeProvider("cloro").docsUrl).toMatch(/#treg$/);
	});

	it("uses one connection for multiple native integrations while preserving other direct requirements", () => {
		vi.stubEnv("TREG_PROVIDERS", "cloro,dataforseo");
		vi.stubEnv("TREG_API_KEY", "test-treg-key");
		vi.stubEnv("TREG_MAX_COST_USD", "0.05");
		vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
		const targets = parseScrapeTargets(
			"chatgpt:dataforseo:online,google-ai-mode:dataforseo:online,google-ai-overview:dataforseo:online,gemini:cloro:online,bing-ai-mode:cloro:online,claude:openrouter:example/model",
		);
		expect(() => validateScrapeTargets(targets, getProvider)).not.toThrow();
		expect(targets.map((target) => getProvider(target.provider).id)).toEqual([
			"dataforseo",
			"dataforseo",
			"dataforseo",
			"cloro",
			"cloro",
			"openrouter",
		]);
		vi.stubEnv("OPENROUTER_API_KEY", undefined);
		expect(() => validateScrapeTargets(targets, getProvider)).toThrow("OPENROUTER_API_KEY");
	});

	it("does not enable or reroute integrations merely because a treg key is present", () => {
		vi.stubEnv("TREG_API_KEY", "unused-treg-key");
		vi.stubEnv("CLORO_API_KEY", "test-direct-key");
		expect(getProvider("cloro").isConfigured()).toBe(true);
		expect(describeProvider("cloro").docsUrl).toMatch(/#cloro$/);
		expect(getProvider("dataforseo").isConfigured()).toBe(false);
		expect(() => validateScrapeTargets(parseScrapeTargets("chatgpt:dataforseo:online"), getProvider)).toThrow(
			"DATAFORSEO_LOGIN",
		);
	});

	it("rejects unsupported gateway integrations instead of silently choosing direct billing", () => {
		vi.stubEnv("TREG_PROVIDERS", "searchapi");
		vi.stubEnv("SEARCHAPI_API_KEY", "unused-direct-key");
		expect(() => getProvider("searchapi")).toThrow(/TREG_PROVIDERS|unsupported/i);
	});
});
