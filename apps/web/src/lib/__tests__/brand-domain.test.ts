import { describe, expect, it } from "vitest";
import { validateBrandDomain } from "@/lib/brand-domain";

describe("validateBrandDomain", () => {
	it("rejects empty input", () => {
		expect(validateBrandDomain("")).toEqual({ isValid: false, error: "Domain is required" });
		expect(validateBrandDomain("   ")).toEqual({ isValid: false, error: "Domain is required" });
	});

	it.each([
		"example.com",
		"www.example.com",
		"https://www.example.com/path",
		"HTTP://Example.COM/",
		"https://example.com/products?ref=foo#section",
		"https://alice:secret@example.com:8080/private",
	])("stores %s as example.com", (input) => {
		expect(validateBrandDomain(input)).toEqual({ isValid: true, domain: "example.com" });
	});

	it("keeps subdomains other than www", () => {
		expect(validateBrandDomain("https://blog.example.com/posts/1")).toEqual({
			isValid: true,
			domain: "blog.example.com",
		});
	});

	it("rejects hostnames without a TLD", () => {
		expect(validateBrandDomain("foo").isValid).toBe(false);
	});

	it("rejects input that doesn't parse as a domain", () => {
		expect(validateBrandDomain("not a url with spaces").isValid).toBe(false);
	});

	it("rejects non-http schemes", () => {
		expect(validateBrandDomain("ftp://example.com").isValid).toBe(false);
	});
});
