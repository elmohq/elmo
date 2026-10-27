import { describe, expect, it } from "vitest";
import { analyzeAnswer, mentionsBrand, tallyCompetitors, tallySources } from "./mentions";

const acme = { name: "Acme", aliases: ["Acme Projects"], domain: "acme.com" };

describe("mentionsBrand", () => {
	it("finds the brand name as a whole word, in any case", () => {
		expect(mentionsBrand("Try ACME for this.", acme)).toBe(true);
		expect(mentionsBrand("Acme's free plan is generous.", acme)).toBe(true);
	});

	it("finds the brand by its domain", () => {
		expect(mentionsBrand("See acme.com/pricing for details.", acme)).toBe(true);
	});

	it("ignores the name inside a longer word", () => {
		expect(mentionsBrand("The acmeist approach and Acmeware.", acme)).toBe(false);
	});
});

describe("analyzeAnswer", () => {
	const sources = [
		{ url: "https://www.g2.com/x", domain: "g2.com" },
		{ url: "https://blog.acme.com/guide", domain: "blog.acme.com" },
	];

	it("ranks the brand by where it first appears among named brands", () => {
		const result = analyzeAnswer({
			text: "1. Globex is great. 2. Acme is simpler. 3. Initech is cheapest.",
			sources: [],
			brand: acme,
			namedBrands: ["Initech", "Acme", "Globex"],
		});
		expect(result.mentioned).toBe(true);
		expect(result.position).toBe(2);
		expect(result.competitors).toEqual(["Globex", "Initech"]);
	});

	it("reports competitors and no position when the brand is absent", () => {
		const result = analyzeAnswer({
			text: "Globex and Initech lead this category.",
			sources: [],
			brand: acme,
			namedBrands: ["Globex", "Initech"],
		});
		expect(result.mentioned).toBe(false);
		expect(result.position).toBeNull();
		expect(result.competitors).toEqual(["Globex", "Initech"]);
	});

	it("doesn't count the brand or its aliases as competitors", () => {
		const result = analyzeAnswer({
			text: "Acme Projects is first, then Globex.",
			sources: [],
			brand: acme,
			namedBrands: ["Acme Projects", "acme", "Globex", "globex"],
		});
		expect(result.position).toBe(1);
		expect(result.competitors).toEqual(["Globex"]);
	});

	it("counts a citation on any subdomain of the brand's site", () => {
		expect(analyzeAnswer({ text: "", sources, brand: acme, namedBrands: [] }).cited).toBe(true);
		expect(analyzeAnswer({ text: "", sources: sources.slice(0, 1), brand: acme, namedBrands: [] }).cited).toBe(false);
	});

	it("doesn't credit a lookalike domain as the brand's", () => {
		const lookalike = [{ url: "https://notacme.com/", domain: "notacme.com" }];
		expect(analyzeAnswer({ text: "", sources: lookalike, brand: acme, namedBrands: [] }).cited).toBe(false);
	});

	it("drops named brands the answer text never actually contains", () => {
		const result = analyzeAnswer({
			text: "Globex is good.",
			sources: [],
			brand: acme,
			namedBrands: ["Globex", "Hooli"],
		});
		expect(result.competitors).toEqual(["Globex"]);
	});
});

describe("tallies", () => {
	it("ranks competitors by how many answers name them", () => {
		expect(
			tallyCompetitors([{ competitors: ["Globex", "Initech"] }, { competitors: ["globex"] }, { competitors: [] }]),
		).toEqual([
			{ name: "Globex", count: 2 },
			{ name: "Initech", count: 1 },
		]);
	});

	it("counts each source domain once per answer", () => {
		const twice = [
			{ url: "https://g2.com/a", domain: "g2.com" },
			{ url: "https://g2.com/b", domain: "g2.com" },
		];
		expect(tallySources([{ sources: twice }, { sources: twice.slice(0, 1) }])).toEqual([
			{ domain: "g2.com", count: 2 },
		]);
	});
});
