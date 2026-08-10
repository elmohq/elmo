/**
 * Keeps the three lists that describe "what Elmo can track" honest about each
 * other: the models we give display metadata to, the provider/model combos the
 * scheduled status workflow exercises, and the providers we actually ship.
 *
 * These drifted once already — Qwen shipped on the cloud platform menu with no
 * status target, so nothing was watching whether it still worked, and the LLM
 * settings page could not tell an operator which provider it needs.
 */

import { KNOWN_MODELS } from "@workspace/config/models";
import { PREMIUM_MODELS } from "@workspace/config/plans";
import { parseScrapeTargets, providersByModel, STATUS_TARGETS } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { describeProvider, getAllProviders, isGroundedApiTarget, resolveProviderAccess } from "./index";

describe("provider coverage", () => {
	const byModel = providersByModel();

	it("monitors every model we ship display metadata for", () => {
		const unmonitored = Object.keys(KNOWN_MODELS).filter((model) => !byModel.has(model));
		expect(unmonitored).toEqual([]);
	});

	it("only names providers we ship, so the setup links can't dangle", () => {
		const shipped = new Set(getAllProviders().map((provider) => provider.id));
		for (const [model, providers] of byModel) {
			for (const provider of providers) {
				expect(shipped, `${model} names unknown provider "${provider}"`).toContain(provider);
			}
		}
	});

	it("can describe every provider a model needs, with a setup link", () => {
		for (const providers of byModel.values()) {
			for (const provider of providers) {
				const described = describeProvider(provider);
				expect(described).not.toBeNull();
				expect(described?.name).toBeTruthy();
				expect(described?.docsUrl).toMatch(/^https:\/\/docs\.elmohq\.com\/docs\/user-guide\/providers/);
			}
		}
	});

	it("refuses to describe a provider we don't ship", () => {
		// Naming one is a configuration error, and SCRAPE_TARGETS validation already
		// rejects it at boot, so guessing a description here would only hide it.
		expect(() => describeProvider("some-provider-we-dropped")).toThrow(/unknown provider/i);
	});
});

/**
 * The settings page labels a target "Scraped" or "API" from this, and the two
 * describe genuinely different data — a scraped answer carries the surface a
 * visitor sees, an API answer is the model talking to us. A label that
 * disagrees with the route the provider takes is worse than no label.
 */
describe("how a target is reached", () => {
	const dfs = (model: string, version?: string) =>
		resolveProviderAccess({ provider: "dataforseo", model, version, webSearch: false });

	it("reads Google's surfaces by scraping them, whatever the target says", () => {
		expect(dfs("google-ai-overview")).toBe("scraped");
		expect(dfs("google-ai-mode", "some-version")).toBe("scraped");
	});

	it("calls the model directly for a surface DataForSEO cannot scrape", () => {
		// Perplexity has no LLM Scraper route, so an unpinned target still asks
		// the model rather than reading perplexity.ai.
		expect(dfs("perplexity")).toBe("api");
	});

	it("switches to the API once a target pins a version, which only the API honors", () => {
		expect(dfs("chatgpt")).toBe("scraped");
		expect(dfs("chatgpt", "gpt-5")).toBe("api");
	});

	it("takes a single-route provider at its word", () => {
		expect(resolveProviderAccess({ provider: "brightdata", model: "chatgpt", webSearch: false })).toBe("scraped");
		expect(resolveProviderAccess({ provider: "anthropic-api", model: "claude", webSearch: false })).toBe("api");
	});
});

describe("the premium tier", () => {
	it("only sells models we have a grounded target for and watch", () => {
		// A premium slot buys a grounded call. Selling one for a model with no
		// grounded target in the status workflow would take money for tracking
		// nothing is verifying still works.
		const grounded = new Set(
			STATUS_TARGETS.map((target) => parseScrapeTargets(target)[0])
				.filter(isGroundedApiTarget)
				.map((config) => config.model),
		);
		for (const model of PREMIUM_MODELS) {
			expect(grounded, model).toContain(model);
		}
	});
});
