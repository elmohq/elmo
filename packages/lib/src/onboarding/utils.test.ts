import { describe, expect, it } from "vitest";
import {
	cleanAndValidateDomain,
	cleanDomain,
	cleanUrl,
	inferBrandNameFromDomain,
	resolveAnalysisUrl,
	uniqueLowercase,
	uniqueTrim,
} from "./utils";

describe("cleanUrl", () => {
	it("preserves the page path, query, and fragment", () => {
		expect(cleanUrl(" www.example.com/golf?category=clubs#featured ")).toBe(
			"https://www.example.com/golf?category=clubs#featured",
		);
		expect(cleanUrl("nike.com")).toBe("https://nike.com/");
		expect(cleanUrl("HTTP://EXAMPLE.COM:8080/Golf")).toBe("http://example.com:8080/Golf");
	});

	it("removes embedded credentials and rejects unsupported schemes", () => {
		expect(cleanUrl("https://user:secret@www.example.com/private")).toBe("https://www.example.com/private");
		expect(cleanUrl("ftp://example.com/private")).toBe("");
		expect(cleanUrl("javascript:alert(1)")).toBe("");
		expect(cleanUrl("   ")).toBe("");
	});
});

describe("resolveAnalysisUrl", () => {
	it("prefers an explicit analysis URL over the tracked website", () => {
		expect(resolveAnalysisUrl({ website: "https://www.nike.com/", analysisUrl: "https://www.nike.com/golf" })).toBe(
			"https://www.nike.com/golf",
		);
	});

	it("falls back to the website when no analysis URL is given", () => {
		expect(resolveAnalysisUrl({ website: "nike.com" })).toBe("https://nike.com/");
		expect(resolveAnalysisUrl({ website: "nike.com", analysisUrl: "  " })).toBe("https://nike.com/");
	});

	// Distinct pages must not collapse to one key, or a second analysis gets
	// deduped away as "already running".
	it("keeps sibling pages distinct", () => {
		const golf = resolveAnalysisUrl({ website: "nike.com", analysisUrl: "nike.com/golf" });
		const running = resolveAnalysisUrl({ website: "nike.com", analysisUrl: "nike.com/running" });
		expect(golf).not.toBe(running);
	});

	it("is empty when the analysis URL can't be fetched", () => {
		expect(resolveAnalysisUrl({ website: "nike.com", analysisUrl: "ftp://nike.com/golf" })).toBe("");
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
