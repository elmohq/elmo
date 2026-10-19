import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { describeTargetRun } from "./index";

const target = (raw: string) => parseScrapeTargets(raw)[0];

describe("describeTargetRun", () => {
	it("localizes a scraped surface that takes a location, and sends the language where it takes one", () => {
		expect(describeTargetRun(target("google-ai-mode:dataforseo:online"), { country: "DE" })).toEqual({
			runs: true,
			country: "localized",
			language: "sent",
		});
		expect(describeTargetRun(target("chatgpt:brightdata:online"), { country: "DE" })).toEqual({
			runs: true,
			country: "localized",
			language: "prompt-text",
		});
	});

	it("runs a surface that can't be localized only for the default country", () => {
		expect(describeTargetRun(target("perplexity:brightdata:online"), { country: "US" })).toMatchObject({
			runs: true,
			country: "provider-default",
		});
		expect(describeTargetRun(target("perplexity:brightdata:online"), { country: "DE" })).toMatchObject({
			runs: false,
			country: "unsupported",
		});
	});

	it("runs a model without web search everywhere, since its answer isn't local", () => {
		expect(describeTargetRun(target("qwen:openrouter:qwen/qwen3-235b"), { country: "JP" })).toMatchObject({
			runs: true,
			country: "location-free",
		});
		expect(describeTargetRun(target("grok:openrouter:x-ai/grok-4.5:online"), { country: "JP" })).toMatchObject({
			runs: false,
		});
	});

	it("knows a provider can serve some countries and not others", () => {
		expect(describeTargetRun(target("chatgpt:olostep:online"), { country: "GB" }).country).toBe("localized");
		expect(describeTargetRun(target("chatgpt:olostep:online"), { country: "JP" }).country).toBe("unsupported");
	});
});
