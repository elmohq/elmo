import { describe, expect, it } from "vitest";
import {
	describeMissingPrompt,
	describeSkipped,
	IMPORT_SAMPLE_LIMIT,
	parseBulkPrompts,
	planPromptImport,
	type SkippedLines,
} from "./bulk-prompts";
import { MAX_PROMPTS } from "./constants";

const nothingSkipped = (): SkippedLines => ({
	blank: 0,
	duplicateOfExisting: [],
	duplicateInPaste: [],
	overCapacity: [],
	missingPrompt: [],
});

/** Prompt values in accepted order, for tests that don't care about tags. */
const values = (text: string, options?: Parameters<typeof parseBulkPrompts>[1]) =>
	parseBulkPrompts(text, options).added.map((record) => record.value);

describe("bulk-prompts", () => {
	describe("parseBulkPrompts", () => {
		it("should split on newlines and trim each line", () => {
			expect(values("  best running shoes\nbest trail shoes  ")).toEqual(["best running shoes", "best trail shoes"]);
		});

		it("should handle windows line endings", () => {
			expect(values("one\r\ntwo\r\nthree")).toEqual(["one", "two", "three"]);
		});

		it("should skip blank lines and say how many", () => {
			const { added, skipped } = parseBulkPrompts("one\n\n   \ntwo\n");
			expect(added.map((r) => r.value)).toEqual(["one", "two"]);
			expect(skipped.blank).toBe(3);
			expect(describeSkipped(skipped)).toBe("Skipped 3 blank lines.");
		});

		it("should drop lines already in the list", () => {
			const { added, skipped } = parseBulkPrompts("one\ntwo", { existing: ["one"] });
			expect(added.map((r) => r.value)).toEqual(["two"]);
			expect(skipped.duplicateOfExisting).toEqual(["one"]);
		});

		it("should drop lines repeated inside the paste", () => {
			const { added, skipped } = parseBulkPrompts("one\none\ntwo");
			expect(added.map((r) => r.value)).toEqual(["one", "two"]);
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
			expect(values("Best Running Shoes")).toEqual(["Best Running Shoes"]);
		});

		it("should measure capacity against the whole list and not the paste", () => {
			const { added, skipped } = parseBulkPrompts("c\nd\ne", {
				existing: ["a", "b"],
				limit: 4,
			});
			expect(added.map((r) => r.value)).toEqual(["c", "d"]);
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

	describe("parseBulkPrompts with semicolon-separated tags", () => {
		it("F04-UT-001: attaches every field after the first as a tag of that prompt", () => {
			const { added } = parseBulkPrompts("Which legal insurance is best?;insurance;comparison");
			expect(added).toEqual([{ value: "Which legal insurance is best?", tags: ["insurance", "comparison"] }]);
		});

		it("F04-UT-002: leaves a line without semicolons as a prompt with no tags", () => {
			const { added } = parseBulkPrompts("A legacy prompt without tags");
			expect(added).toEqual([{ value: "A legacy prompt without tags", tags: [] }]);
		});

		it("F04-UT-003: trims the prompt and tag fields but keeps the prompt's internal spacing", () => {
			const { added } = parseBulkPrompts("  best  running   shoes ; footwear ;  running  ");
			expect(added).toEqual([{ value: "best  running   shoes", tags: ["footwear", "running"] }]);
		});

		it("F04-UT-004: lowercases tags, drops empty fields and repeats, and keeps first-occurrence order", () => {
			const { added } = parseBulkPrompts("Example prompt; Rechtsschutz ;VERGLEICH;vergleich;; Familie ;");
			expect(added).toEqual([{ value: "Example prompt", tags: ["rechtsschutz", "vergleich", "familie"] }]);
		});

		it("F04-UT-005: handles LF, CRLF, blank lines and Unicode in prompts and tags", () => {
			const { added, skipped } = parseBulkPrompts(
				"Welche Rechtsschutzversicherung ist am besten?;Versicherung;Vergleich\r\n\r\n最好的保险是什么？;保险\n\nÇa marche ?;é té",
			);
			expect(added).toEqual([
				{ value: "Welche Rechtsschutzversicherung ist am besten?", tags: ["versicherung", "vergleich"] },
				{ value: "最好的保险是什么？", tags: ["保险"] },
				{ value: "Ça marche ?", tags: ["é té"] },
			]);
			expect(skipped.blank).toBe(2);
		});

		it("F04-UT-006: reports a line whose first field is empty by its 1-based physical line number", () => {
			const { added, skipped } = parseBulkPrompts("valid prompt;tag\n;orphan tag\n\n  ;tag1;tag2\nanother prompt");
			expect(skipped.missingPrompt).toEqual([2, 4]);
			expect(skipped.blank).toBe(1);
			// The tags never attach to a neighbouring prompt.
			expect(added).toEqual([
				{ value: "valid prompt", tags: ["tag"] },
				{ value: "another prompt", tags: [] },
			]);
			// A lone semicolon is a missing prompt, not a blank line.
			expect(parseBulkPrompts(";").skipped).toMatchObject({ blank: 0, missingPrompt: [1] });
		});

		it("F04-UT-007: accepts trailing, repeated and whitespace-only tag fields as a prompt with no tags", () => {
			for (const line of ["prompt;", "prompt;;;", "prompt; ;"]) {
				expect(parseBulkPrompts(line).added).toEqual([{ value: "prompt", tags: [] }]);
			}
		});

		it("F04-UT-008: treats the semicolon as reserved syntax with no quoting or escaping", () => {
			expect(parseBulkPrompts("a;b;c").added).toEqual([{ value: "a", tags: ["b", "c"] }]);
			expect(parseBulkPrompts('"a;b";c').added).toEqual([{ value: '"a', tags: ['b"', "c"] }]);
			expect(parseBulkPrompts("a\\;b;c").added).toEqual([{ value: "a\\", tags: ["b", "c"] }]);
			expect(parseBulkPrompts("a;;b").added).toEqual([{ value: "a", tags: ["b"] }]);
		});

		it("F04-UT-009: skips a record matching an existing prompt by text alone and does not merge its tags", () => {
			const { added, skipped } = parseBulkPrompts("Best Running Shoes;new tag;another", {
				existing: ["best running shoes"],
			});
			expect(added).toEqual([]);
			expect(skipped.duplicateOfExisting).toEqual(["Best Running Shoes"]);
		});

		it("F04-UT-010: dedupes within the paste by text alone, keeping the first record's tags", () => {
			const { added, skipped } = parseBulkPrompts("one;first\none;second\ntwo");
			expect(added).toEqual([
				{ value: "one", tags: ["first"] },
				{ value: "two", tags: [] },
			]);
			expect(skipped.duplicateInPaste).toEqual(["one"]);
		});

		it("F04-UT-011: keeps the case and whitespace duplicate rules for tagged records", () => {
			const { added, skipped } = parseBulkPrompts("Best  Running   Shoes;x\nbest running shoes;y", {
				existing: [],
			});
			expect(added).toEqual([{ value: "Best  Running   Shoes", tags: ["x"] }]);
			expect(skipped.duplicateInPaste).toEqual(["best running shoes"]);
		});

		it("F04-UT-012: counts prompt records against capacity, never blank, duplicate or tag fields", () => {
			const { added, skipped } = parseBulkPrompts("\nc;t1;t2;t3;t4\nc;again\nd;t5;t6\n", {
				existing: ["a", "b"],
				limit: 4,
			});
			expect(added).toEqual([
				{ value: "c", tags: ["t1", "t2", "t3", "t4"] },
				{ value: "d", tags: ["t5", "t6"] },
			]);
			expect(skipped.overCapacity).toEqual([]);
			expect(skipped.blank).toBe(2);
			expect(skipped.duplicateInPaste).toEqual(["c"]);
		});

		it("F04-UT-013: reports only the otherwise-acceptable prompts that do not fit", () => {
			const { added, skipped } = parseBulkPrompts("c;t\nd;t\nc;dup\ne;t\n\nf", {
				existing: ["a", "b"],
				limit: 4,
			});
			expect(added.map((r) => r.value)).toEqual(["c", "d"]);
			expect(skipped.overCapacity).toEqual(["e", "f"]);
		});

		it("F04-UT-014: keeps input order and never attaches a line's tags to a neighbour", () => {
			const { added } = parseBulkPrompts("first;a\nsecond\nthird;b;c\nfourth");
			expect(added).toEqual([
				{ value: "first", tags: ["a"] },
				{ value: "second", tags: [] },
				{ value: "third", tags: ["b", "c"] },
				{ value: "fourth", tags: [] },
			]);
		});

		it("F04-UT-015: passes branded and unbranded through as ordinary user tags", () => {
			const { added } = parseBulkPrompts("compare nike and adidas;Branded;UNBRANDED;shoes");
			expect(added).toEqual([{ value: "compare nike and adidas", tags: ["branded", "unbranded", "shoes"] }]);
			expect(added[0]).not.toHaveProperty("systemTags");
		});
	});

	describe("duplicates of a prompt that did not fit", () => {
		it("F04-CORR-UT-001: a repeat of an over-capacity prompt is a duplicate, not a second excess prompt", () => {
			const existing = Array.from({ length: 99 }, (_, i) => `existing ${i}`);
			const { added, skipped } = parseBulkPrompts("Prompt A;one\nPrompt B;two\nprompt   b;three", {
				existing,
				limit: 100,
			});
			expect(added).toEqual([{ value: "Prompt A", tags: ["one"] }]);
			expect(skipped.overCapacity).toEqual(["Prompt B"]);
			expect(skipped.duplicateInPaste).toEqual(["prompt   b"]);
		});

		it("F04-CORR-UT-002: with no room left, two equivalent new prompts are one excess and one duplicate", () => {
			const { added, skipped } = parseBulkPrompts("New prompt;x\nNEW PROMPT;y", { existing: ["a", "b"], limit: 2 });
			expect(added).toEqual([]);
			expect(skipped.overCapacity).toEqual(["New prompt"]);
			expect(skipped.duplicateInPaste).toEqual(["NEW PROMPT"]);
		});

		it("F04-CORR-UT-003: N repeats beyond capacity are one excess and N-1 duplicates, first occurrence wins", () => {
			const { added, skipped } = parseBulkPrompts("Over;t1\nover;t2\n Over ;t3\nOVER;t4", {
				existing: ["full"],
				limit: 1,
			});
			expect(added).toEqual([]);
			expect(skipped.overCapacity).toEqual(["Over"]);
			expect(skipped.duplicateInPaste).toEqual(["over", "Over", "OVER"]);
			expect(describeSkipped(skipped)).toBe("Skipped 3 duplicates.");
		});

		it("F04-CORR-UT-004: the other classifications keep their behavior around the capacity edge", () => {
			const { added, skipped } = parseBulkPrompts("Existing One;t\n\nfits;a\nFITS;b\n;orphan\nover;c\nOVER;d", {
				existing: ["existing one"],
				limit: 2,
			});
			expect(added).toEqual([{ value: "fits", tags: ["a"] }]);
			expect(skipped.duplicateOfExisting).toEqual(["Existing One"]);
			expect(skipped.blank).toBe(1);
			expect(skipped.missingPrompt).toEqual([5]);
			expect(skipped.duplicateInPaste).toEqual(["FITS", "OVER"]);
			expect(skipped.overCapacity).toEqual(["over"]);
		});
	});

	describe("describeSkipped", () => {
		it("should say nothing when nothing was dropped", () => {
			expect(describeSkipped(nothingSkipped())).toBeNull();
		});

		it("should report blank lines", () => {
			expect(describeSkipped({ ...nothingSkipped(), blank: 4 })).toBe("Skipped 4 blank lines.");
		});

		it("should use the singular for one blank line", () => {
			expect(describeSkipped({ ...nothingSkipped(), blank: 1 })).toBe("Skipped 1 blank line.");
		});

		it("should count both kinds of duplicate together", () => {
			expect(describeSkipped({ ...nothingSkipped(), duplicateOfExisting: ["a"], duplicateInPaste: ["b"] })).toBe(
				"Skipped 2 duplicates.",
			);
		});

		it("should use the singular for one duplicate", () => {
			expect(describeSkipped({ ...nothingSkipped(), duplicateOfExisting: ["a"] })).toBe("Skipped 1 duplicate.");
		});

		it("should name duplicates and blank lines together", () => {
			expect(describeSkipped({ ...nothingSkipped(), blank: 2, duplicateOfExisting: ["a"] })).toBe(
				"Skipped 1 duplicate and 2 blank lines.",
			);
		});

		it("should leave over-capacity lines out, since they block the paste instead", () => {
			expect(describeSkipped({ ...nothingSkipped(), overCapacity: ["b", "c"] })).toBeNull();
		});

		it("F04-UT-016: should leave missing-prompt lines out, since they block the paste instead", () => {
			expect(describeSkipped({ ...nothingSkipped(), missingPrompt: [2] })).toBeNull();
		});
	});

	describe("describeMissingPrompt", () => {
		it("F04-UT-016: says nothing when every line has a prompt", () => {
			expect(describeMissingPrompt([])).toBeNull();
		});

		it("F04-UT-016: names a single line", () => {
			expect(describeMissingPrompt([3])).toBe(
				"Line 3 has no prompt text before its first semicolon. Fix or remove it to continue.",
			);
		});

		it("F04-UT-016: lists several lines", () => {
			expect(describeMissingPrompt([1, 4])).toBe(
				"Lines 1 and 4 have no prompt text before their first semicolon. Fix or remove them to continue.",
			);
			expect(describeMissingPrompt([1, 4, 9])).toBe(
				"Lines 1, 4 and 9 have no prompt text before their first semicolon. Fix or remove them to continue.",
			);
		});
	});
});

describe("planPromptImport", () => {
	it("counts every line and keeps at most the sample limit of examples per reason", () => {
		const existing = new Set(["existing prompt"]);
		const lines = [
			...Array.from({ length: 150 }, () => "Existing  Prompt"),
			...Array.from({ length: 5 }, () => ";only tags"),
			"",
			"new one;tag",
			"new one;other",
			...Array.from({ length: 3 }, (_, i) => `over ${i}`),
		];
		const { records, summary } = planPromptImport(lines.join("\n"), {
			existingKeys: existing,
			room: 1,
			sampleLimit: 4,
		});
		expect(records).toEqual([{ value: "new one", tags: ["tag"] }]);
		expect(summary).toMatchObject({
			lines: lines.length,
			added: 1,
			blank: 1,
			duplicateOfExisting: 150,
			duplicateInPaste: 1,
			overCapacity: 3,
			missingPrompt: 5,
		});
		expect(summary.samples.duplicateOfExisting).toHaveLength(4);
		expect(summary.samples.missingPrompt).toEqual([151, 152, 153, 154]);
		expect(summary.samples.overCapacity).toEqual(["over 0", "over 1", "over 2"]);
	});

	it("defaults the sample limit to IMPORT_SAMPLE_LIMIT", () => {
		const text = Array.from({ length: IMPORT_SAMPLE_LIMIT + 20 }, () => "same").join("\n");
		const { summary } = planPromptImport(text, { existingKeys: new Set(), room: 10 });
		expect(summary.added).toBe(1);
		expect(summary.duplicateInPaste).toBe(IMPORT_SAMPLE_LIMIT + 19);
		expect(summary.samples.duplicateInPaste).toHaveLength(IMPORT_SAMPLE_LIMIT);
	});

	it("handles ten thousand lines in well under a second", () => {
		const text = Array.from({ length: 10_000 }, (_, i) => `Prompt number ${i};tag${i % 7};Group ${i % 3}`).join("\r\n");
		const started = performance.now();
		const { records, summary } = planPromptImport(text, { existingKeys: new Set(), room: 10_000 });
		expect(performance.now() - started).toBeLessThan(1000);
		expect(records).toHaveLength(10_000);
		expect(records[9_999]).toEqual({ value: "Prompt number 9999", tags: ["tag3", "group 0"] });
		expect(summary.added).toBe(10_000);
	});
});
