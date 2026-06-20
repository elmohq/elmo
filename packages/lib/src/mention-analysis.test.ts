import { describe, expect, it } from "vitest";
import { analyzeMentions, extractDomainFromUrl, mentionsName } from "./mention-analysis";

describe("mention-analysis", () => {
	describe("extractDomainFromUrl", () => {
		it("normalizes URLs and bare domains", () => {
			expect(extractDomainFromUrl("https://www.acme.com/pricing")).toBe("acme.com");
			expect(extractDomainFromUrl("acme.com")).toBe("acme.com");
			expect(extractDomainFromUrl("www.Acme.com")).toBe("acme.com");
		});

		it("falls back gracefully for invalid input", () => {
			expect(extractDomainFromUrl("not a url")).toBe("not a url");
		});
	});

	describe("mentionsName", () => {
		it("matches names on word boundaries, case-insensitively", () => {
			expect(mentionsName("I recommend Box for storage", "Box")).toBe(true);
			expect(mentionsName("I recommend box for storage", "Box")).toBe(true);
			expect(mentionsName("Box, Dropbox, and others", "Box")).toBe(true);
			expect(mentionsName("(Box)", "Box")).toBe(true);
			expect(mentionsName("Box", "Box")).toBe(true);
		});

		it("does not match names embedded in longer words", () => {
			expect(mentionsName("check your toolbox first", "Box")).toBe(false);
			expect(mentionsName("Dropbox is popular", "Box")).toBe(false);
			expect(mentionsName("boxing equipment", "Box")).toBe(false);
		});

		it("matches multi-word names", () => {
			expect(mentionsName("try Acme Corp products", "Acme Corp")).toBe(true);
			expect(mentionsName("try AcmeCorporation products", "Acme Corp")).toBe(false);
		});

		it("handles names with regex special characters", () => {
			expect(mentionsName("written in C++ mostly", "C++")).toBe(true);
			expect(mentionsName("Notion (beta) rocks", "Notion (beta)")).toBe(true);
		});

		it("ignores empty names", () => {
			expect(mentionsName("any content", "")).toBe(false);
			expect(mentionsName("any content", "   ")).toBe(false);
		});
	});

	describe("analyzeMentions", () => {
		const brand = {
			name: "Box",
			website: "https://box.com",
			aliases: ["Box Inc"],
			additionalDomains: ["box.org"],
		};
		const competitors = [
			{ name: "Dropbox", aliases: [], domains: ["dropbox.com"] },
			{ name: "Drive", aliases: ["Google Drive"], domains: ["drive.google.com"] },
		];

		it("detects brand mentions by name", () => {
			expect(analyzeMentions("Box is a solid option.", brand, []).brandMentioned).toBe(true);
		});

		it("does not flag the brand when its name is part of another word", () => {
			expect(analyzeMentions("A toolbox of dropbox-like apps.", brand, []).brandMentioned).toBe(false);
		});

		it("detects brand mentions by alias and by domain substring", () => {
			expect(analyzeMentions("Box Inc announced...", brand, []).brandMentioned).toBe(true);
			expect(analyzeMentions("see https://www.box.com/pricing", brand, []).brandMentioned).toBe(true);
			expect(analyzeMentions("see box.org for details", brand, []).brandMentioned).toBe(true);
		});

		it("detects competitors by name, alias, and domain", () => {
			const result = analyzeMentions(
				"Dropbox and Google Drive (drive.google.com) are alternatives.",
				brand,
				competitors,
			);
			expect(result.competitorsMentioned).toEqual(["Dropbox", "Drive"]);
		});

		it("does not flag competitors embedded in longer words", () => {
			const result = analyzeMentions("Overdrive features galore.", brand, competitors);
			expect(result.competitorsMentioned).toEqual([]);
		});

		it("returns empty results for empty content", () => {
			expect(analyzeMentions("", brand, competitors)).toEqual({
				brandMentioned: false,
				competitorsMentioned: [],
			});
		});
	});
});
