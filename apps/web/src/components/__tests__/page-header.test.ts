import { describe, it, expect } from "vitest";
import { getAvailableModelsForBrand } from "@/components/filter-bar";

describe("getAvailableModelsForBrand", () => {
	it("falls back to every known model when enabledModels is null", () => {
		expect(getAvailableModelsForBrand(null)).toEqual([
			"all",
			"chatgpt",
			"claude",
			"google-ai-mode",
		]);
	});

	it("falls back to every known model when enabledModels is undefined", () => {
		expect(getAvailableModelsForBrand(undefined)).toEqual([
			"all",
			"chatgpt",
			"claude",
			"google-ai-mode",
		]);
	});

	it("treats an empty enabledModels array as unconfigured", () => {
		expect(getAvailableModelsForBrand([])).toEqual([
			"all",
			"chatgpt",
			"claude",
			"google-ai-mode",
		]);
	});

	it("includes 'all' plus configured models when 2+ are enabled", () => {
		expect(getAvailableModelsForBrand(["chatgpt", "claude"])).toEqual([
			"all",
			"chatgpt",
			"claude",
		]);
	});

	it("drops 'all' when only one model is configured", () => {
		expect(getAvailableModelsForBrand(["chatgpt"])).toEqual(["chatgpt"]);
	});

	it("ignores unknown model ids so stale db rows don't render mystery tabs", () => {
		expect(getAvailableModelsForBrand(["chatgpt", "gpt-5-turbo-ultra"])).toEqual([
			"chatgpt",
		]);
	});
});
