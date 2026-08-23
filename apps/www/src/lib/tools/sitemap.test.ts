import { describe, expect, it } from "vitest";
import { canonicalizeUrl, isContentUrl, parseSitemap } from "./sitemap";

describe("parseSitemap", () => {
	it("reads page URLs from a urlset", () => {
		const xml = `<?xml version="1.0"?>
			<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
				<url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
				<url><loc>https://example.com/blog/hello</loc></url>
			</urlset>`;
		expect(parseSitemap(xml)).toEqual({
			urls: ["https://example.com/", "https://example.com/blog/hello"],
			sitemaps: [],
		});
	});

	it("reads child sitemaps from an index", () => {
		const xml = `<sitemapindex>
				<sitemap><loc>https://example.com/posts.xml</loc></sitemap>
				<sitemap><loc>https://example.com/pages.xml</loc></sitemap>
			</sitemapindex>`;
		expect(parseSitemap(xml).sitemaps).toEqual(["https://example.com/posts.xml", "https://example.com/pages.xml"]);
	});

	it("unwraps CDATA and namespace prefixes are not required", () => {
		const xml = "<urlset><url><loc><![CDATA[https://example.com/a]]></loc></url></urlset>";
		expect(parseSitemap(xml).urls).toEqual(["https://example.com/a"]);
	});

	it("returns nothing for a non-sitemap body", () => {
		expect(parseSitemap("<html><body>Not found</body></html>")).toEqual({ urls: [], sitemaps: [] });
	});
});

describe("isContentUrl", () => {
	const origin = "https://example.com";

	it("keeps same-origin pages", () => {
		expect(isContentUrl("https://example.com/blog/post", origin)).toBe(true);
	});

	it("drops other origins, including the www variant", () => {
		expect(isContentUrl("https://other.com/page", origin)).toBe(false);
		expect(isContentUrl("https://www.example.com/page", origin)).toBe(false);
	});

	it("drops assets that are not pages", () => {
		expect(isContentUrl("https://example.com/logo.png", origin)).toBe(false);
		expect(isContentUrl("https://example.com/feed.xml", origin)).toBe(false);
		expect(isContentUrl("https://example.com/app.js", origin)).toBe(false);
	});

	it("drops anything unparseable", () => {
		expect(isContentUrl("not-a-url", origin)).toBe(false);
	});
});

describe("canonicalizeUrl", () => {
	it("drops the query and fragment and the trailing slash", () => {
		expect(canonicalizeUrl("https://example.com/blog/?utm_source=x#top")).toBe("https://example.com/blog");
	});

	it("leaves the root path alone", () => {
		expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
	});
});
