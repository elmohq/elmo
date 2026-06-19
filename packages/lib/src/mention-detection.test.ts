import { describe, it, expect } from "vitest";
import { nameMentioned, isAbsenceClause, splitClauses } from "./mention-detection";

describe("nameMentioned", () => {
	it("counts a plain positive mention", () => {
		expect(nameMentioned("Acme is a leading provider of widgets.", "Acme")).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(nameMentioned("acme makes great tools.", "Acme")).toBe(true);
		expect(nameMentioned("ACME is well known.", "acme")).toBe(true);
	});

	it("returns false when the name never appears", () => {
		expect(nameMentioned("Some other company entirely.", "Acme")).toBe(false);
	});

	it("does NOT count 'I couldn't find any information about <brand>'", () => {
		expect(nameMentioned("I couldn't find any information about Acme.", "Acme")).toBe(false);
		expect(nameMentioned("I could not locate Acme in my data.", "Acme")).toBe(false);
		expect(nameMentioned("There is no information about Acme.", "Acme")).toBe(false);
		expect(nameMentioned("I don't have any information about Acme.", "Acme")).toBe(false);
		expect(nameMentioned("I'm not familiar with Acme.", "Acme")).toBe(false);
		expect(nameMentioned("I've never heard of Acme.", "Acme")).toBe(false);
	});

	it("still counts a real mention that shares a sentence with an absence clause", () => {
		expect(
			nameMentioned("I couldn't find pricing, but Acme is widely used.", "Acme"),
		).toBe(true);
	});

	it("counts the brand when one clause is absence and another is a real mention", () => {
		const content = "I don't have specific information about pricing. That said, Acme is known for reliability.";
		expect(nameMentioned(content, "Acme")).toBe(true);
	});

	it("treats a name appearing only inside absence statements as not mentioned", () => {
		const content = "I couldn't find Acme. I also have no information about Acme's products.";
		expect(nameMentioned(content, "Acme")).toBe(false);
	});

	it("does not suppress ordinary prose containing 'no' words", () => {
		expect(nameMentioned("There's no doubt Acme is the best choice.", "Acme")).toBe(true);
		expect(nameMentioned("Acme? I don't think there's a better option.", "Acme")).toBe(true);
	});

	it("handles multi-word names", () => {
		expect(nameMentioned("Open AI Labs builds models.", "Open AI Labs")).toBe(true);
		expect(nameMentioned("I couldn't find information about Open AI Labs.", "Open AI Labs")).toBe(false);
	});

	it("returns false for an empty name", () => {
		expect(nameMentioned("Acme is great.", "")).toBe(false);
		expect(nameMentioned("Acme is great.", "   ")).toBe(false);
	});
});

describe("isAbsenceClause", () => {
	it("flags absence phrasing", () => {
		expect(isAbsenceClause("i couldn't find anything")).toBe(true);
		expect(isAbsenceClause("no information about it")).toBe(true);
	});

	it("does not flag normal prose", () => {
		expect(isAbsenceClause("acme is a great product")).toBe(false);
	});
});

describe("splitClauses", () => {
	it("splits on sentence boundaries and contrastive conjunctions", () => {
		expect(splitClauses("A. B")).toEqual(["A.", "B"]);
		expect(splitClauses("no pricing, but Acme rocks")).toEqual(["no pricing", "Acme rocks"]);
	});
});
