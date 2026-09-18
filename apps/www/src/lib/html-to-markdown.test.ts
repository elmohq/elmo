import { describe, expect, it } from "vitest";
import { estimateTokens, htmlToMarkdown } from "./html-to-markdown";

const PAGE_URL = "https://www.elmohq.com/pricing";

function page(body: string, head = "<title>Pricing · Elmo</title>"): string {
	return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

describe("htmlToMarkdown", () => {
	it("converts the page's main content", () => {
		const markdown = htmlToMarkdown(
			page(
				"<header>Nav</header><main><h1>Pricing</h1><p>Cloud from <strong>$29</strong>.</p></main><footer>©</footer>",
			),
			PAGE_URL,
		);

		expect(markdown).toBe("# Pricing\n\nCloud from **$29**.");
	});

	it("falls back to the body when the page has no main element", () => {
		expect(htmlToMarkdown(page("<div><h1>Roadmap</h1></div>"), PAGE_URL)).toBe("# Roadmap");
	});

	it("keeps lists and tables readable", () => {
		const markdown = htmlToMarkdown(
			page(
				"<main><ul><li>ChatGPT</li><li>Perplexity</li></ul><table><tr><th>Model</th></tr><tr><td>Gemini</td></tr></table></main>",
			),
			PAGE_URL,
		);

		expect(markdown).toContain("- ChatGPT\n- Perplexity");
		expect(markdown).toContain("| Model  |\n| ------ |\n| Gemini |");
	});

	it("drops scripts, styles, and decorative nodes", () => {
		const markdown = htmlToMarkdown(
			page(
				`<main><script>alert(1)</script><style>a{}</style><div aria-hidden="true">grid</div><svg><title>icon</title></svg><p>Real copy.</p></main>`,
			),
			PAGE_URL,
		);

		expect(markdown).toBe("# Pricing · Elmo\n\nReal copy.");
	});

	it("joins text the renderer split with empty comments", () => {
		const markdown = htmlToMarkdown(page("<main><h1>H</h1><p>from $<!-- -->29<!-- -->/mo</p></main>"), PAGE_URL);

		expect(markdown).toBe("# H\n\nfrom $29/mo");
	});

	it("rewrites site-relative links and images to absolute URLs", () => {
		const markdown = htmlToMarkdown(
			page(`<main><a href="/docs">Docs</a> <a href="https://github.com/elmohq/elmo">Source</a></main>`),
			PAGE_URL,
		);

		expect(markdown).toContain("[Docs](https://www.elmohq.com/docs)");
		expect(markdown).toContain("[Source](https://github.com/elmohq/elmo)");
	});

	it("leaves protocol-relative URLs alone", () => {
		const markdown = htmlToMarkdown(page(`<main><a href="//cdn.example.com/a.png">CDN</a></main>`), PAGE_URL);

		expect(markdown).toContain("(//cdn.example.com/a.png)");
	});

	it("uses the document title when the content has no heading of its own", () => {
		expect(htmlToMarkdown(page("<main><p>Body copy.</p></main>"), PAGE_URL)).toBe("# Pricing · Elmo\n\nBody copy.");
	});

	it("does not add a title when the content already has a heading", () => {
		const markdown = htmlToMarkdown(page("<main><h1>Own heading</h1><p>Body.</p></main>"), PAGE_URL);

		expect(markdown).toBe("# Own heading\n\nBody.");
	});
});

describe("estimateTokens", () => {
	it("scales with the length of the document", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("a".repeat(400))).toBe(100);
	});
});
