import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { mistralApi } from "./mistral-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["mistral-api"];

function stubFetch(json: unknown) {
	return stubRawFetch(JSON.stringify(json));
}

function stubRawFetch(rawResponse: string) {
	const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => rawResponse });
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const [, init] = fetchMock.mock.calls[0];
	return JSON.parse((init as RequestInit).body as string);
}

function calledUrl(fetchMock: ReturnType<typeof vi.fn>): string {
	return fetchMock.mock.calls[0][0] as string;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("mistral-api run", () => {
	it("caps structured output tokens on the non-web path", async () => {
		const fetchMock = stubFetch({ choices: [{ message: { content: JSON.stringify({ answer: "ok" }) } }] });
		const checkpointResult = vi.fn().mockResolvedValue(undefined);

		const result = await mistralApi.runStructuredResearch?.({
			prompt: "prompt",
			schema: z.object({ answer: z.string() }),
			webSearch: false,
			checkpointResult,
		});

		expect(calledUrl(fetchMock)).toContain("/v1/chat/completions");
		expect(sentBody(fetchMock).max_tokens).toBe(CAP);
		expect(checkpointResult).toHaveBeenCalledWith(result);
	});

	it("does not return structured work before its checkpoint succeeds", async () => {
		stubFetch({ outputs: [{ type: "message", content: JSON.stringify({ answer: "ok" }) }] });
		const checkpointError = new Error("checkpoint unavailable");

		await expect(
			mistralApi.runStructuredResearch?.({
				prompt: "prompt",
				schema: z.object({ answer: z.string() }),
				checkpointResult: vi.fn().mockRejectedValue(checkpointError),
			}),
		).rejects.toBe(checkpointError);
	});

	it("caps structured output tokens on the web-search path", async () => {
		const fetchMock = stubFetch({ outputs: [{ type: "message", content: JSON.stringify({ answer: "ok" }) }] });
		const checkpointResult = vi.fn().mockResolvedValue(undefined);

		const result = await mistralApi.runStructuredResearch?.({
			prompt: "prompt",
			schema: z.object({ answer: z.string() }),
			webSearch: true,
			checkpointResult,
		});

		expect(calledUrl(fetchMock)).toContain("/v1/conversations");
		expect((sentBody(fetchMock).completion_args as Record<string, unknown>).max_tokens).toBe(CAP);
		expect(checkpointResult).toHaveBeenCalledWith(result);
	});

	it("caps output tokens and keeps the web_search tool on the web path", async () => {
		const fetchMock = stubFetch({ model: "mistral-medium-latest", outputs: [] });

		await mistralApi.run("mistral", "prompt", { webSearch: true, version: "mistral-medium-latest" });

		expect(calledUrl(fetchMock)).toContain("/v1/conversations");
		const body = sentBody(fetchMock);
		expect(body.tools).toEqual([{ type: "web_search" }]);
		expect(body.completion_args).toEqual({ max_tokens: CAP });
	});

	it("caps output tokens on the non-web chat-completions path", async () => {
		const fetchMock = stubFetch({ model: "mistral-medium-latest", choices: [{ message: { content: "answer" } }] });

		await mistralApi.run("mistral", "prompt", { webSearch: false, version: "mistral-medium-latest" });

		expect(calledUrl(fetchMock)).toContain("/v1/chat/completions");
		expect(sentBody(fetchMock).max_tokens).toBe(CAP);
	});

	it("checkpoints the exact raw response before extracting it", async () => {
		const rawResponse = JSON.stringify({
			model: "mistral-medium-latest",
			outputs: [{ type: "message", content: "answer" }],
		});
		stubRawFetch(rawResponse);
		const checkpointRawResponse = vi.fn();

		const result = await mistralApi.run("mistral", "prompt", {
			webSearch: true,
			version: "mistral-medium-latest",
			checkpointRawResponse,
		});

		expect(checkpointRawResponse).toHaveBeenCalledWith({
			rawOutput: rawResponse,
			modelVersion: "mistral-medium-latest",
		});
		expect(result.rawOutput).toEqual(JSON.parse(rawResponse));
	});

	it("checkpoints malformed JSON before parsing fails", async () => {
		stubRawFetch("not valid JSON");
		const checkpointRawResponse = vi.fn();

		await expect(
			mistralApi.run("mistral", "prompt", {
				webSearch: false,
				version: "mistral-medium-latest",
				checkpointRawResponse,
			}),
		).rejects.toThrow(SyntaxError);
		expect(checkpointRawResponse).toHaveBeenCalledWith({
			rawOutput: "not valid JSON",
			modelVersion: "mistral-medium-latest",
		});
	});
});
