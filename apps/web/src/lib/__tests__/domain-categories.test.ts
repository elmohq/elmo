import { describe, it, expect } from "vitest";
import {
	inferPageType,
	resolvePageType,
	isGoogleShoppingUrl,
	isGoogleSearchUrl,
	isGoogleSurfaceUrl,
	parseGoogleProductName,
	parseGoogleSearchQuery,
	attributeProduct,
} from "@/lib/domain-categories";
import { categorizeDomain, classifyUrl } from "@/lib/domain-categories.server";

const brand = new Set(["mybrand.com"]);
const competitors = new Set(["rival.com"]);
const cat = (domain: string) => categorizeDomain(domain, brand, competitors);
const classify = (domain: string, url: string, title?: string) => classifyUrl(domain, url, title, brand, competitors);

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
		expect(cat("amazon.com")).toBe("ecommerce");
		expect(cat("sephora.com")).toBe("ecommerce");
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

	it("routes cross-niche domains (generalizable, not one vertical)", () => {
		// academic / research publishers
		expect(cat("mdpi.com")).toBe("institutional");
		expect(cat("jamanetwork.com")).toBe("institutional");
		expect(cat("jissn.biomedcentral.com")).toBe("institutional");
		expect(cat("pmc.ncbi.nlm.nih.gov")).toBe("institutional"); // .gov
		expect(cat("arxiv.org")).toBe("institutional");
		// developer platforms (code hosting, package registries, dev Q&A)
		expect(cat("github.com")).toBe("developer");
		expect(cat("gitlab.com")).toBe("developer");
		expect(cat("stackoverflow.com")).toBe("developer");
		expect(cat("pypi.org")).toBe("developer"); // .org, must beat institutional
		expect(cat("npmjs.com")).toBe("developer");
		expect(cat("developer.mozilla.org")).toBe("developer");
		// quora stays general social
		expect(cat("quora.com")).toBe("social");
		// dictionaries
		expect(cat("dictionary.cambridge.org")).toBe("reference");
		// retailers
		expect(cat("rei.com")).toBe("ecommerce");
		expect(cat("gnc.com")).toBe("ecommerce");
	});

	it("brand and competitor always win over list categories", () => {
		const b = new Set(["amazon.com"]); // hypothetically the brand's own domain
		const c = new Set(["github.com", "g2.com"]); // hypothetically tracked competitors
		expect(categorizeDomain("amazon.com", b, c)).toBe("brand"); // not ecommerce
		expect(categorizeDomain("github.com", b, c)).toBe("competitor"); // not developer
		expect(categorizeDomain("g2.com", b, c)).toBe("competitor"); // not reviews
		expect(categorizeDomain("blog.amazon.com", b, c)).toBe("brand"); // subdomain
	});
});

describe("classifyUrl fallback (shrinks 'other')", () => {
	it("treats unknown-domain review/article pages as editorial", () => {
		expect(classify("thestripe.com", "https://thestripe.com/my-u-beauty-review", "My U Beauty Review")).toBe("editorial");
		expect(classify("bowsandsequins.com", "https://bowsandsequins.com/2024/02/28/my-review", "A review")).toBe("editorial");
	});
	it("treats unknown-domain storefront/product pages as ecommerce", () => {
		expect(classify("shoprescuespa.com", "https://shoprescuespa.com/products/resurfacing-compound", "Resurfacing Compound")).toBe("ecommerce");
	});
	it("never overrides a domain that already classifies", () => {
		expect(classify("mybrand.com", "https://mybrand.com/blog/a-review", "A Review")).toBe("brand");
		expect(classify("amazon.com", "https://amazon.com/dp/B089", "Product")).toBe("ecommerce");
		expect(classify("some-corp.com", "https://some-corp.com/about", "About us")).toBe("other");
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
	it("classifies forum / video / info pages (shrinks page-type 'other')", () => {
		expect(inferPageType("https://reddit.com/r/Skincare/comments/abc/title")).toBe("forum");
		expect(inferPageType("https://youtube.com/watch?v=abc", "5 products")).toBe("video");
		expect(inferPageType("https://ubeauty.com/pages/return-policy", "Returns")).toBe("info");
		expect(inferPageType("https://ubeauty.com/pages/subscription", "Subscription")).toBe("info");
		expect(inferPageType("https://amazon.com/dp/B089", "U Beauty Serum")).toBe("product");
	});
	it("detects 'best/top' in the URL slug, but not store best-seller pages", () => {
		// title doesn't lead with "Best", but the slug does
		expect(inferPageType("https://urbanstylefootwear.com/best-white-sneakers-2026-tested", "I Tested Every Sneaker This Year")).toBe("listicle");
		expect(inferPageType("https://runrepeat.com/guides/best-trail-running-shoes", "Trail shoes")).toBe("listicle");
		// storefront best-seller / commerce paths are NOT listicles
		expect(inferPageType("https://shop.com/products/best-seller-serum", "Hydrating Serum")).toBe("product");
		expect(inferPageType("https://shop.com/collections/best-sellers", "Shop Collection")).toBe("product");
	});
});

describe("resolvePageType (niche-independent article fallback)", () => {
	it("treats untyped content-publisher pages as articles", () => {
		// niche health paths have no generic page-type signal, but the source is a publisher
		expect(resolvePageType("https://mayoclinic.org/diseases-conditions/acne/diagnosis-treatment/x", "Acne treatment", "institutional")).toBe("article");
		expect(resolvePageType("https://aad.org/public/diseases/acne/derm-treat/treat", "Acne", "institutional")).toBe("article");
		expect(resolvePageType("https://en.wikipedia.org/wiki/Acne", "Acne", "reference")).toBe("article");
	});
	it("does not turn brand utility / typed pages into articles", () => {
		expect(resolvePageType("https://ubeauty.com/pages/siren-technology", "SIREN Technology", "brand")).toBe("other");
		expect(resolvePageType("https://ubeauty.com/pages/return-policy", "Returns", "brand")).toBe("info");
	});
});
