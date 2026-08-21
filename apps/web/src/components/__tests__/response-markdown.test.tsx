/**
 * Every provider stores its answers in a different shape, and each one reaches
 * the prompt detail page through `extractTextContent` before it is rendered.
 * A provider whose extraction hands back flattened text or glued-together
 * blocks looks identical to a broken renderer from the page's side, so the two
 * halves are checked together here rather than in isolation.
 *
 * The shapes mirror the fixtures in each provider's own tests in
 * `packages/lib/src/providers/registry`.
 */
import { extractTextContent } from "@workspace/lib/text-extraction";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponseMarkdown } from "@/components/response-markdown";

const PROSE = "Here are the **top** trackers:";
const TABLE = "| Tool | Price |\n| --- | --- |\n| Profound | $99 |";
const ANSWER = `${PROSE}\n\n${TABLE}`;

const render = (rawOutput: unknown, provider: string) =>
	renderToStaticMarkup(<ResponseMarkdown>{extractTextContent(rawOutput, provider)}</ResponseMarkdown>);

/** One answer, one shape per provider surface. */
const SURFACES: [name: string, provider: string, rawOutput: unknown][] = [
	["openai-api", "openai-api", { output: [{ type: "message", content: [{ type: "output_text", text: ANSWER }] }] }],
	["anthropic-api", "anthropic-api", { content: [{ type: "text", text: ANSWER }] }],
	["mistral-api", "mistral-api", { outputs: [{ content: [{ type: "text", text: ANSWER }] }] }],
	["openrouter", "openrouter", { choices: [{ message: { content: ANSWER } }] }],
	["olostep", "olostep", { json_content: JSON.stringify({ result: { markdown_content: ANSWER } }) }],
	["brightdata chatbot", "brightdata", [{ answer_text_markdown: ANSWER, answer_text: "flattened" }]],
	["brightdata AI Overview", "brightdata", [{ ai_overview: { markdown: ANSWER } }]],
	["oxylabs ChatGPT", "oxylabs", { results: [{ content: { markdown_text: ANSWER } }] }],
	["oxylabs Perplexity", "oxylabs", { results: [{ content: { answer_results_md: ANSWER } }] }],
	["cloro chatbot", "cloro", { text: ANSWER }],
	["cloro AI Overview", "cloro", { aioverview: { markdown: ANSWER, text: "flattened" } }],
	["dataforseo scraper", "dataforseo", { tasks: [{ result: [{ markdown: ANSWER, sources: [] }] }] }],
	[
		"dataforseo LLM Responses",
		"dataforseo",
		{ tasks: [{ result: [{ items: [{ type: "message", sections: [{ type: "text", text: ANSWER }] }] }] }] },
	],
	[
		"dataforseo AI Overview",
		"dataforseo",
		{ tasks: [{ result: [{ items: [{ type: "ai_overview", markdown: ANSWER }] }] }] },
	],
	// Rows written before the provider column existed dispatch on the model.
	[
		"legacy row without a provider",
		"chatgpt",
		{ output: [{ type: "message", content: [{ type: "output_text", text: ANSWER }] }] },
	],
];

describe("answer rendering across providers", () => {
	it.each(SURFACES)("renders %s answers as markdown", (_name, provider, rawOutput) => {
		const html = render(rawOutput, provider);
		expect(html).toContain("<table>");
		expect(html).toContain("<strong>top</strong>");
		expect(html).not.toContain("flattened");
	});

	/**
	 * These three surfaces arrive as a list of blocks rather than one string.
	 * Joined with a single newline they render as one run-on paragraph, which
	 * is what the extraction's blank-line join exists to prevent.
	 */
	it.each([
		[
			"brightdata AI Overview",
			"brightdata",
			[{ ai_overview: { texts: [{ snippet: "First." }, { snippet: "Second." }] } }],
		],
		[
			"dataforseo scraper items",
			"dataforseo",
			{ tasks: [{ result: [{ sources: [], items: [{ markdown: "First." }, { markdown: "Second." }] }] }] },
		],
		[
			"oxylabs AI Overview",
			"oxylabs",
			{
				results: [
					{ content: { ai_overviews: [{ answer_text: [{ fragments: [{ text: "First." }, { text: "Second." }] }] }] } },
				],
			},
		],
	])("keeps %s blocks as separate paragraphs", (_name, provider, rawOutput) => {
		expect(render(rawOutput, provider).match(/<p>/g)).toHaveLength(2);
	});

	it("does not load relative or protocol-relative images", () => {
		const html = renderToStaticMarkup(
			<ResponseMarkdown>{`![remote](https://images.example/favicon.png)

![root relative](/api/session)

![path relative](./pixel.png)

![protocol relative](//tracker.example/pixel.png)`}</ResponseMarkdown>,
		);

		expect(html.match(/<img /g)).toHaveLength(1);
		expect(html).toContain('src="https://images.example/favicon.png"');
		expect(html).toContain('loading="lazy"');
		expect(html).toContain('referrerPolicy="no-referrer"');
		expect(html).not.toContain("/api/session");
		expect(html).not.toContain("tracker.example");
	});
});
