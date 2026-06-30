import { describe, it, expect } from "vitest";
import { detectRefusal, isRefusal } from "./refusal-detection";

describe("detectRefusal", () => {
	it("flags a terse refusal", () => {
		expect(isRefusal("I can't help with that.")).toBe(true);
		expect(isRefusal("Sorry, but I must decline.")).toBe(true);
		expect(isRefusal("I'm unable to assist with this request.")).toBe(true);
	});

	it("returns the matched phrase", () => {
		const r = detectRefusal("I can't help with that request.");
		expect(r.isRefusal).toBe(true);
		expect(r.matchedPhrase).toBe("i can't help with that");
	});

	it("handles curly apostrophes", () => {
		expect(isRefusal("I can’t help with that.")).toBe(true);
	});

	it("flags a refusal that opens a longer explanation", () => {
		const content =
			"I'm sorry, but I can't assist with that. Providing this kind of content would not be appropriate, and I'd rather point you to safer alternatives instead.";
		expect(isRefusal(content)).toBe(true);
	});

	it("does NOT flag a real answer that mentions a partial limitation", () => {
		const content =
			"Acme is a popular CRM. I can't share their exact internal pricing, but public plans start around $25/user. Competitors include Beta and Gamma.";
		expect(isRefusal(content)).toBe(false);
	});

	it("does NOT flag ordinary answers", () => {
		expect(isRefusal("Acme is a leading provider of widgets and analytics.")).toBe(false);
		expect(isRefusal("The best options are Acme, Beta, and Gamma.")).toBe(false);
	});

	it("returns false for empty content", () => {
		expect(isRefusal("")).toBe(false);
		expect(isRefusal("   ")).toBe(false);
	});

	it("does not scan deep into long responses for a stray refusal phrase", () => {
		// A genuine, long answer that happens to contain a refusal-like phrase far
		// past the opening should not be classified as a refusal.
		const longAnswer = `${"Acme is great. ".repeat(60)} In rare edge cases I can't do that, but overall it's solid.`;
		expect(longAnswer.length).toBeGreaterThan(600);
		expect(isRefusal(longAnswer)).toBe(false);
	});
});
