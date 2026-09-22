import { describe, expect, it } from "vitest";
import type { Brand, Competitor } from "./db/schema";
import { analyzeMentions, type MentionConfig, mentionConfigFrom, mentionsStamp, normalizeDomain } from "./mentions";

describe("normalizeDomain", () => {
	it("reduces a URL to a bare comparable host", () => {
		expect(normalizeDomain("https://www.Acme.com/pricing?ref=x")).toBe("acme.com");
	});

	it("accepts a bare domain", () => {
		expect(normalizeDomain("www.acme.com")).toBe("acme.com");
	});

	it("falls back to the raw value rather than throwing on unparseable input", () => {
		expect(normalizeDomain("not a domain")).toBe("not a domain");
	});
});

describe("analyzeMentions", () => {
	const brand = { name: "Acme", aliases: ["Acme Corp"], domains: ["https://acme.com", "acme.io"] };

	it("finds the brand by name, case-insensitively", () => {
		expect(analyzeMentions("I would pick ACME for this.", brand, []).brandMentioned).toBe(true);
	});

	it("finds the brand by alias", () => {
		expect(analyzeMentions("Acme Corp is the incumbent.", { ...brand, name: "Zzz" }, []).brandMentioned).toBe(true);
	});

	it("finds the brand by any of its domains", () => {
		expect(analyzeMentions("See acme.io for details.", brand, []).brandMentioned).toBe(true);
	});

	it("reports no mention when nothing names the brand", () => {
		expect(analyzeMentions("Try something else entirely.", brand, []).brandMentioned).toBe(false);
	});

	it("names only the competitors the answer mentions", () => {
		const competitors = [
			{ name: "Globex", domains: ["globex.com"] },
			{ name: "Initech", domains: ["initech.com"] },
			{ name: "Hooli", domains: ["hooli.com"] },
		];
		const result = analyzeMentions("Globex and initech.com both compete here.", brand, competitors);
		expect(result.competitorsMentioned).toEqual(["Globex", "Initech"]);
	});

	it("still matches on name when a subject's domain is unparseable", () => {
		const result = analyzeMentions("Globex leads.", brand, [{ name: "Globex", domains: ["://broken"] }]);
		expect(result.competitorsMentioned).toEqual(["Globex"]);
	});

	it("treats a blank alias or domain as no signal rather than as a match on everything", () => {
		const blank = { name: "Zzz", aliases: ["", "   "], domains: ["", "  ", null] };
		expect(analyzeMentions("Any answer at all.", blank, []).brandMentioned).toBe(false);
		expect(analyzeMentions("Any answer at all.", brand, [blank]).competitorsMentioned).toEqual([]);
	});
});

describe("mentionsStamp", () => {
	const config: MentionConfig = {
		brand: { name: "Acme", aliases: ["Acme Corp"], domains: ["https://acme.com", "acme.io", "acme.dev"] },
		competitors: [
			{ name: "Globex", aliases: ["Globex Inc"], domains: ["globex.com"] },
			{ name: "Initech", aliases: [], domains: ["initech.com"] },
		],
	};

	it("changes when the brand gains an alias", () => {
		const withAlias = { ...config, brand: { ...config.brand, aliases: [...config.brand.aliases, "Acme Software"] } };
		expect(mentionsStamp(withAlias)).not.toBe(mentionsStamp(config));
	});

	it("changes when a competitor's domain changes", () => {
		const moved = {
			...config,
			competitors: [{ ...config.competitors[0], domains: ["globex.io"] }, config.competitors[1]],
		};
		expect(mentionsStamp(moved)).not.toBe(mentionsStamp(config));
	});

	it("survives reordering, so a bulk competitor save does not restamp history", () => {
		const reordered: MentionConfig = {
			brand: { ...config.brand, domains: [...config.brand.domains].reverse() },
			competitors: [...config.competitors].reverse(),
		};
		expect(mentionsStamp(reordered)).toBe(mentionsStamp(config));
	});

	it("survives a case or whitespace edit, which matching already ignores", () => {
		const recased: MentionConfig = {
			brand: {
				name: "ACME ",
				aliases: [" acme corp"],
				domains: ["https://WWW.acme.com", "https://acme.dev/", "Acme.io"],
			},
			competitors: [
				{ name: "Globex ", aliases: ["globex inc "], domains: ["www.Globex.com"] },
				{ name: " Initech", aliases: [], domains: ["https://initech.com/about"] },
			],
		};
		expect(mentionsStamp(recased)).toBe(mentionsStamp(config));
	});

	it("changes when a competitor is renamed, even only in case, since rollups key on the stored name", () => {
		const recased = { ...config, competitors: [{ ...config.competitors[0], name: "GLOBEX" }, config.competitors[1]] };
		expect(mentionsStamp(recased)).not.toBe(mentionsStamp(config));
	});
});

describe("mentionConfigFrom", () => {
	it("reads a brand and its competitors, tolerating absent arrays", () => {
		const brand = {
			name: "Acme",
			website: "https://acme.com",
			aliases: null,
			additionalDomains: null,
		} as unknown as Brand;
		const competitors = [{ name: "Globex", aliases: null, domains: null }] as unknown as Competitor[];

		expect(mentionConfigFrom(brand, competitors)).toEqual({
			brand: { name: "Acme", aliases: [], domains: ["https://acme.com"] },
			competitors: [{ name: "Globex", aliases: [], domains: [] }],
		});
	});
});
