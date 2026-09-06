/**
 * Contract tests for the two providers that go through the AI SDKs.
 *
 * The other provider tests mock the `ai` package wholesale, so they only assert
 * what we send — a response-shape change in `ai` / `@ai-sdk/*` / `@anthropic-ai/sdk`
 * would silently zero out citations without failing anything. These mock only the
 * *model*, so the real SDK builds the result our extractors then read.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractCitationsFromAnthropic, extractTextFromAnthropic } from "../../text-extraction";
import { anthropicApi } from "./anthropic-api";
import { openaiApi } from "./openai-api";

// Mock only the *model factory*. The real `ai` package runs, so this exercises
// generateText / Output.object / result.sources against the installed SDK.
const model = vi.hoisted(() => ({ current: null as any }));

vi.mock("@ai-sdk/openai", () => {
	const openai: any = (id: string) => model.current;
	openai.responses = () => model.current;
	openai.tools = { webSearch: (o: any) => ({ __webSearch: o }) };
	return { openai, createOpenAI: () => openai };
});

vi.mock("@ai-sdk/anthropic", () => {
	const anthropic: any = (id: string) => model.current;
	anthropic.tools = { webSearch_20250305: (o: any) => ({ __webSearch: o }) };
	return { anthropic, createAnthropic: () => anthropic };
});

vi.mock("../../secrets", () => ({ getCredential: () => "test-key" }));

/** Derived from the mock so it tracks whatever spec version `ai` ships. */
type GenResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

/** Minimal well-typed generate result; callers override what they care about. */
function generated(over: Partial<GenResult>): GenResult {
	return {
		warnings: [],
		finishReason: { unified: "stop", raw: "stop" },
		usage: {
			inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
			outputTokens: { total: 1, text: 1, reasoning: 0 },
		},
		content: [],
		...over,
	};
}

describe("installed ai SDK contract: openai-api run()", () => {
	it("turns SDK url sources into citations and surfaces the web-search query", async () => {
		model.current = new MockLanguageModelV4({
			doGenerate: async () =>
				generated({
					content: [
						{ type: "text", text: "Elmo tracks AI visibility." },
						{
							type: "source",
							sourceType: "url",
							id: "s1",
							url: "https://example.com/a",
							title: "Example A",
						},
						{
							type: "tool-call",
							toolCallId: "t1",
							toolName: "web_search",
							input: JSON.stringify({ query: "elmo aeo" }),
						},
					],
				}),
		});

		const res = await openaiApi.run("chatgpt", "prompt", { webSearch: true, version: "gpt-5-mini" });

		expect(res.textContent).toBe("Elmo tracks AI visibility.");
		expect(res.citations).toEqual([
			{ url: "https://example.com/a", title: "Example A", domain: "example.com", citationIndex: 0 },
		]);
		expect(res.webQueries).toEqual(["elmo aeo"]);
	});
});

describe("installed ai SDK contract: Output.object", () => {
	it("populates result.output with the parsed, schema-validated object", async () => {
		const schema = z.object({ brand: z.string(), competitors: z.array(z.string()) });
		const payload = { brand: "Elmo", competitors: ["a", "b"] };

		model.current = new MockLanguageModelV4({
			doGenerate: async () => generated({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
		});

		const res = await openaiApi.runStructuredResearch!({ prompt: "p", schema, webSearch: false });
		expect(res.object).toEqual(payload);
		expect(res.modelVersion).toBe("gpt-5-mini");
	});
});

// --- Anthropic ---------------------------------------------------------------

const anthropicClient = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
	default: class {
		messages = { create: anthropicClient.create };
	},
}));

// Typed as the SDK's own Message so a shape change fails `tsc`, not just runtime.
const anthropicResponse: Anthropic.Messages.Message = {
	id: "msg_1",
	type: "message",
	role: "assistant",
	model: "claude-sonnet-5",
	stop_reason: "end_turn",
	stop_details: null,
	stop_sequence: null,
	container: null,
	usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Messages.Usage,
	content: [
		{
			type: "server_tool_use",
			id: "srv_1",
			caller: { type: "direct" },
			name: "web_search",
			input: { query: "elmo aeo" },
		},
		{
			type: "web_search_tool_result",
			tool_use_id: "srv_1",
			caller: { type: "direct" },
			content: [
				{
					type: "web_search_result",
					url: "https://example.com/a",
					title: "Example A",
					encrypted_content: "x",
					page_age: null,
				},
			],
		},
		{
			type: "text",
			text: "Elmo tracks AI visibility.",
			citations: [
				{
					type: "web_search_result_location",
					url: "https://example.com/b",
					title: "Example B",
					cited_text: "…",
					encrypted_index: "y",
				},
			],
		},
	],
};

describe("installed @anthropic-ai/sdk contract: anthropic-api run()", () => {
	it("extracts text, both citation shapes, and the web-search query", async () => {
		anthropicClient.create.mockResolvedValue(anthropicResponse);

		const res = await anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-5" });

		expect(res.textContent).toBe("Elmo tracks AI visibility.");
		expect(res.webQueries).toEqual(["elmo aeo"]);
		expect(res.citations.map((c) => c.url)).toEqual(["https://example.com/b", "https://example.com/a"]);
	});

	it("strips web-search page text from rawOutput but keeps url/title", async () => {
		anthropicClient.create.mockResolvedValue(anthropicResponse);

		const res = await anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-5" });
		const block = (res.rawOutput as any).content.find((b: any) => b.type === "web_search_tool_result");

		expect(block.content[0]).toEqual({ type: "web_search_result", url: "https://example.com/a", title: "Example A" });
	});

	it("re-extracts the same values from stored rawOutput", async () => {
		anthropicClient.create.mockResolvedValue(anthropicResponse);
		const res = await anthropicApi.run("claude", "prompt", { webSearch: true, version: "claude-sonnet-5" });

		expect(extractTextFromAnthropic(res.rawOutput)).toBe("Elmo tracks AI visibility.");
		expect(extractCitationsFromAnthropic(res.rawOutput).map((c) => c.url)).toEqual([
			"https://example.com/b",
			"https://example.com/a",
		]);
	});
});

describe("installed ai SDK contract: anthropic Output.object", () => {
	it("populates result.output with the parsed object", async () => {
		const schema = z.object({ brand: z.string() });
		model.current = new MockLanguageModelV4({
			doGenerate: async () => generated({ content: [{ type: "text", text: JSON.stringify({ brand: "Elmo" }) }] }),
		});

		const res = await anthropicApi.runStructuredResearch!({ prompt: "p", schema, webSearch: false });
		expect(res.object).toEqual({ brand: "Elmo" });
	});
});

describe("installed ai SDK contract: finishReason unwrapping", () => {
	// The provider spec models finishReason as { unified, raw }; generateText
	// flattens it to the bare string warnIfOutputCapped compares against. That
	// unwrapping is invisible to tsc here (warnIfOutputCapped takes `unknown`),
	// so assert it directly.
	it("flattens the provider finish reason so the output-cap warning still fires", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		model.current = new MockLanguageModelV4({
			doGenerate: async () =>
				generated({
					finishReason: { unified: "length", raw: "max_output_tokens" },
					content: [{ type: "text" as const, text: "clipped" }],
				}),
		});

		await openaiApi.run("chatgpt", "prompt", { webSearch: false, version: "gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
		warn.mockRestore();
	});
});
