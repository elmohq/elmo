import { describe, expect, it } from "vitest";
import { isMarketplaceDomain } from "@/lib/marketplace-domains.server";

describe("isMarketplaceDomain", () => {
	it("flags domains listed on the link marketplaces", () => {
		expect(isMarketplaceDomain("techbullion.com")).toBe(true);
		expect(isMarketplaceDomain("marketbusinessnews.com")).toBe(true);
		expect(isMarketplaceDomain("businessmodulehub.com")).toBe(true);
	});

	it("does not flag newsrooms, reference sites, or software directories", () => {
		for (const domain of ["apnews.com", "reuters.com", "nytimes.com", "wikipedia.org", "github.com", "g2.com"]) {
			expect(isMarketplaceDomain(domain)).toBe(false);
		}
	});

	it("ignores case, since citation hostnames aren't normalized upstream", () => {
		expect(isMarketplaceDomain("TechBullion.com")).toBe(true);
	});
});
