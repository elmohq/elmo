import { describe, expect, it } from "vitest";
import { addedPlatforms, promptsGainingPremium } from "@/lib/run-config-changes";

const CONFIGURED = ["chatgpt", "perplexity", "gemini"];

describe("addedPlatforms", () => {
	it("reports a newly picked platform", () => {
		expect(addedPlatforms(["chatgpt"], ["chatgpt", "gemini"], CONFIGURED)).toEqual(["gemini"]);
	});

	it("reports nothing when a platform is dropped", () => {
		expect(addedPlatforms(["chatgpt", "gemini"], ["chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("reports nothing when the selection is unchanged", () => {
		expect(addedPlatforms(["chatgpt", "gemini"], ["gemini", "chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("treats null as every configured target, so narrowing adds nothing", () => {
		expect(addedPlatforms(null, ["chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("treats null as every configured target, so widening adds the rest", () => {
		expect(addedPlatforms(["chatgpt"], null, CONFIGURED)).toEqual(["perplexity", "gemini"]);
	});
});

describe("promptsGainingPremium", () => {
	const before = new Map([
		["kept", { premiumModels: ["claude"] }],
		["grew", { premiumModels: ["claude"] }],
		["shrank", { premiumModels: ["claude", "grok"] }],
	]);

	it("reports only the prompts that gained a model", () => {
		const after = [
			{ id: "kept", premiumModels: ["claude"] },
			{ id: "grew", premiumModels: ["claude", "grok"] },
			{ id: "shrank", premiumModels: ["claude"] },
		];
		expect(promptsGainingPremium(before, after)).toEqual(["grew"]);
	});

	it("ignores prompts created by the same save", () => {
		expect(promptsGainingPremium(before, [{ id: "fresh", premiumModels: ["claude"] }])).toEqual([]);
	});
});
