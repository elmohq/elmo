import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractRun } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { openrouter } from "./openrouter";

/** What a run stores: extraction reads the payload, so a provider is right only if its payload yields this. */
const stored = (result: { rawOutput: unknown }) => extractRun(result.rawOutput, "openrouter");

function stubFetch(overrides: Record<string, unknown> = {}) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({
			model: "openai/gpt-5-mini-2025-08-07",
			choices: [{ message: { content: "answer" } }],
			...overrides,
		}),
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const [, init] = fetchMock.mock.calls[0];
	return JSON.parse((init as RequestInit).body as string);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("openrouter run", () => {
	it("caps output tokens and requests web search through OpenRouter's web search tool", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini");
		expect(body.tools).toEqual([{ type: "openrouter:web_search" }]);
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
	});

	it("caps output tokens and sends no search tool when webSearch is off", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini");
		expect(body.tools).toBeUndefined();
	});

	it("drops a deprecated :online suffix left on the version", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini:online" });

		const body = sentBody(fetchMock);
		expect(body.model).toBe("openai/gpt-5-mini");
		expect(body.tools).toEqual([{ type: "openrouter:web_search" }]);
	});

	it("leaves Perplexity, which searches on every request, without a search tool", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("perplexity", "prompt", { webSearch: true, version: "perplexity/sonar" });

		const body = sentBody(fetchMock);
		expect(body.model).toBe("perplexity/sonar");
		expect(body.tools).toBeUndefined();
	});

	it("reads back the answer and citations a grounded run returns", async () => {
		stubFetch({
			choices: [
				{
					message: {
						content: "Acme leads.",
						annotations: [
							{ type: "url_citation", url_citation: { url: "https://example.com/review", title: "Review" } },
						],
					},
				},
			],
		});

		const result = await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini" });

		expect(stored(result).textContent).toBe("Acme leads.");
		expect(stored(result).citations.map((citation) => citation.url)).toEqual(["https://example.com/review"]);
	});

	it("runs Grok at minimal reasoning effort to hold down the cost of a grounded answer", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("grok", "prompt", { webSearch: true, version: "x-ai/grok-4.7" });

		expect(sentBody(fetchMock).reasoning).toEqual({ effort: "minimal" });
	});

	it("leaves reasoning effort to the model's default elsewhere", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("claude", "prompt", { webSearch: true, version: "anthropic/claude-haiku-5.5" });

		expect(sentBody(fetchMock).reasoning).toBeUndefined();
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		stubFetch({ choices: [{ message: { content: "clipped" }, finish_reason: "length" }] });

		const result = await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
		// Logged, never thrown — the partial answer still flows through.
		expect(stored(result).textContent).toBe("clipped");
	});
});

describe("openrouter structured research", () => {
	it("searches with Anthropic's native web search on the one host that enforces the schema", async () => {
		const fetchMock = stubFetch({ choices: [{ message: { content: JSON.stringify({ name: "Acme" }) } }] });

		const result = await openrouter.runStructuredResearch!({
			prompt: "research",
			schema: z.object({ name: z.string() }),
		});

		expect(result.object).toEqual({ name: "Acme" });
		const body = sentBody(fetchMock);
		expect(body.tools).toEqual([{ type: "openrouter:web_search", parameters: { engine: "native" } }]);
		expect(body.provider).toEqual({ only: ["anthropic"] });
		expect(body.plugins).toBeUndefined();
	});

	it("doesn't search when research doesn't need the web", async () => {
		const fetchMock = stubFetch({ choices: [{ message: { content: JSON.stringify({ name: "Acme" }) } }] });

		await openrouter.runStructuredResearch!({
			prompt: "summarize",
			schema: z.object({ name: z.string() }),
			webSearch: false,
		});

		const body = sentBody(fetchMock);
		expect(body.tools).toBeUndefined();
		expect(body.provider).toBeUndefined();
	});
});
