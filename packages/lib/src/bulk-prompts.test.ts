import { describe, expect, it } from "vitest";
import { describeSkipped, parseBulkPrompts } from "./bulk-prompts";
import { MAX_PROMPTS } from "./constants";

describe("bulk-prompts", () => {
	describe("parseBulkPrompts", () => {
		it("should split on newlines and trim each line", () => {
			const { added } = parseBulkPrompts("  best running shoes\nbest trail shoes  ");
			expect(added).toEqual(["best running shoes", "best trail shoes"]);
		});

		it("should handle windows line endings", () => {
			const { added } = parseBulkPrompts("one\r\ntwo\r\nthree");
			expect(added).toEqual(["one", "two", "three"]);
		});

		it("should skip blank lines and say how many", () => {
			const { added, skipped } = parseBulkPrompts("one\n\n   \ntwo\n");
			expect(added).toEqual(["one", "two"]);
			expect(skipped.blank).toBe(3);
			expect(describeSkipped(skipped)).toBe("Skipped 3 blank lines.");
		});

		it("should drop lines already in the list", () => {
			const { added, skipped } = parseBulkPrompts("one\ntwo", { existing: ["one"] });
			expect(added).toEqual(["two"]);
			expect(skipped.duplicateOfExisting).toEqual(["one"]);
		});

		it("should drop lines repeated inside the paste", () => {
			const { added, skipped } = parseBulkPrompts("one\none\ntwo");
			expect(added).toEqual(["one", "two"]);
			expect(skipped.duplicateInPaste).toEqual(["one"]);
		});

		it("should treat case and internal spacing as the same prompt", () => {
			const { added, skipped } = parseBulkPrompts("Best  Running   Shoes", {
				existing: ["best running shoes"],
			});
			expect(added).toEqual([]);
			expect(skipped.duplicateOfExisting).toEqual(["Best  Running   Shoes"]);
		});

		it("should keep the pasted casing of the line it accepts", () => {
			const { added } = parseBulkPrompts("Best Running Shoes");
			expect(added).toEqual(["Best Running Shoes"]);
		});

		it("should measure capacity against the whole list and not the paste", () => {
			const { added, skipped } = parseBulkPrompts("c\nd\ne", {
				existing: ["a", "b"],
				limit: 4,
			});
			expect(added).toEqual(["c", "d"]);
			expect(skipped.overCapacity).toEqual(["e"]);
		});

		it("should add nothing when the list is already full", () => {
			const { added, skipped } = parseBulkPrompts("c", { existing: ["a", "b"], limit: 2 });
			expect(added).toEqual([]);
			expect(skipped.overCapacity).toEqual(["c"]);
		});

		it("should not blame the limit for a line a duplicate rule already dropped", () => {
			const { added, skipped } = parseBulkPrompts("a\nb", { existing: ["a"], limit: 1 });
			expect(added).toEqual([]);
			expect(skipped.duplicateOfExisting).toEqual(["a"]);
			expect(skipped.overCapacity).toEqual(["b"]);
		});

		it("should default the limit to MAX_PROMPTS", () => {
			const text = Array.from({ length: MAX_PROMPTS + 5 }, (_, i) => `prompt ${i}`).join("\n");
			const { added, skipped } = parseBulkPrompts(text);
			expect(added).toHaveLength(MAX_PROMPTS);
			expect(skipped.overCapacity).toHaveLength(5);
		});

		it("should return nothing for empty input", () => {
			const { added, skipped } = parseBulkPrompts("");
			expect(added).toEqual([]);
			expect(skipped.blank).toBe(1);
		});
	});

	describe("describeSkipped", () => {
		it("should say nothing when nothing was dropped", () => {
			expect(describeSkipped({ blank: 0, duplicateOfExisting: [], duplicateInPaste: [], overCapacity: [] })).toBeNull();
		});

		it("should report blank lines", () => {
			expect(describeSkipped({ blank: 4, duplicateOfExisting: [], duplicateInPaste: [], overCapacity: [] })).toBe(
				"Skipped 4 blank lines.",
			);
		});

		it("should use the singular for one blank line", () => {
			expect(describeSkipped({ blank: 1, duplicateOfExisting: [], duplicateInPaste: [], overCapacity: [] })).toBe(
				"Skipped 1 blank line.",
			);
		});

		it("should count both kinds of duplicate together", () => {
			expect(describeSkipped({ blank: 0, duplicateOfExisting: ["a"], duplicateInPaste: ["b"], overCapacity: [] })).toBe(
				"Skipped 2 duplicates.",
			);
		});

		it("should use the singular for one duplicate", () => {
			expect(describeSkipped({ blank: 0, duplicateOfExisting: ["a"], duplicateInPaste: [], overCapacity: [] })).toBe(
				"Skipped 1 duplicate.",
			);
		});

		it("should name duplicates and blank lines together", () => {
			expect(describeSkipped({ blank: 2, duplicateOfExisting: ["a"], duplicateInPaste: [], overCapacity: [] })).toBe(
				"Skipped 1 duplicate and 2 blank lines.",
			);
		});

		it("should leave over-capacity lines out, since they block the paste instead", () => {
			expect(
				describeSkipped({ blank: 0, duplicateOfExisting: [], duplicateInPaste: [], overCapacity: ["b", "c"] }),
			).toBeNull();
		});
	});
});
