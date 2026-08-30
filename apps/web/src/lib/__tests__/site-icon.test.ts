import { describe, expect, it } from "vitest";
import { buildBrandDomainIndex, domainForName, faviconUrl } from "@/lib/site-icon";

describe("faviconUrl", () => {
	it("asks the icon service for the site behind a bare domain", () => {
		const url = new URL(faviconUrl("example.com")!);
		expect(url.origin + url.pathname).toBe("https://t1.gstatic.com/faviconV2");
		expect(url.searchParams.get("url")).toBe("https://example.com");
	});

	it("reduces a full website URL to its site", () => {
		expect(new URL(faviconUrl("https://www.nike.com/golf?x=1")!).searchParams.get("url")).toBe("https://nike.com");
	});

	it("asks for one size unless told otherwise", () => {
		expect(new URL(faviconUrl("example.com")!).searchParams.get("size")).toBe("64");
	});

	it("rounds the requested size up to one the service renders", () => {
		expect(new URL(faviconUrl("example.com", 20)!).searchParams.get("size")).toBe("32");
		expect(new URL(faviconUrl("example.com", 64)!).searchParams.get("size")).toBe("64");
		expect(new URL(faviconUrl("example.com", 9999)!).searchParams.get("size")).toBe("256");
	});

	it("has no URL for input that isn't a domain", () => {
		expect(faviconUrl("")).toBeNull();
		expect(faviconUrl(null)).toBeNull();
		expect(faviconUrl("not a domain")).toBeNull();
	});
});

describe("buildBrandDomainIndex", () => {
	const index = buildBrandDomainIndex([
		{ name: "Nike", domains: ["https://www.nike.com/golf"], aliases: ["Nike Golf"] },
		{ name: "Adidas", domains: ["", "adidas.com"] },
		{ name: "Unknown Co", domains: [] },
	]);

	it("resolves a name to its icon domain", () => {
		expect(domainForName(index, "Nike")).toBe("nike.com");
	});

	it("resolves aliases the AI answers use", () => {
		expect(domainForName(index, "Nike Golf")).toBe("nike.com");
	});

	it("matches regardless of case and surrounding space", () => {
		expect(domainForName(index, "  nike  ")).toBe("nike.com");
	});

	it("skips domain entries that don't parse", () => {
		expect(domainForName(index, "Adidas")).toBe("adidas.com");
	});

	it("has nothing for a subject with no usable domain", () => {
		expect(domainForName(index, "Unknown Co")).toBeUndefined();
		expect(domainForName(index, "Puma")).toBeUndefined();
		expect(domainForName(index, undefined)).toBeUndefined();
	});

	it("keeps the first subject's domain when two share a name", () => {
		const contested = buildBrandDomainIndex([
			{ name: "Acme", domains: ["acme.com"] },
			{ name: "Acme", domains: ["acme-competitor.com"] },
		]);
		expect(domainForName(contested, "Acme")).toBe("acme.com");
	});
});
