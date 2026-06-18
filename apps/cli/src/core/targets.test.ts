import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyResearchTarget, resolveTargets } from "./targets";

const ENV_KEYS = ["SCRAPE_TARGETS", "BRIGHTDATA_API_TOKEN", "ONBOARDING_LLM_TARGET"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
	for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
	for (const k of ENV_KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe("resolveTargets", () => {
	it("throws when no -m and no SCRAPE_TARGETS", () => {
		expect(() => resolveTargets(undefined)).toThrow(/No model targets/);
	});

	it("parses, validates, and dedupes repeatable -m values", () => {
		process.env.BRIGHTDATA_API_TOKEN = "test-token";
		const resolved = resolveTargets([
			"chatgpt:brightdata:online",
			"chatgpt:brightdata:online",
			"google-ai-mode:brightdata:online",
		]);
		expect(resolved.map((r) => r.label)).toEqual(["chatgpt:brightdata:online", "google-ai-mode:brightdata:online"]);
		expect(resolved[0].config.model).toBe("chatgpt");
		expect(resolved[0].config.webSearch).toBe(true);
	});

	it("falls back to SCRAPE_TARGETS when no -m is given", () => {
		process.env.BRIGHTDATA_API_TOKEN = "test-token";
		process.env.SCRAPE_TARGETS = "chatgpt:brightdata:online";
		expect(resolveTargets(undefined).map((r) => r.label)).toEqual(["chatgpt:brightdata:online"]);
	});

	it("errors clearly when the provider is not configured", () => {
		expect(() => resolveTargets(["chatgpt:brightdata:online"])).toThrow(/not configured/);
	});
});

describe("applyResearchTarget", () => {
	it("sets ONBOARDING_LLM_TARGET when a model is given", () => {
		applyResearchTarget("claude:anthropic-api");
		expect(process.env.ONBOARDING_LLM_TARGET).toBe("claude:anthropic-api");
	});
	it("leaves it unset for empty input", () => {
		applyResearchTarget(undefined);
		expect(process.env.ONBOARDING_LLM_TARGET).toBeUndefined();
	});
});
