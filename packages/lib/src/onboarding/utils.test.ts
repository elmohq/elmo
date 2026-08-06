import { describe, expect, it } from "vitest";
import {
	cleanAndValidateDomain,
	cleanDomain,
	cleanUrl,
	inferBrandNameFromDomain,
	uniqueLowercase,
	uniqueTrim,
} from "./utils";

describe("cleanUrl", () => {
	// The brand website field accepts either shape, so both have to normalize to
	// something the page fetcher can use.
	it("adds a scheme to plain domains", () => {
		expect(cleanUrl("nike.com")).toBe("https://nike.com/");
		expect(cleanUrl("www.nike.com")).toBe("https://www.nike.com/");
		expect(cleanUrl("nike.com/")).toBe("https://nike.com/");
		expect(cleanUrl(" nike.com ")).toBe("https://nike.com/");
	});

	it("keeps the path, query, and fragment of a plain domain", () => {
		expect(cleanUrl("nike.com/golf")).toBe("https://nike.com/golf");
		expect(cleanUrl(" www.example.com/golf?category=clubs#featured ")).toBe(
			"https://www.example.com/golf?category=clubs#featured",
		);
	});

	it("leaves full URLs intact apart from host casing", () => {
		expect(cleanUrl("https://nike.com")).toBe("https://nike.com/");
		expect(cleanUrl("https://www.nike.com/golf")).toBe("https://www.nike.com/golf");
		expect(cleanUrl("HTTP://EXAMPLE.COM:8080/Golf")).toBe("http://example.com:8080/Golf");
	});

	// A domain and its URL form describe the same page and must agree.
	it("normalizes a plain domain and its URL form to the same value", () => {
		expect(cleanUrl("nike.com/golf")).toBe(cleanUrl("https://nike.com/golf"));
	});

	it("removes embedded credentials and rejects unsupported schemes", () => {
		expect(cleanUrl("https://user:secret@www.example.com/private")).toBe("https://www.example.com/private");
		expect(cleanUrl("ftp://example.com/private")).toBe("");
		expect(cleanUrl("javascript:alert(1)")).toBe("");
		expect(cleanUrl("   ")).toBe("");
	});

	// Sibling pages must not collapse together — analysis job dedupe keys off this.
	it("keeps sibling pages distinct", () => {
		expect(cleanUrl("nike.com/golf")).not.toBe(cleanUrl("nike.com/running"));
	});
});

describe("cleanDomain", () => {
	it("strips protocol, www, and path", () => {
		expect(cleanDomain("https://www.example.com/path")).toBe("example.com");
		expect(cleanDomain("HTTP://EXAMPLE.COM")).toBe("example.com");
	});

	it("handles plain domains", () => {
		expect(cleanDomain("example.com")).toBe("example.com");
		expect(cleanDomain(" example.com ")).toBe("example.com");
	});

	it("returns empty for empty input", () => {
		expect(cleanDomain("")).toBe("");
		expect(cleanDomain("   ")).toBe("");
	});
});

describe("cleanAndValidateDomain", () => {
	it("accepts valid domains", () => {
		expect(cleanAndValidateDomain("example.com")).toBe("example.com");
		expect(cleanAndValidateDomain("https://www.example.co.uk")).toBe("example.co.uk");
	});

	it("rejects invalid domains", () => {
		expect(cleanAndValidateDomain("not-a-domain")).toBeNull();
		expect(cleanAndValidateDomain("just text")).toBeNull();
		expect(cleanAndValidateDomain("")).toBeNull();
	});
});

describe("inferBrandNameFromDomain", () => {
	it("capitalizes the second-level domain", () => {
		expect(inferBrandNameFromDomain("nike.com")).toBe("Nike");
		expect(inferBrandNameFromDomain("https://www.adidas.de")).toBe("Adidas");
	});

	it("falls back to the input when domain is unparseable", () => {
		expect(inferBrandNameFromDomain("")).toBe("");
	});
});

describe("uniqueLowercase / uniqueTrim", () => {
	it("uniqueLowercase dedupes case-insensitively", () => {
		expect(uniqueLowercase(["A", "a", "B"])).toEqual(["a", "b"]);
	});

	it("uniqueTrim preserves case but dedupes case-insensitively", () => {
		expect(uniqueTrim(["Acme", "acme", "  Acme ", "Globex"])).toEqual(["Acme", "Globex"]);
	});

	it("filters empty strings", () => {
		expect(uniqueLowercase(["", " ", "x"])).toEqual(["x"]);
		expect(uniqueTrim(["", " ", "x"])).toEqual(["x"]);
	});
});
