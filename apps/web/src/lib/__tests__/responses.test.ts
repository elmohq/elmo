import { describe, expect, it } from "vitest";
import { SNIPPET_MARK_END, SNIPPET_MARK_START, snippetSegments } from "@/lib/responses";

const mark = (term: string) => `${SNIPPET_MARK_START}${term}${SNIPPET_MARK_END}`;
const render = (snippet: string) =>
	snippetSegments(snippet)
		.map((s) => (s.highlighted ? `<${s.text}>` : s.text))
		.join("");

describe("snippetSegments", () => {
	it("marks the terms the search matched", () => {
		expect(snippetSegments(`Try ${mark("Acme")} for small teams`)).toEqual([
			{ text: "Try ", highlighted: false },
			{ text: "Acme", highlighted: true },
			{ text: " for small teams", highlighted: false },
		]);
	});

	it("reads markdown as plain prose, keeping link labels", () => {
		expect(render(`## Top picks\n\n1. **[${mark("Acme")}](https://acme.com)** — ${mark("recommended")}`)).toBe(
			"Top picks <Acme> — <recommended>",
		);
	});

	it("drops the remains of a link the snippet was cut through", () => {
		expect(render(`best** CRMs](https://example.com/crm) include ${mark("Acme")}`)).toBe("best CRMs include <Acme>");
	});

	it("flattens tables into a line", () => {
		expect(render(`| Tool | Price |\n|---|---|\n| ${mark("Acme")} | $10 |`)).toBe("Tool Price <Acme> $10");
	});

	it("passes through a snippet with no highlights", () => {
		expect(snippetSegments("Plain answer text")).toEqual([{ text: "Plain answer text", highlighted: false }]);
	});
});
