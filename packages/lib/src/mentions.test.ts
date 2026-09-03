import { describe, expect, it } from "vitest";
import { analyzeMentions, normalizeDomain } from "./mentions";

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
});
