import { describe, expect, it } from "vitest";
import { classifyUrl } from "./domain-lists";
import { GOOGLE_STATIC_CATEGORY, resolvePageClass } from "./page-classification";

/**
 * `resolvePageClass` reproduces, from the rollup-stored (static_category,
 * page_type) pair, what `classifyUrl`/`resolvePageType` would say for a given
 * brand — without a URL or title to reclassify from. These tests hold the two
 * paths to the same answer for the cases the override has to get right.
 */
describe("resolvePageClass", () => {
	const brandDomains = new Set(["ourbrand.com"]);
	const competitorDomains = new Set(["rival.com"]);

	it("overrides to brand for the brand's own domain, regardless of the stored category", () => {
		// classifyUrl would also say "brand" here even though the tenant-independent
		// classifier (empty domain sets) called this domain "editorial".
		expect(classifyUrl("ourbrand.com", "https://ourbrand.com/blog/post", null, brandDomains, competitorDomains)).toBe(
			"brand",
		);
		expect(
			resolvePageClass(
				{ domain: "ourbrand.com", static_category: "editorial", page_type: "article" },
				brandDomains,
				competitorDomains,
			),
		).toEqual({ category: "brand", pageType: "article" });
	});

	it("overrides to competitor for a tracked competitor's domain", () => {
		expect(
			resolvePageClass(
				{ domain: "rival.com", static_category: "other", page_type: "product" },
				brandDomains,
				competitorDomains,
			),
		).toEqual({ category: "competitor", pageType: "product" });
	});

	it("keeps the stored category for a domain that is neither brand nor competitor", () => {
		expect(
			resolvePageClass(
				{ domain: "some-editorial-site.com", static_category: "editorial", page_type: "howto" },
				brandDomains,
				competitorDomains,
			),
		).toEqual({ category: "editorial", pageType: "howto" });
	});

	it("upgrades an uncategorized page type to article on a content-publisher domain, matching resolvePageType", () => {
		// The page-type fallback classifyUrl/resolvePageType apply for an "other"
		// page type on an editorial/institutional/reference domain — classifyPage
		// (which fills static_category/page_type at rebuild time) doesn't know the
		// category yet, so the override has to redo this part at read time.
		expect(
			resolvePageClass(
				{ domain: "some-editorial-site.com", static_category: "editorial", page_type: "other" },
				brandDomains,
				competitorDomains,
			),
		).toEqual({ category: "editorial", pageType: "article" });
	});

	it("does not upgrade an uncategorized page type on a non-content-publisher domain", () => {
		expect(
			resolvePageClass(
				{ domain: "some-store.com", static_category: "ecommerce", page_type: "other" },
				brandDomains,
				competitorDomains,
			),
		).toEqual({ category: "ecommerce", pageType: "other" });
	});

	it("never upgrades an already-specific page type", () => {
		expect(
			resolvePageClass(
				{ domain: "some-editorial-site.com", static_category: "institutional", page_type: "video" },
				brandDomains,
				competitorDomains,
			),
		).toEqual({ category: "institutional", pageType: "video" });
	});

	it("drops a Google surface row (null) ahead of the brand/competitor override, matching how the raw path drops them by URL before classifying", () => {
		expect(
			resolvePageClass(
				{ domain: "google.com", static_category: GOOGLE_STATIC_CATEGORY, page_type: "search" },
				brandDomains,
				competitorDomains,
			),
		).toBeNull();
		// Even a domain that happens to be tracked as the brand's own still drops:
		// the raw path filters isGoogleSurfaceUrl(url) before it ever calls classify().
		expect(
			resolvePageClass(
				{ domain: "ourbrand.com", static_category: GOOGLE_STATIC_CATEGORY, page_type: "shopping" },
				new Set(["ourbrand.com"]),
				competitorDomains,
			),
		).toBeNull();
	});
});
