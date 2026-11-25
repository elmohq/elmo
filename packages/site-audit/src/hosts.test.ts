import { describe, expect, it } from "vitest";
import { homepageUrl, normalizeHost } from "./hosts";

describe("normalizeHost", () => {
	it("lowercases and trims bare domains and strips leading www.", () => {
		expect(normalizeHost("example.com")).toBe("example.com");
		expect(normalizeHost("Example.COM")).toBe("example.com");
		expect(normalizeHost("  example.com  ")).toBe("example.com");
		expect(normalizeHost("www.example.com")).toBe("example.com");
		expect(normalizeHost("WWW.Example.com")).toBe("example.com");
	});

	it("drops path, query, hash, port, and credentials from full URLs", () => {
		expect(normalizeHost("https://www.example.com/pricing?plan=pro#faq")).toBe("example.com");
		expect(normalizeHost("HTTPS://WWW.EXAMPLE.COM")).toBe("example.com");
		expect(normalizeHost("https://example.com:8080/x")).toBe("example.com");
		expect(normalizeHost("https://user:pass@www.example.com/")).toBe("example.com");
	});

	it("keeps subdomains other than a leading www.", () => {
		expect(normalizeHost("http://blog.example.com")).toBe("blog.example.com");
		expect(normalizeHost("www2.example.com")).toBe("www2.example.com");
		expect(normalizeHost("sub.www.example.com")).toBe("sub.www.example.com");
	});

	it("falls back to trimming, lowercasing, and stripping www. for invalid URLs", () => {
		expect(normalizeHost("  WWW.Not A Domain ")).toBe("not a domain");
	});
});

describe("homepageUrl", () => {
	it("assumes https when no scheme is given and keeps www.", () => {
		expect(homepageUrl("example.com")).toBe("https://example.com/");
		expect(homepageUrl("www.example.com/pricing?x=1")).toBe("https://www.example.com/");
	});

	it("preserves explicit http scheme, non-default ports, and strips path and credentials", () => {
		expect(homepageUrl("http://example.com/a")).toBe("http://example.com/");
		expect(homepageUrl("https://example.com:8443/path")).toBe("https://example.com:8443/");
		expect(homepageUrl("  https://Example.com/a  ")).toBe("https://example.com/");
		expect(homepageUrl("https://user:pass@example.com/x")).toBe("https://example.com/");
	});

	it("throws for input that isn't a valid URL", () => {
		expect(() => homepageUrl("")).toThrow();
		expect(() => homepageUrl("not a domain")).toThrow();
	});
});
