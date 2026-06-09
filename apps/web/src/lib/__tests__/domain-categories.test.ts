import { describe, it, expect } from "vitest";
import {
	inferPageType,
	isGoogleShoppingUrl,
	isGoogleSearchUrl,
	isGoogleSurfaceUrl,
	parseGoogleProductName,
	parseGoogleSearchQuery,
	attributeProduct,
} from "@/lib/domain-categories";
import { categorizeDomain } from "@/lib/domain-categories.server";

const brand = new Set(["mybrand.com"]);
const competitors = new Set(["rival.com"]);
const cat = (domain: string) => categorizeDomain(domain, brand, competitors);

describe("categorizeDomain priority", () => {
	it("classifies brand and competitor domains (incl. subdomains)", () => {
		expect(cat("mybrand.com")).toBe("brand");
		expect(cat("blog.mybrand.com")).toBe("brand");
		expect(cat("rival.com")).toBe("competitor");
	});

	it("routes the new source categories", () => {
		expect(cat("forbes.com")).toBe("editorial");
		expect(cat("bbc.co.uk")).toBe("editorial"); // moved out of institutional
		expect(cat("g2.com")).toBe("reviews");
		expect(cat("reddit.com")).toBe("social");
		expect(cat("quora.com")).toBe("social");
		expect(cat("prnewswire.com")).toBe("pr");
	});

	it("puts Wikipedia in reference, not the .org institutional blanket", () => {
		expect(cat("en.wikipedia.org")).toBe("reference");
		expect(cat("crunchbase.com")).toBe("reference");
	});

	it("keeps government/edu/research institutional and Google as google", () => {
		expect(cat("nih.gov")).toBe("institutional");
		expect(cat("stanford.edu")).toBe("institutional");
		expect(cat("google.com")).toBe("google");
	});

	it("falls back to other for unknown domains", () => {
		expect(cat("some-random-saas.com")).toBe("other");
	});
});

describe("Google AI Mode URL detection", () => {
	const shopping = "https://www.google.com/search?q=product&prds=pvt:hg,productid:10893427041577982904";
	const search = "https://www.google.com/search?q=best+vitamin+c+serum";

	it("detects shopping vs search vs surface", () => {
		expect(isGoogleShoppingUrl(shopping)).toBe(true);
		expect(isGoogleSearchUrl(shopping)).toBe(false);
		expect(isGoogleSearchUrl(search)).toBe(true);
		expect(isGoogleShoppingUrl(search)).toBe(false);
		expect(isGoogleSurfaceUrl(shopping)).toBe(true);
		expect(isGoogleSurfaceUrl(search)).toBe(true);
		expect(isGoogleSurfaceUrl("https://forbes.com/article")).toBe(false);
	});

	it("parses product name from the title and skips the placeholder query", () => {
		expect(parseGoogleProductName(shopping, "U Beauty The Super Hydrator")).toBe("U Beauty The Super Hydrator");
		expect(parseGoogleSearchQuery(shopping)).toBeNull(); // q=product placeholder
		expect(parseGoogleSearchQuery(search)).toBe("best vitamin c serum");
	});
});

describe("attributeProduct", () => {
	const comps = [{ id: "1", name: "La Roche Posay" }, { id: "2", name: "The Ordinary" }];

	it("attributes to brand, competitor, or other by name match", () => {
		expect(attributeProduct("U Beauty The Super Hydrator", "U Beauty", comps).kind).toBe("brand");
		const comp = attributeProduct("La Roche Posay Cicaplast", "U Beauty", comps);
		expect(comp.kind).toBe("competitor");
		expect(comp.kind === "competitor" && comp.competitorName).toBe("La Roche Posay");
		expect(attributeProduct("CeraVe Moisturizing Cream", "U Beauty", comps).kind).toBe("other");
	});
});

describe("inferPageType", () => {
	it("classifies common page shapes", () => {
		expect(inferPageType("https://example.com/")).toBe("homepage");
		expect(inferPageType("https://example.com/docs/getting-started")).toBe("doc");
		expect(inferPageType("https://example.com/x", "Notion vs Asana: which is better")).toBe("comparison");
		expect(inferPageType("https://example.com/x", "10 best CRMs for startups")).toBe("listicle");
		expect(inferPageType("https://example.com/blog/how-to-do-x", "How to do X")).toBe("howto");
		expect(inferPageType("https://example.com/pricing")).toBe("product");
		expect(inferPageType("https://example.com/blog/2026/01/hello")).toBe("article");
		expect(inferPageType("https://www.google.com/search?q=product&prds=productid:1")).toBe("shopping");
	});
});
