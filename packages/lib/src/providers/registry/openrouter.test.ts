import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { openrouter } from "./openrouter";

function stubFetch(overrides: Record<string, unknown> = {}) {
	return stubRawFetch(
		JSON.stringify({
			model: "openai/gpt-5-mini-2025-08-07",
			choices: [{ message: { content: "answer" } }],
			...overrides,
		}),
	);
}

function stubRawFetch(rawResponse: string) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		text: async () => rawResponse,
		json: async () => JSON.parse(rawResponse),
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
	it("caps output tokens for structured research", async () => {
		const fetchMock = stubRawFetch(
			JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "ok" }) } }] }),
		);
		const checkpointResult = vi.fn().mockResolvedValue(undefined);

		const result = await openrouter.runStructuredResearch?.({
			prompt: "prompt",
			schema: z.object({ answer: z.string() }),
			webSearch: false,
			checkpointResult,
		});

		expect(sentBody(fetchMock).max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(checkpointResult).toHaveBeenCalledWith(result);
	});

	it("does not return structured work before its checkpoint succeeds", async () => {
		stubRawFetch(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "ok" }) } }] }));
		const checkpointError = new Error("checkpoint unavailable");

		await expect(
			openrouter.runStructuredResearch?.({
				prompt: "prompt",
				schema: z.object({ answer: z.string() }),
				checkpointResult: vi.fn().mockRejectedValue(checkpointError),
			}),
		).rejects.toBe(checkpointError);
	});

	it("caps output tokens and requests web search via the :online alias", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini:online");
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
	});

	it("caps output tokens and leaves the slug bare when webSearch is off", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.model).toBe("openai/gpt-5-mini");
	});

	it("does not double-append :online when the version already carries it", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini:online" });

		expect(sentBody(fetchMock).model).toBe("openai/gpt-5-mini:online");
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		stubFetch({ choices: [{ message: { content: "clipped" }, finish_reason: "length" }] });

		const result = await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
		// Logged, never thrown — the partial answer still flows through.
		expect(result.textContent).toBe("clipped");
	});

	it("checkpoints the exact raw response before extracting it", async () => {
		const parsedResponse = {
			model: "openai/gpt-5-mini-2025-08-07",
			choices: [{ message: { content: "answer" } }],
		};
		const rawResponse = JSON.stringify(parsedResponse);
		stubRawFetch(rawResponse);
		const checkpointRawResponse = vi.fn();

		const result = await openrouter.run("chatgpt", "prompt", {
			webSearch: false,
			version: "openai/gpt-5-mini",
			checkpointRawResponse,
		});

		expect(checkpointRawResponse).toHaveBeenCalledWith({
			rawOutput: rawResponse,
			modelVersion: "openai/gpt-5-mini",
		});
		expect(result.rawOutput).toEqual(parsedResponse);
	});

	it("checkpoints malformed JSON before parsing fails", async () => {
		stubRawFetch("not valid JSON");
		const checkpointRawResponse = vi.fn();

		await expect(
			openrouter.run("chatgpt", "prompt", {
				webSearch: false,
				version: "openai/gpt-5-mini",
				checkpointRawResponse,
			}),
		).rejects.toThrow(SyntaxError);
		expect(checkpointRawResponse).toHaveBeenCalledWith({
			rawOutput: "not valid JSON",
			modelVersion: "openai/gpt-5-mini",
		});
	});
});
