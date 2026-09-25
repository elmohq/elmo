import { describe, expect, it } from "vitest";
import { matchesPromptFilter, mentionsBrand, parsePromptFilter } from "./prompt-type";

const acme = {
	name: "Acme Corp",
	website: "https://www.acmecorp.com",
	aliases: ["Roadrunner Supply"],
	additionalDomains: ["acme.shop"],
};

describe("mentionsBrand", () => {
	it("matches the brand name, domain, and the domain's bare label", () => {
		expect(mentionsBrand("is Acme Corp any good", acme)).toBe(true);
		expect(mentionsBrand("reviews of acmecorp.com", acme)).toBe(true);
		expect(mentionsBrand("acmecorp vs the rest", acme)).toBe(true);
	});

	it("matches aliases and additional domains", () => {
		expect(mentionsBrand("roadrunner supply return policy", acme)).toBe(true);
		expect(mentionsBrand("is acme.shop legit", acme)).toBe(true);
	});

	it("does not match a prompt that never names the brand", () => {
		expect(mentionsBrand("best anvils for cartoon physics", acme)).toBe(false);
	});

	it("follows brand edits, so a new alias reclassifies existing prompts", () => {
		const prompt = "is wile e's favorite supplier reliable";
		expect(mentionsBrand(prompt, acme)).toBe(false);
		expect(mentionsBrand(prompt, { ...acme, aliases: ["wile e's favorite supplier"] })).toBe(true);
	});

	it("still matches the name when the website is malformed", () => {
		expect(mentionsBrand("acme corp pricing", { name: "Acme Corp", website: "" })).toBe(true);
		expect(mentionsBrand("random products", { name: "Acme Corp", website: "" })).toBe(false);
	});
});

describe("parsePromptFilter", () => {
	it("splits comma-joined tags, normalizing and deduping", () => {
		expect(parsePromptFilter({ tags: "Pricing,,pricing, support" })).toEqual({ tags: ["pricing", "support"] });
	});

	it("takes an explicit type", () => {
		expect(parsePromptFilter({ tags: ["pricing"], type: "branded" })).toEqual({ tags: ["pricing"], type: "branded" });
	});

	it("ignores an unknown type", () => {
		expect(parsePromptFilter({ type: "competitor" })).toEqual({ tags: [] });
	});

	it("reads a legacy branded or unbranded tag as the type", () => {
		expect(parsePromptFilter({ tags: "unbranded,pricing" })).toEqual({ tags: ["pricing"], type: "unbranded" });
	});

	it("reads both legacy types together as no type constraint", () => {
		expect(parsePromptFilter({ tags: "branded,unbranded" })).toEqual({ tags: [] });
	});

	it("prefers the explicit type over a legacy tag", () => {
		expect(parsePromptFilter({ tags: "branded", type: "unbranded" })).toEqual({ tags: [], type: "unbranded" });
	});
});

describe("matchesPromptFilter", () => {
	const prompt = { tags: ["pricing"], branded: true };

	it("matches everything with no filter", () => {
		expect(matchesPromptFilter(prompt, { tags: [] })).toBe(true);
	});

	it("matches when any tag matches", () => {
		expect(matchesPromptFilter(prompt, { tags: ["support", "pricing"] })).toBe(true);
		expect(matchesPromptFilter(prompt, { tags: ["support"] })).toBe(false);
	});

	it("requires the type and the tags together", () => {
		expect(matchesPromptFilter(prompt, { tags: ["pricing"], type: "branded" })).toBe(true);
		expect(matchesPromptFilter(prompt, { tags: ["pricing"], type: "unbranded" })).toBe(false);
		expect(matchesPromptFilter(prompt, { tags: [], type: "unbranded" })).toBe(false);
	});
});
