import { describe, expect, it } from "vitest";
import { buildLlmsTxt, groupPages } from "./llms-txt";

const page = (url: string, title: string | null = null, description: string | null = null) => ({
	url,
	title,
	description,
});

describe("groupPages", () => {
	it("puts top-level pages under Main and the rest under their first path segment", () => {
		const sections = groupPages([
			page("https://example.com/"),
			page("https://example.com/pricing"),
			page("https://example.com/blog/one"),
			page("https://example.com/blog/two"),
		]);

		expect(sections.map((section) => section.name)).toEqual(["Main", "Blog"]);
		expect(sections[1].pages).toHaveLength(2);
	});

	it("orders sections by size after Main", () => {
		const sections = groupPages([
			page("https://example.com/guides/a"),
			page("https://example.com/blog/a"),
			page("https://example.com/blog/b"),
		]);
		expect(sections.map((section) => section.name)).toEqual(["Blog", "Guides"]);
	});

	it("humanizes an unfamiliar path segment", () => {
		const sections = groupPages([page("https://example.com/case-studies/acme")]);
		expect(sections[0].name).toBe("Case Studies");
	});
});

describe("buildLlmsTxt", () => {
	it("writes the site name, summary, and annotated sections", () => {
		const output = buildLlmsTxt({
			siteName: "Example",
			siteDescription: "A site about examples.",
			pages: [
				page("https://example.com/", "Example — Home", "The homepage."),
				page("https://example.com/blog/hello", "Hello world", "Our first post."),
			],
		});

		expect(output).toBe(
			[
				"# Example",
				"",
				"> A site about examples.",
				"",
				"## Main",
				"",
				"- [Example — Home](https://example.com/): The homepage.",
				"",
				"## Blog",
				"",
				"- [Hello world](https://example.com/blog/hello): Our first post.",
				"",
			].join("\n"),
		);
	});

	it("omits the blockquote when the site has no description", () => {
		const output = buildLlmsTxt({ siteName: "Example", siteDescription: null, pages: [page("https://example.com/")] });
		expect(output).not.toContain(">");
	});

	it("falls back to a slug-derived title for a page it could not read", () => {
		const output = buildLlmsTxt({
			siteName: "Example",
			siteDescription: null,
			pages: [page("https://example.com/docs/getting-started")],
		});
		expect(output).toContain("- [Getting started](https://example.com/docs/getting-started)\n");
	});

	it("truncates a long description to one line", () => {
		const output = buildLlmsTxt({
			siteName: "Example",
			siteDescription: null,
			pages: [page("https://example.com/a", "A", `${"word ".repeat(60)}\nsecond line`)],
		});

		const entry = output.split("\n").find((line) => line.startsWith("- [A]"));
		expect(entry).toBeDefined();
		expect(entry).toContain("…");
		expect(entry?.length).toBeLessThan(220);
	});
});
