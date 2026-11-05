import { describe, expect, it } from "vitest";
import { buildBrandDomainIndex, domainForName, faviconUrl, isLightMark, upstreamFaviconUrl } from "@/lib/site-icon";

const iconParams = (url: string | null) => new URL(url!, "https://app.test").searchParams;

describe("faviconUrl", () => {
	it("loads the icon through our own origin so its pixels can be read", () => {
		const url = new URL(faviconUrl("example.com")!, "https://app.test");
		expect(url.origin).toBe("https://app.test");
		expect(url.searchParams.get("domain")).toBe("example.com");
	});

	it("reduces a full website URL to its site", () => {
		expect(iconParams(faviconUrl("https://www.nike.com/golf?x=1")).get("domain")).toBe("nike.com");
	});

	it("asks for one size unless told otherwise", () => {
		expect(iconParams(faviconUrl("example.com")).get("size")).toBe("64");
	});

	it("rounds the requested size up to one the service renders", () => {
		expect(iconParams(faviconUrl("example.com", 20)).get("size")).toBe("32");
		expect(iconParams(faviconUrl("example.com", 64)).get("size")).toBe("64");
		expect(iconParams(faviconUrl("example.com", 9999)).get("size")).toBe("256");
	});

	it("has no URL for input that isn't a domain", () => {
		expect(faviconUrl("")).toBeNull();
		expect(faviconUrl(null)).toBeNull();
		expect(faviconUrl("not a domain")).toBeNull();
	});
});

describe("upstreamFaviconUrl", () => {
	it("asks the icon service for the site behind a domain", () => {
		const url = new URL(upstreamFaviconUrl("example.com", 64));
		expect(url.origin + url.pathname).toBe("https://t1.gstatic.com/faviconV2");
		expect(url.searchParams.get("url")).toBe("https://example.com");
		expect(url.searchParams.get("size")).toBe("64");
	});
});

type Pixel = [number, number, number, number];

function icon(mark: Pixel, markShare: number, rest: Pixel = [0, 0, 0, 0]): number[] {
	const pixels = 100;
	return Array.from({ length: pixels }, (_, i) => (i < pixels * markShare ? mark : rest)).flat();
}

const WHITE: Pixel = [255, 255, 255, 255];
const BLACK: Pixel = [0, 0, 0, 255];
const BLUE: Pixel = [37, 99, 235, 255];

describe("isLightMark", () => {
	it("flags a white mark on transparency, which vanishes on our light pages", () => {
		expect(isLightMark(icon(WHITE, 0.4))).toBe(true);
	});

	it("leaves dark and colored marks alone, since they read on a light page", () => {
		expect(isLightMark(icon(BLACK, 0.3))).toBe(false);
		expect(isLightMark(icon(BLUE, 0.4))).toBe(false);
	});

	it("leaves icons that bring their own background alone", () => {
		expect(isLightMark(icon(WHITE, 1))).toBe(false);
		expect(isLightMark(icon(BLACK, 0.7, WHITE))).toBe(false);
	});

	it("has nothing to flag in a fully transparent image", () => {
		expect(isLightMark(icon(WHITE, 0))).toBe(false);
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
