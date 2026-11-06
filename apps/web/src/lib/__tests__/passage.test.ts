import type { MentionAssessment } from "@workspace/lib/mentions";
import { describe, expect, it } from "vitest";
import { assessedPassage, passageRange } from "@/lib/passage";

const assessment = (passage?: { start: number; end: number }): MentionAssessment => ({
	mentioned: true,
	probability: 1,
	passage,
});

describe("passageRange", () => {
	it("returns the passage range when it fits inside the text", () => {
		expect(passageRange("Try Acme today", assessment({ start: 4, end: 8 }))).toEqual({ start: 4, end: 8 });
	});

	it("returns null when the passage runs past the end of the text", () => {
		expect(passageRange("Try Acme today", assessment({ start: 4, end: 15 }))).toBeNull();
	});

	it("returns the passage range when it ends at the end of the text", () => {
		expect(passageRange("Try Acme today", assessment({ start: 4, end: 14 }))).toEqual({ start: 4, end: 14 });
	});

	it("returns null when the passage is empty", () => {
		expect(passageRange("Try Acme today", assessment({ start: 4, end: 4 }))).toBeNull();
	});

	it("returns null when the passage is reversed", () => {
		expect(passageRange("Try Acme today", assessment({ start: 8, end: 4 }))).toBeNull();
	});

	it("returns null when there is no passage", () => {
		expect(passageRange("Try Acme today", assessment())).toBeNull();
	});

	it("returns null when the text is null", () => {
		expect(passageRange(null, assessment({ start: 4, end: 8 }))).toBeNull();
	});
});

describe("assessedPassage", () => {
	it("returns the sliced passage from the text", () => {
		expect(assessedPassage("Try Acme today", assessment({ start: 4, end: 8 }))).toBe("Acme");
	});

	it("trims whitespace around the passage", () => {
		expect(assessedPassage("Try  Acme  today", assessment({ start: 3, end: 11 }))).toBe("Acme");
	});

	it("returns null when the passage contains only whitespace", () => {
		expect(assessedPassage("Try    today", assessment({ start: 3, end: 7 }))).toBeNull();
	});

	it("returns null when the passage runs past the end of the text", () => {
		expect(assessedPassage("Try Acme today", assessment({ start: 4, end: 15 }))).toBeNull();
	});

	it("returns null when there is no passage", () => {
		expect(assessedPassage("Try Acme today", assessment())).toBeNull();
	});

	it("returns null when the text is null", () => {
		expect(assessedPassage(null, assessment({ start: 4, end: 8 }))).toBeNull();
	});
});
