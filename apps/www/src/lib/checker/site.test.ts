import { describe, expect, it } from "vitest";
import { parseHomepage } from "./site";

describe("parseHomepage", () => {
	it("reads the title, description, and JSON-LD types", () => {
		const html = `<html><head>
			<title>Acme &amp; Co &#x2014; Projects</title>
			<meta content="Acme&#x27;s planner for teams." name="description">
			<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
			<script type="application/ld+json">{ not json }</script>
		</head></html>`;
		expect(parseHomepage(html)).toEqual({
			title: "Acme & Co — Projects",
			description: "Acme's planner for teams.",
			structuredDataTypes: ["Organization", "WebSite", "Thing"],
		});
	});

	it("falls back to Open Graph tags", () => {
		const html = `<meta property="og:title" content="Acme"><meta property="og:description" content="Planner">`;
		expect(parseHomepage(html)).toMatchObject({ title: "Acme", description: "Planner", structuredDataTypes: [] });
	});
});
