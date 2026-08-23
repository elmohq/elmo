import { describe, expect, it } from "vitest";
import { extractPageMeta, titleFromUrl } from "./html-meta";

describe("extractPageMeta", () => {
	it("reads the title and meta description", () => {
		const html = `<html><head><title>Pricing · Example</title>
			<meta name="description" content="What Example costs."></head><body>…</body></html>`;
		expect(extractPageMeta(html)).toEqual({ title: "Pricing · Example", description: "What Example costs." });
	});

	it("falls back to Open Graph tags", () => {
		const html = `<head><meta property="og:title" content="OG title">
			<meta property="og:description" content="OG description"></head>`;
		expect(extractPageMeta(html)).toEqual({ title: "OG title", description: "OG description" });
	});

	it("prefers the name=description meta over Open Graph", () => {
		const html = `<head><meta property="og:description" content="OG">
			<meta name="description" content="Real"></head>`;
		expect(extractPageMeta(html).description).toBe("Real");
	});

	it("decodes entities and collapses whitespace", () => {
		const html = "<head><title>Tools\n  &amp; toys &#8212; Example</title></head>";
		expect(extractPageMeta(html).title).toBe("Tools & toys — Example");
	});

	it("returns nulls when the page says nothing", () => {
		expect(extractPageMeta("<html><body>hi</body></html>")).toEqual({ title: null, description: null });
	});

	it("treats an empty title as missing", () => {
		expect(extractPageMeta("<head><title>   </title></head>").title).toBeNull();
	});
});

describe("titleFromUrl", () => {
	it("humanizes the last path segment", () => {
		expect(titleFromUrl("https://example.com/blog/ai-crawler-checker")).toBe("Ai crawler checker");
	});

	it("ignores a trailing slash and a file extension", () => {
		expect(titleFromUrl("https://example.com/docs/getting-started/")).toBe("Getting started");
		expect(titleFromUrl("https://example.com/about.html")).toBe("About");
	});

	it("calls the root Home", () => {
		expect(titleFromUrl("https://example.com/")).toBe("Home");
	});
});
