import { describe, expect, it } from "vitest";
import {
	ALL_MODELS_VALUE,
	getAvailableModels,
	labelForModelFilter,
	parseModelFilter,
	type TrackedTarget,
	targetFilterValue,
} from "@/lib/model-filter";

const target = (model: string, premium = false): TrackedTarget => ({
	value: targetFilterValue(model, premium),
	model,
	premium,
	tier: premium ? "premium" : "scraped",
	intervalHours: premium ? 24 : 6,
	replication: 1,
});

describe("getAvailableModels", () => {
	it("returns an empty list for an empty input", () => {
		expect(getAvailableModels([])).toEqual([]);
	});

	it("returns just the target when only one is tracked (no 'all' sentinel)", () => {
		expect(getAvailableModels([target("chatgpt")])).toEqual(["chatgpt"]);
	});

	it("prepends 'all' when several are tracked", () => {
		expect(getAvailableModels([target("chatgpt"), target("claude")])).toEqual([
			ALL_MODELS_VALUE,
			"chatgpt",
			"claude",
		]);
	});

	it("preserves the caller's ordering", () => {
		expect(getAvailableModels([target("perplexity"), target("gemini")])).toEqual([
			ALL_MODELS_VALUE,
			"perplexity",
			"gemini",
		]);
	});

	it("works for arbitrary deployment-configured model ids, not just the ones Elmo knows about", () => {
		expect(getAvailableModels([target("my-custom-model"), target("another-model")])).toEqual([
			ALL_MODELS_VALUE,
			"my-custom-model",
			"another-model",
		]);
	});

	it("keeps a model's scraped and grounded variants apart", () => {
		// The bug this encoding exists for: both are `chatgpt` with web search on,
		// so a filter keyed on the model id alone listed ChatGPT twice.
		expect(getAvailableModels([target("chatgpt"), target("chatgpt", true)])).toEqual([
			ALL_MODELS_VALUE,
			"chatgpt",
			"chatgpt::premium",
		]);
	});
});

describe("parseModelFilter", () => {
	it("treats the sentinel and the empty string as no filter", () => {
		expect(parseModelFilter(ALL_MODELS_VALUE)).toBeNull();
		expect(parseModelFilter("")).toBeNull();
	});

	it("round-trips both variants", () => {
		expect(parseModelFilter(targetFilterValue("chatgpt", false))).toEqual({ model: "chatgpt", premium: false });
		expect(parseModelFilter(targetFilterValue("chatgpt", true))).toEqual({ model: "chatgpt", premium: true });
	});
});

describe("labelForModelFilter", () => {
	it("names the grounded variant the way it is sold, not as a second ChatGPT", () => {
		expect(labelForModelFilter("chatgpt")).toBe("ChatGPT");
		expect(labelForModelFilter("chatgpt::premium")).toBe("GPT-5 Search");
		expect(labelForModelFilter("grok::premium")).toBe("Grok (web)");
	});

	it("labels the no-filter sentinel", () => {
		expect(labelForModelFilter(ALL_MODELS_VALUE)).toBe("All models");
	});
});
