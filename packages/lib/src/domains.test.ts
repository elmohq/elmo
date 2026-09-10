import { describe, expect, it } from "vitest";
import { dropRedundantDomains, findRedundantDomains, inDomainSet, redundantDomainReason } from "./domains";

describe("inDomainSet", () => {
	it("matches a domain and its subdomains", () => {
		const set = new Set(["acme.io"]);

		expect(inDomainSet("acme.io", set)).toBe(true);
		expect(inDomainSet("blog.acme.io", set)).toBe(true);
		expect(inDomainSet("eu.blog.acme.io", set)).toBe(true);
	});

	it("does not match a domain that only shares a suffix", () => {
		const set = new Set(["acme.io"]);

		expect(inDomainSet("notacme.io", set)).toBe(false);
		expect(inDomainSet("fake-acme.io", set)).toBe(false);
		expect(inDomainSet("acme.io.example.com", set)).toBe(false);
	});
});

describe("findRedundantDomains", () => {
	it("flags a subdomain of another entry, whichever order they were entered in", () => {
		expect(findRedundantDomains(["acme.io", "blog.acme.io"])).toEqual(new Map([["blog.acme.io", "acme.io"]]));
		expect(findRedundantDomains(["blog.acme.io", "acme.io"])).toEqual(new Map([["blog.acme.io", "acme.io"]]));
	});

	it("leaves only the broadest entry of a chain unflagged", () => {
		const redundant = findRedundantDomains(["eu.blog.acme.io", "blog.acme.io", "acme.io"]);

		expect([...redundant.keys()]).toEqual(["eu.blog.acme.io", "blog.acme.io"]);
	});

	it("keeps a domain that shares a suffix without a label boundary", () => {
		// A bare endsWith would delete two genuinely different companies here.
		expect(findRedundantDomains(["acme.io", "notacme.io", "fake-acme.io"]).size).toBe(0);
	});

	it("flags an entry the website covers", () => {
		expect(findRedundantDomains(["blog.acme.com", "acme.io"], "acme.com")).toEqual(
			new Map([["blog.acme.com", "acme.com"]]),
		);
	});

	it("flags an entry that repeats the website", () => {
		expect(findRedundantDomains(["acme.com"], "acme.com")).toEqual(new Map([["acme.com", "acme.com"]]));
	});

	it("does not flag the entry a subdomain website sits under", () => {
		expect(findRedundantDomains(["acme.com"], "blog.acme.com").size).toBe(0);
	});

	it("does not let a repeated entry cancel itself out", () => {
		expect(findRedundantDomains(["acme.io", "acme.io"]).size).toBe(0);
	});

	it("flags nothing when no domain covers another", () => {
		expect(findRedundantDomains(["acme.io", "acme.co.uk", "acmestore.com"], "acme.com").size).toBe(0);
	});
});

describe("dropRedundantDomains", () => {
	it("keeps the broadest entry and de-duplicates", () => {
		expect(dropRedundantDomains(["blog.acme.io", "acme.io", "acme.io", "shop.acme.com"], "acme.com")).toEqual([
			"acme.io",
		]);
	});

	it("returns the list untouched when nothing is covered", () => {
		expect(dropRedundantDomains(["acme.io", "acme.co.uk"], "acme.com")).toEqual(["acme.io", "acme.co.uk"]);
	});

	it("works without a website", () => {
		expect(dropRedundantDomains(["acme.io", "blog.acme.io"])).toEqual(["acme.io"]);
	});
});

describe("redundantDomainReason", () => {
	it("names the covering domain", () => {
		expect(redundantDomainReason("blog.acme.io", "acme.io")).toBe("already covered by acme.io");
	});

	it("says so plainly when the entry is the website itself", () => {
		expect(redundantDomainReason("acme.com", "acme.com")).toBe("already the brand's website");
	});
});
