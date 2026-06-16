import { describe, expect, it } from "vitest";
import { buildEvalReportHtml, type EvalReport } from "./report-html";

function makeReport(overrides: Partial<EvalReport> = {}): EvalReport {
	return {
		brandName: "Nike",
		generatedAt: "2026-06-16T00:00:00.000Z",
		runsPerTarget: 1,
		targetLabels: ["chatgpt:brightdata:online"],
		overallSov: 60,
		competitorSov: [{ name: "Adidas", sov: 40, mentionCount: 2 }],
		totals: { prompts: 1, targets: 1, responses: 1, citations: 1, fanoutQueries: 1 },
		prompts: [
			{
				index: 1,
				prompt: "best running shoes",
				tags: ["footwear"],
				sov: 60,
				targets: [
					{
						label: "chatgpt:brightdata:online",
						model: "chatgpt",
						provider: "brightdata",
						runs: [
							{
								runIndex: 1,
								responseMarkdown: "**Nike** is great <script>alert(1)</script>",
								brandMentioned: true,
								competitorsMentioned: ["Adidas"],
								citations: [{ url: "https://nike.com", title: "Nike", domain: "nike.com", citationIndex: 0 }],
								webQueries: ["best running shoes 2026"],
							},
						],
					},
				],
			},
		],
		...overrides,
	};
}

describe("buildEvalReportHtml", () => {
	it("produces a self-contained document with no external resources", () => {
		const html = buildEvalReportHtml(makeReport());
		expect(html.startsWith("<!doctype html>")).toBe(true);
		expect(html).toContain("<style>");
		expect(html).toContain("</script>");
		// no CDN/network references
		expect(html).not.toMatch(/https?:\/\/[^"']*\.(js|css)/);
		expect(html).toContain('id="filter"');
	});

	it("renders response markdown to HTML and strips active content", () => {
		const html = buildEvalReportHtml(makeReport());
		expect(html).toContain("<strong>Nike</strong>");
		// the injected <script> from the response body is stripped
		expect(html).not.toContain("alert(1)");
	});

	it("includes citations, fan-out queries, and share-of-voice", () => {
		const html = buildEvalReportHtml(makeReport());
		expect(html).toContain("https://nike.com");
		expect(html).toContain("best running shoes 2026");
		expect(html).toContain("Adidas");
	});

	it("notes when no brand context was supplied", () => {
		const html = buildEvalReportHtml(makeReport({ overallSov: null, competitorSov: [] }));
		expect(html).toContain("share of voice not computed");
	});
});
