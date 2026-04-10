import { describe, it, expect } from "vitest";
import { getModelMeta } from ".";

describe("getModelMeta", () => {
	it("generates label and generic icon for unknown models", () => {
		expect(getModelMeta("my-custom-model")).toEqual({ label: "My Custom Model", iconId: "generic" });
	});
});
