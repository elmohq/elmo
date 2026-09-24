import { describe, expect, it } from "vitest";
import { validateWebsiteUrl } from "@/lib/brand-website";

describe("validateWebsiteUrl", () => {
	it("rejects empty input", () => {
		expect(validateWebsiteUrl("")).toEqual({ isValid: false, error: "Website URL is required" });
	});

	it("rejects whitespace-only input", () => {
		expect(validateWebsiteUrl("   ")).toEqual({ isValid: false, error: "Website URL is required" });
	});

	it("accepts a bare domain and prepends https", () => {
		expect(validateWebsiteUrl("example.com")).toEqual({
			isValid: true,
			formattedUrl: "https://example.com/",
		});
	});

	it("accepts a bare domain with www", () => {
		expect(validateWebsiteUrl("www.example.com")).toEqual({
			isValid: true,
			formattedUrl: "https://www.example.com/",
		});
	});

	it("accepts a full https URL with no path", () => {
		expect(validateWebsiteUrl("https://example.com")).toEqual({
			isValid: true,
			formattedUrl: "https://example.com/",
		});
	});

	// A domain and its URL form name the same site and must store identically.
	it("normalizes a bare domain and its URL form to the same value", () => {
		expect(validateWebsiteUrl("example.com/products")).toEqual(validateWebsiteUrl("https://example.com/products"));
	});

	// A sub-brand page is the whole point: it drives analysis, and everything
	// that tracks mentions reduces this back to example.com anyway.
	it("keeps the path from a URL with a path", () => {
		expect(validateWebsiteUrl("https://example.com/products")).toEqual({
			isValid: true,
			formattedUrl: "https://example.com/products",
		});
	});

	it("keeps path, query, and hash", () => {
		expect(validateWebsiteUrl("https://example.com/products?ref=foo#section")).toEqual({
			isValid: true,
			formattedUrl: "https://example.com/products?ref=foo#section",
		});
	});

	it("keeps the path from a bare domain input", () => {
		expect(validateWebsiteUrl("example.com/products")).toEqual({
			isValid: true,
			formattedUrl: "https://example.com/products",
		});
	});

	it("preserves http protocol when explicitly provided", () => {
		expect(validateWebsiteUrl("http://example.com/path")).toEqual({
			isValid: true,
			formattedUrl: "http://example.com/path",
		});
	});

	it("preserves subdomains", () => {
		expect(validateWebsiteUrl("https://blog.example.com/posts/1")).toEqual({
			isValid: true,
			formattedUrl: "https://blog.example.com/posts/1",
		});
	});

	it("drops embedded credentials", () => {
		expect(validateWebsiteUrl("https://alice:secret@example.com/private")).toEqual({
			isValid: true,
			formattedUrl: "https://example.com/private",
		});
	});

	it("rejects hostnames without a TLD", () => {
		const result = validateWebsiteUrl("foo");
		expect(result.isValid).toBe(false);
	});

	it("rejects input that doesn't parse as a URL", () => {
		const result = validateWebsiteUrl("not a url with spaces");
		expect(result.isValid).toBe(false);
	});
});
