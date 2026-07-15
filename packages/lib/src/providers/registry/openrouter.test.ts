import { afterEach, describe, expect, it, vi } from "vitest";
import { API_PROVIDER_MAX_OUTPUT_TOKENS, OPENROUTER_WEB_MAX_RESULTS } from "../config";
import { openrouter } from "./openrouter";

function stubFetch() {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({
			model: "openai/gpt-5-mini-2025-08-07",
			choices: [{ message: { content: "answer" } }],
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
});

describe("openrouter run", () => {
	it("caps output tokens and requests the capped exa web plugin when webSearch is on", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.plugins).toEqual([{ id: "web", engine: "exa", max_results: OPENROUTER_WEB_MAX_RESULTS }]);
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
	});

	it("sends no plugins when webSearch is off", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		const body = sentBody(fetchMock);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body).not.toHaveProperty("plugins");
	});

	it("strips a trailing :online from the version slug instead of forwarding it", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini:online" });

		const body = sentBody(fetchMock);
		expect(body.model).toBe("openai/gpt-5-mini");
		expect(body.plugins).toEqual([{ id: "web", engine: "exa", max_results: OPENROUTER_WEB_MAX_RESULTS }]);
	});

	it("never appends :online for web-search runs", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5-mini:free" });

		expect(sentBody(fetchMock).model).toBe("openai/gpt-5-mini:free");
	});
});
