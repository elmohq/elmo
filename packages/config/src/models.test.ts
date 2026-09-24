import { describe, expect, it } from "vitest";
import { AD_CAPABLE_MODELS, getModelMeta, isAdCapableModel, KNOWN_MODELS } from "./models";

describe("getModelMeta", () => {
	it("generates label and generic icon for unknown models", () => {
		expect(getModelMeta("my-custom-model")).toEqual({ label: "My Custom Model", iconId: "generic" });
	});
});

describe("isAdCapableModel", () => {
	it("rejects models whose runs can never carry an ad", () => {
		expect(isAdCapableModel("claude")).toBe(false);
		expect(isAdCapableModel("my-custom-model")).toBe(false);
	});

	// A typo here would silently empty the Ads page's platform filter and its
	// denominator rather than fail, since both resolve through KNOWN_MODELS.
	it("only names models the rest of the app can label", () => {
		for (const model of AD_CAPABLE_MODELS) {
			expect(KNOWN_MODELS).toHaveProperty(model);
			expect(isAdCapableModel(model)).toBe(true);
		}
	});
});
