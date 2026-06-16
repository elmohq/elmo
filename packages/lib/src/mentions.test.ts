import { describe, expect, it } from "vitest";
import { analyzeMentions, extractDomainFromUrl } from "./mentions";

describe("extractDomainFromUrl", () => {
	it("strips protocol and www, lowercases", () => {
		expect(extractDomainFromUrl("https://www.Nike.com/shoes")).toBe("nike.com");
		expect(extractDomainFromUrl("nike.com")).toBe("nike.com");
		expect(extractDomainFromUrl("WWW.Example.CO.UK")).toBe("example.co.uk");
	});
});

describe("analyzeMentions", () => {
	const brand = {
		name: "Nike",
		website: "nike.com",
		aliases: ["Nike Inc"],
		additionalDomains: ["nike.co.uk"],
	};
	const competitors = [
		{ name: "Adidas", domains: ["adidas.com"], aliases: [] },
		{ name: "New Balance", domains: ["newbalance.com"], aliases: ["NB"] },
	];

	it("detects the brand by name (case-insensitive)", () => {
		const r = analyzeMentions("I really like NIKE running shoes.", brand, competitors);
		expect(r.brandMentioned).toBe(true);
		expect(r.competitorsMentioned).toEqual([]);
	});

	it("detects the brand by domain", () => {
		const r = analyzeMentions("See nike.co.uk for details.", brand, competitors);
		expect(r.brandMentioned).toBe(true);
	});

	it("detects competitors by name, domain, and alias", () => {
		const r = analyzeMentions("Compare adidas.com and NB to others.", brand, competitors);
		expect(r.brandMentioned).toBe(false);
		expect(r.competitorsMentioned).toEqual(["Adidas", "New Balance"]);
	});

	it("returns no mentions when nobody appears", () => {
		const r = analyzeMentions("A generic answer about footwear.", brand, competitors);
		expect(r.brandMentioned).toBe(false);
		expect(r.competitorsMentioned).toEqual([]);
	});

	it("tolerates missing optional fields", () => {
		const r = analyzeMentions("puma is great", { name: "Puma" }, [{ name: "Reebok" }]);
		expect(r.brandMentioned).toBe(true);
		expect(r.competitorsMentioned).toEqual([]);
	});
});
