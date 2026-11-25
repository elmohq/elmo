import { describe, expect, it } from "vitest";
import { parsePage } from "./html";
import { markdownLinks } from "./markdown";
import { parseRobots } from "./robots";
import { parseSitemap } from "./sitemap";

describe("parseSitemap", () => {
	it("reads entries from a urlset, including prefixed tags, CDATA, and entities", () => {
		const xml = `<?xml version="1.0"?>
<ns:urlset xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <ns:url><ns:loc>https://example.com/a?x=1&amp;y=2</ns:loc><ns:lastmod>2026-01-01</ns:lastmod></ns:url>
  <url><loc><![CDATA[https://example.com/b]]></loc></url>
</ns:urlset>`;

		expect(parseSitemap(xml)).toEqual({
			kind: "urlset",
			entries: [
				{ loc: "https://example.com/a?x=1&y=2", lastmod: "2026-01-01" },
				{ loc: "https://example.com/b", lastmod: undefined },
			],
		});
	});

	it("reads the child sitemaps of an index", () => {
		const xml = "<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>";

		expect(parseSitemap(xml)).toMatchObject({ kind: "index", entries: [{ loc: "https://example.com/s1.xml" }] });
	});

	it("rejects a document that isn't a sitemap", () => {
		expect(parseSitemap("<html><body>Not found</body></html>").kind).toBe("invalid");
	});

	it("parses a crafted sitemap of unclosed entries in linear time", { timeout: 30_000 }, () => {
		const xml = `<urlset>${"<url>".repeat(1_000_000)}`;
		const started = performance.now();

		parseSitemap(xml);

		// Linear parsing takes well under a second; quadratic parsing of this input would take hours, so the budget
		// can be wide enough that a loaded runner never trips it.
		expect(performance.now() - started).toBeLessThan(10_000);
	});
});

describe("markdownLinks", () => {
	it("finds links quickly even in a long run of unclosed brackets", () => {
		const started = performance.now();

		const links = markdownLinks(`${"[".repeat(200_000)}[Docs](https://example.com/docs)`);

		expect(links.at(-1)?.url).toBe("https://example.com/docs");
		expect(performance.now() - started).toBeLessThan(2000);
	});
});

describe("parseRobots", () => {
	it("reads directives quickly even from a very long line", () => {
		const text = `User-agent: *\nContent-Signal: search=yes${" ".repeat(400_000)}x\nSchemamap: https://example.com/feed\n`;
		const started = performance.now();

		const robots = parseRobots("https://example.com/robots.txt", text);

		expect(robots.schemamaps).toEqual(["https://example.com/feed"]);
		expect(robots.userAgents).toEqual(["*"]);
		expect(performance.now() - started).toBeLessThan(2000);
	});
});

describe("parsePage", () => {
	it("counts labeled and unlabeled form controls", () => {
		const page = parsePage(
			"https://example.com/",
			'<label for="email">Email</label><input id="email"><input id="phone"><label><input> Name</label>',
		);
		expect(page.controls.formControls).toBe(3);
		expect(page.controls.labeledFormControls).toBe(2);
	});
});
