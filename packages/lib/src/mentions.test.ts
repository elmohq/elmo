import { describe, expect, it } from "vitest";
import type { Brand, Competitor } from "./db/schema";
import { type MentionConfig, mentionConfigFrom, mentionsStamp, normalizeDomain } from "./mentions";

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

describe("mentionsStamp", () => {
	const config: MentionConfig = {
		brand: { name: "Acme", aliases: ["Acme Corp"], domains: ["https://acme.com", "acme.io", "acme.dev"] },
		competitors: [
			{ name: "Globex", aliases: ["Globex Inc"], domains: ["globex.com"] },
			{ name: "Initech", aliases: [], domains: ["initech.com"] },
		],
	};

	const J = "0.3.0";

	it("changes with the judge", () => {
		expect(mentionsStamp(config, "0.4.0")).not.toBe(mentionsStamp(config, J));
	});

	it("changes when the brand gains an alias", () => {
		const withAlias = { ...config, brand: { ...config.brand, aliases: [...config.brand.aliases, "Acme Software"] } };
		expect(mentionsStamp(withAlias, J)).not.toBe(mentionsStamp(config, J));
	});

	it("changes when a competitor's domain changes", () => {
		const moved = {
			...config,
			competitors: [{ ...config.competitors[0], domains: ["globex.io"] }, config.competitors[1]],
		};
		expect(mentionsStamp(moved, J)).not.toBe(mentionsStamp(config, J));
	});

	it("changes when a term is only recased, since the model reads names as written", () => {
		const recased = {
			...config,
			brand: { ...config.brand, aliases: config.brand.aliases.map((a) => a.toLowerCase()) },
		};
		expect(mentionsStamp(recased, J)).not.toBe(mentionsStamp(config, J));
	});

	it("survives reordering competitors, so a bulk save does not restamp history", () => {
		const reordered = { ...config, competitors: [...config.competitors].reverse() };
		expect(mentionsStamp(reordered, J)).toBe(mentionsStamp(config, J));
	});

	it.each(["GLOBEX", "Globex "])(
		"changes when a competitor is renamed to %j, since runs and rollups store the name verbatim",
		(name) => {
			const renamed = { ...config, competitors: [{ ...config.competitors[0], name }, config.competitors[1]] };
			expect(mentionsStamp(renamed, J)).not.toBe(mentionsStamp(config, J));
		},
	);
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
