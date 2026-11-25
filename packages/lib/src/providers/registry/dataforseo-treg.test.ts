import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRun } from "../../text-extraction";
import { getProvider } from "../index";
import { dataforseo } from "./dataforseo";

function gatewayResponse(result: unknown, statusCode = 20000): Response {
	return new Response(
		JSON.stringify({
			status_code: 20000,
			tasks: [{ status_code: statusCode, status_message: "Task status", result: [result] }],
		}),
		{ headers: { "Content-Type": "application/json", "X-Treg-Call-Id": "call-dfs", "X-Treg-Cost-Micro": "12000" } },
	);
}

beforeEach(() => {
	vi.stubEnv("TREG_PROVIDERS", "dataforseo");
	vi.stubEnv("TREG_API_KEY", "gateway-test-key");
	vi.stubEnv("TREG_MAX_COST_USD", "0.1");
	vi.stubEnv("DATAFORSEO_LOGIN", "");
	vi.stubEnv("DATAFORSEO_PASSWORD", "");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("DataForSEO native SDK through Treg (mocked HTTP only)", () => {
	it("scrapes ChatGPT without native credentials and preserves native extraction", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			gatewayResponse({
				model: "sample-model",
				markdown: "A **sample answer**.",
				fan_out_queries: ["sample search"],
				sources: [{ url: "https://example.com/source", title: "Source" }],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await dataforseo.run("chatgpt", "A sample prompt?", { webSearch: true });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://treg.to/call/dataforseo.x.ai-optimization-chat-gpt-llm-scraper-live-advanced");
		expect(init.method).toBe("POST");
		expect(await new Response(init.body).json()).toEqual([
			{ keyword: "A sample prompt?", location_code: 2840, language_code: "en", force_web_search: true },
		]);
		expect(new Headers(init.headers).get("authorization")).toBeNull();
		expect(new Headers(init.headers).get("X-Treg-Token")).toBe("gateway-test-key");
		expect(extractRun(result.rawOutput, "dataforseo").textContent).toBe("A **sample answer**.");
		expect(extractRun(result.rawOutput, "dataforseo").citations.map((citation) => citation.url)).toEqual([
			"https://example.com/source",
		]);
		expect(result.webQueries).toEqual(["sample search"]);
		expect(result.modelVersion).toBe("sample-model");
	});

	it.each([
		{
			model: "gemini",
			endpoint: "ai-optimization-gemini-llm-scraper-live-advanced",
			options: { webSearch: true },
			payload: { keyword: "A sample prompt?", location_code: 2840, language_code: "en" },
			result: {
				model: "sample-model",
				markdown: "A **sample answer**.",
				sources: [{ url: "https://example.com/source", title: "Source" }],
			},
		},
		{
			model: "google-ai-mode",
			endpoint: "serp-google-ai-mode-live-advanced",
			options: { webSearch: true },
			payload: { keyword: "A sample prompt?", location_code: 2840, language_code: "en" },
			result: {
				items: [
					{
						type: "ai_overview",
						markdown: "A **sample answer**.",
						references: [{ url: "https://example.com/source", title: "Source" }],
					},
				],
			},
		},
		{
			model: "google-ai-overview",
			endpoint: "serp-google-organic-live-advanced",
			options: { webSearch: true },
			payload: {
				keyword: "A sample prompt?",
				location_code: 2840,
				language_code: "en",
				depth: 10,
				load_async_ai_overview: true,
				stop_crawl_on_match: null,
			},
			result: {
				items: [
					{
						type: "ai_overview",
						markdown: "A **sample answer**.",
						references: [{ url: "https://example.com/source", title: "Source" }],
					},
				],
			},
		},
	])("forwards the real SDK's $model payload and re-extracts its native answer", async (test) => {
		const fetchMock = vi.fn().mockResolvedValueOnce(gatewayResponse(test.result));
		vi.stubGlobal("fetch", fetchMock);

		const result = await dataforseo.run(test.model, "A sample prompt?", test.options);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://treg.to/call/dataforseo.x.${test.endpoint}`);
		expect(init.method).toBe("POST");
		expect(await new Response(init.body).json()).toEqual([test.payload]);
		expect(extractRun(result.rawOutput, "dataforseo").textContent).toContain("sample answer");
		expect(extractRun(result.rawOutput, "dataforseo").citations.map((citation) => citation.url)).toEqual([
			"https://example.com/source",
		]);
		expect(result.webQueries).toEqual(["unavailable"]);
	});

	it.each([
		{ model: "chatgpt", path: "chat-gpt", version: "gpt-4.1", webSearch: true },
		{ model: "gemini", path: "gemini", version: "gemini-2.5-flash", webSearch: true },
		{ model: "perplexity", path: "perplexity", version: undefined, webSearch: undefined },
	])("forwards the real $model LLM Responses payload without changing SDK serialization", async (test) => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			gatewayResponse({
				model_name: "sample-model",
				fan_out_queries: ["sample search"],
				items: [
					{
						type: "message",
						sections: [
							{
								type: "text",
								text: "A sample answer.",
								annotations: [{ url: "https://example.com/source", title: "Source" }],
							},
						],
					},
				],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const result = await dataforseo.run(test.model, "A sample prompt?", { version: test.version, webSearch: true });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://treg.to/call/dataforseo.x.ai-optimization-${test.path}-llm-responses-live`);
		expect(await new Response(init.body).json()).toEqual([
			{
				user_prompt: "A sample prompt?",
				model_name: test.version ?? "sonar",
				...(test.webSearch ? { web_search: true } : {}),
				message_chain: null,
			},
		]);
		expect(extractRun(result.rawOutput, "dataforseo").textContent).toBe("A sample answer.");
		expect(extractRun(result.rawOutput, "dataforseo").citations.map((citation) => citation.url)).toEqual([
			"https://example.com/source",
		]);
		expect(result.webQueries).toEqual(["sample search"]);
		expect(result.modelVersion).toBe("sample-model");
	});

	it("rejects an HTTP 200 response with a failed native task status", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(gatewayResponse({ markdown: "Not an answer" }, 40000));
		vi.stubGlobal("fetch", fetchMock);

		await expect(dataforseo.run("chatgpt", "A sample prompt?", { webSearch: true })).rejects.toThrow(
			"DataForSEO API Error: 40000",
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not fall back to native credentials after a gateway refusal", async () => {
		vi.stubEnv("DATAFORSEO_LOGIN", "native-user");
		vi.stubEnv("DATAFORSEO_PASSWORD", "native-password");
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("private upstream envelope", { status: 403, headers: { "X-Treg-Error": "1" } }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const error = await dataforseo.run("chatgpt", "A sample prompt?", { webSearch: true }).catch((error) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).not.toContain("private upstream envelope");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/treg.to\/call\//);
		expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBeNull();
	});

	it("keeps native Basic auth and SDK bodies when the gateway is unselected", async () => {
		vi.stubEnv("TREG_PROVIDERS", "");
		vi.stubEnv("DATAFORSEO_LOGIN", "native-user");
		vi.stubEnv("DATAFORSEO_PASSWORD", "native-password");
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(gatewayResponse({ model: "native-model", markdown: "Native answer" }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await dataforseo.run("chatgpt", "A sample prompt?", { webSearch: true });

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced");
		expect(new Headers(init.headers).get("authorization")).toBe(`Basic ${btoa("native-user:native-password")}`);
		expect(new Headers(init.headers).get("X-Treg-Token")).toBeNull();
		expect(extractRun(result.rawOutput, "dataforseo").textContent).toBe("Native answer");
	});

	it("the registered native provider is configured with gateway credentials and stores audit alongside native data", async () => {
		const provider = getProvider("dataforseo");
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(gatewayResponse({ markdown: "A sample answer.", model: "sample-model" }));
		vi.stubGlobal("fetch", fetchMock);

		expect(provider.isConfigured()).toBe(true);
		const result = await provider.run("chatgpt", "A sample prompt?", { webSearch: true });

		expect(extractRun(result.rawOutput, "dataforseo").textContent).toBe("A sample answer.");
		expect(result.rawOutput).toMatchObject({
			_treg: {
				requests: [
					{
						provider: "dataforseo",
						endpoint: "dataforseo.x.ai-optimization-chat-gpt-llm-scraper-live-advanced",
						call_id: "call-dfs",
						observed_charged_micro: 12000,
					},
				],
			},
		});
	});

	it("native AI Overview retries reuse one logical POST idempotency key inside the registered run", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(gatewayResponse({}, 40000)));
		vi.stubGlobal("fetch", fetchMock);

		const pending = getProvider("dataforseo").run("google-ai-overview", "A sample prompt?", { webSearch: true });
		const rejected = expect(pending).rejects.toThrow("DataForSEO API Error: 40000");
		await vi.runAllTimersAsync();
		await rejected;

		expect(fetchMock).toHaveBeenCalledTimes(3);
		const keys = fetchMock.mock.calls.map(([, init]) => new Headers(init.headers).get("Idempotency-Key"));
		expect(keys[0]).toBeTruthy();
		expect(new Set(keys).size).toBe(1);
	});
});
