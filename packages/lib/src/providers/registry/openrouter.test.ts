import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { StructuredResearchRequestError, StructuredResearchResponseError } from "../types";
import { openrouter, parseOpenRouterUsage } from "./openrouter";

function stubFetch(
	overrides: Record<string, unknown> = {},
	init: { ok?: boolean; status?: number; text?: string } = {},
) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: init.ok ?? true,
		status: init.status ?? 200,
		text: async () => init.text ?? "",
		json: async () => ({
			model: "openai/gpt-5-mini-2025-08-07",
			choices: [{ message: { content: "answer" } }],
			...overrides,
		}),
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentRequest(fetchMock: ReturnType<typeof vi.fn>): {
	url: string;
	init: RequestInit;
	body: Record<string, unknown>;
} {
	const [url, init] = fetchMock.mock.calls[0];
	return { url, init, body: JSON.parse((init as RequestInit).body as string) };
}

/** Exact server-tool contract every web-enabled OpenRouter request must carry. */
const GERMAN_WEB_SEARCH_TOOLS = [
	{
		type: "openrouter:web_search",
		parameters: {
			engine: "native",
			user_location: { type: "approximate", country: "DE", timezone: "Europe/Berlin" },
		},
	},
];

function expectWebSearchContract(body: Record<string, unknown>) {
	expect(body.tools).toEqual(GERMAN_WEB_SEARCH_TOOLS);
	expect(body.tool_choice).toBe("required");
	expect(body.max_tool_calls).toBe(1);
	expect(body).not.toHaveProperty("plugins");
	expect(body).not.toHaveProperty("web_search_options");
	expect(body).not.toHaveProperty("user_location");
	expect(String(body.model)).not.toMatch(/:online$/);
}

function expectNoWebSearch(rawBody: string) {
	const body = JSON.parse(rawBody);
	expect(body).not.toHaveProperty("tools");
	expect(body).not.toHaveProperty("tool_choice");
	expect(body).not.toHaveProperty("max_tool_calls");
	expect(body).not.toHaveProperty("plugins");
	expect(rawBody).not.toContain("user_location");
	expect(rawBody).not.toContain("country");
	expect(rawBody).not.toContain("timezone");
	expect(rawBody).not.toContain("web_search");
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("openrouter run", () => {
	it("Luna + webSearch: true uses auto tool choice, disabled web plugin, and German search location", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5.6-luna" });

		const { url, body } = sentRequest(fetchMock);
		expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
		expect(body.model).toBe("openai/gpt-5.6-luna");
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		// Luna with webSearch: tool_choice is "auto" not "required"
		expect(body.tools).toEqual(GERMAN_WEB_SEARCH_TOOLS);
		expect(body.tool_choice).toBe("auto");
		expect(body.max_tool_calls).toBe(1);
		expect(body.plugins).toEqual([{ id: "web", enabled: false }]);
		expect(String(body.model)).not.toMatch(/:online$/);
		expect(Object.keys(body).sort()).toEqual([
			"max_tokens",
			"max_tool_calls",
			"messages",
			"model",
			"plugins",
			"tool_choice",
			"tools",
		]);
	});

	it("Luna drops a legacy terminal :online suffix and uses auto tool choice", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5.6-luna:online" });

		const { body } = sentRequest(fetchMock);
		expect(body.model).toBe("openai/gpt-5.6-luna");
		expect(body.tools).toHaveLength(1);
		expect(body.tool_choice).toBe("auto");
		expect(body.plugins).toEqual([{ id: "web", enabled: false }]);
	});

	it("non-Luna models keep required tool choice", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "meta-llama/llama-4-maverick:free:online" });

		const { body } = sentRequest(fetchMock);
		expect(body.model).toBe("meta-llama/llama-4-maverick:free");
		expect(body.tools).toEqual(GERMAN_WEB_SEARCH_TOOLS);
		expect(body.tool_choice).toBe("required");
		expect(body.max_tool_calls).toBe(1);
		expect(body).not.toHaveProperty("plugins");
	});

	it("Luna sends no web tool or tool budget when web search is off, but still disables the plugin", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5.6-luna" });

		const { init, body } = sentRequest(fetchMock);
		expect(body.model).toBe("openai/gpt-5.6-luna");
		expect(body.max_tokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS.openrouter);
		expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
		expect(body.plugins).toEqual([{ id: "web", enabled: false }]);
		expect(body).not.toHaveProperty("tools");
		expect(body).not.toHaveProperty("tool_choice");
		expect(body).not.toHaveProperty("max_tool_calls");
		expect(init.body).not.toContain("user_location");
		expect(init.body).not.toContain("web_search");
	});

	it("non-Luna model strips :online and sends no web search when disabled", async () => {
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini:online" });

		const { init, body } = sentRequest(fetchMock);
		expect(body.model).toBe("openai/gpt-5-mini");
		expectNoWebSearch(init.body as string);
		expect(body).not.toHaveProperty("plugins");
	});

	it("rejects a target without a version slug before calling the API", async () => {
		const fetchMock = stubFetch();

		await expect(openrouter.run("chatgpt", "prompt", { webSearch: true })).rejects.toThrow(/version slug/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps text, deduplicated citations, model version and web-query marker intact", async () => {
		stubFetch({
			model: "openai/gpt-5.6-luna-2026-05-01",
			choices: [
				{
					finish_reason: "stop",
					message: {
						content: "Grounded answer",
						annotations: [
							{ type: "url_citation", url_citation: { url: "https://www.example.de/a", title: "Example A" } },
							{ type: "url_citation", url_citation: { url: "https://www.example.de/a", title: "Duplicate" } },
							{ type: "url_citation", url: "https://news.example.com/b", title: "Flat B" },
							{ type: "url_citation", url_citation: { url: "not a url" } },
							{ type: "other", url_citation: { url: "https://ignored.example.com" } },
						],
					},
				},
			],
			usage: { server_tool_use_details: { web_search_requests: 1 } },
		});

		const result = await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5.6-luna" });

		expect(result.textContent).toBe("Grounded answer");
		expect(result.modelVersion).toBe("openai/gpt-5.6-luna-2026-05-01");
		expect(result.webQueries).toEqual([WEB_QUERIES_UNAVAILABLE]);
		expect(result.citations).toEqual([
			{ url: "https://www.example.de/a", title: "Example A", domain: "example.de", citationIndex: 0 },
			{ url: "https://news.example.com/b", title: "Flat B", domain: "news.example.com", citationIndex: 1 },
		]);
		expect((result.rawOutput as any).usage.server_tool_use_details.web_search_requests).toBe(1);
	});

	it("falls back to the bare slug as model version and reports no web queries without citations", async () => {
		stubFetch({ model: undefined, choices: [{ message: { content: "plain" } }] });

		const result = await openrouter.run("chatgpt", "prompt", {
			webSearch: true,
			version: "openai/gpt-5.6-luna:online",
		});

		expect(result.modelVersion).toBe("openai/gpt-5.6-luna");
		expect(result.webQueries).toEqual([]);
		expect(result.citations).toEqual([]);
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		stubFetch({ choices: [{ message: { content: "clipped" }, finish_reason: "length" }] });

		const result = await openrouter.run("chatgpt", "prompt", { webSearch: false, version: "openai/gpt-5-mini" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
		// Logged, never thrown — the partial answer still flows through.
		expect(result.textContent).toBe("clipped");
	});

	it("surfaces a non-2xx response as an error carrying status and body but no credential", async () => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-secret-value");
		stubFetch({}, { ok: false, status: 400, text: '{"error":{"message":"Invalid tool type"}}' });

		await expect(
			openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5.6-luna" }),
		).rejects.toSatisfy((error: unknown) => {
			const message = (error as Error).message;
			expect(message).toContain("OpenRouter API error (400)");
			expect(message).toContain("Invalid tool type");
			expect(message).not.toContain("sk-or-secret-value");
			return true;
		});
	});

	it("authenticates with the bearer key and app attribution headers", async () => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
		vi.stubEnv("APP_URL", "http://localhost:1515");
		const fetchMock = stubFetch();

		await openrouter.run("chatgpt", "prompt", { webSearch: true, version: "openai/gpt-5.6-luna" });

		const { init } = sentRequest(fetchMock);
		expect(init.method).toBe("POST");
		expect(init.headers).toEqual({
			Authorization: "Bearer sk-or-test-key",
			"Content-Type": "application/json",
			"HTTP-Referer": "http://localhost:1515",
			"X-Title": "Elmo AEO",
		});
	});
});

describe("openrouter runStructuredResearch", () => {
	const schema = z.object({ summary: z.string(), competitors: z.array(z.string()) });
	const structured = { summary: "ok", competitors: ["a", "b"] };

	it("keeps the research model and strict JSON schema while adding the German web search", async () => {
		const fetchMock = stubFetch({ choices: [{ message: { content: JSON.stringify(structured) } }] });

		const result = await openrouter.runStructuredResearch!({ prompt: "research", schema, webSearch: true });

		const { body } = sentRequest(fetchMock);
		expect(body.model).toBe("openai/gpt-5-mini");
		expect(body.messages).toEqual([{ role: "user", content: "research" }]);
		expect(body.response_format).toEqual({
			type: "json_schema",
			json_schema: { name: "research_output", strict: true, schema: z.toJSONSchema(schema) },
		});
		expectWebSearchContract(body);
		expect(body).not.toHaveProperty("max_tokens");
		expect(result).toEqual({
			object: structured,
			modelVersion: "openai/gpt-5-mini",
			generationId: null,
			usage: undefined,
			request: {
				model: "openai/gpt-5-mini",
				webSearch: true,
				maxToolCalls: 1,
				maxOutputTokens: null,
				strictJsonSchema: true,
				requireParameters: true,
			},
		});
	});

	it("reports the response's generation id alongside the object", async () => {
		stubFetch({ id: "gen-01HXYZ", choices: [{ message: { content: JSON.stringify(structured) } }] });
		const result = await openrouter.runStructuredResearch!({ prompt: "research", schema });
		expect(result.generationId).toBe("gen-01HXYZ");
	});

	it("adds max_tokens only when a caller supplies maxOutputTokens; the default request is unchanged", async () => {
		const capped = stubFetch({ choices: [{ message: { content: JSON.stringify(structured) } }] });
		const cappedResult = await openrouter.runStructuredResearch!({
			prompt: "research",
			schema,
			webSearch: true,
			maxOutputTokens: 8000,
		});
		const cappedBody = sentRequest(capped).body;
		expect(cappedBody.max_tokens).toBe(8000);
		expect(cappedBody.model).toBe("openai/gpt-5-mini");
		expectWebSearchContract(cappedBody);
		// The summary is read back from the body that was sent, so it can be verified without the body.
		expect(cappedResult.request).toEqual({
			model: "openai/gpt-5-mini",
			webSearch: true,
			maxToolCalls: 1,
			maxOutputTokens: 8000,
			strictJsonSchema: true,
			requireParameters: true,
		});

		const plain = stubFetch({ choices: [{ message: { content: JSON.stringify(structured) } }] });
		const plainResult = await openrouter.runStructuredResearch!({ prompt: "research", schema, webSearch: false });
		expect(sentRequest(plain).body).not.toHaveProperty("max_tokens");
		expect(plainResult.request).toEqual({
			model: "openai/gpt-5-mini",
			webSearch: false,
			maxToolCalls: null,
			maxOutputTokens: null,
			strictJsonSchema: true,
			requireParameters: true,
		});
	});

	it("returns only safe numeric usage — tokens, reasoning tokens, charged cost, web-search count — and the opaque generation id", async () => {
		const fetchMock = stubFetch({
			choices: [{ message: { content: JSON.stringify(structured) } }],
			usage: {
				prompt_tokens: 6410,
				completion_tokens: 812,
				total_tokens: 7222,
				cost: 0.0234,
				cost_details: { upstream_inference_cost: 0.02 },
				prompt_tokens_details: { cached_tokens: 0 },
				completion_tokens_details: { reasoning_tokens: 300 },
				server_tool_use: { web_search_requests: 1 },
				is_byok: false,
				api_key: "sk-or-must-not-leak",
			},
			id: "gen-opaque-id",
		});
		const result = await openrouter.runStructuredResearch!({ prompt: "research", schema, webSearch: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.usage).toEqual({
			inputTokens: 6410,
			outputTokens: 812,
			reasoningTokens: 300,
			costUsd: 0.0234,
			webSearchRequests: 1,
			webSearchRequestsConflict: false,
		});
		expect(result.generationId).toBe("gen-opaque-id");
		expect(JSON.stringify(result)).not.toMatch(/sk-or-|is_byok|upstream|api_key|cached_tokens|total_tokens/);
	});

	it("parses the Responses-style variant in full and reports absent fields as null", async () => {
		stubFetch({
			choices: [{ message: { content: JSON.stringify(structured) } }],
			usage: {
				input_tokens: 10,
				output_tokens: 5,
				output_tokens_details: { reasoning_tokens: 2 },
				cost: 0.004,
				server_tool_use: { web_search_requests: 1 },
				total_tokens: 15,
				cost_details: { upstream_inference_cost: 0.003 },
			},
		});
		const result = await openrouter.runStructuredResearch!({ prompt: "research", schema, webSearch: false });
		expect(result.usage).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			reasoningTokens: 2,
			costUsd: 0.004,
			webSearchRequests: 1,
			webSearchRequestsConflict: false,
		});
		expect(JSON.stringify(result)).not.toMatch(/total_tokens|upstream/);
		expect(parseOpenRouterUsage({ input_tokens: 10, output_tokens: 5 })).toEqual({
			inputTokens: 10,
			outputTokens: 5,
			reasoningTokens: null,
			costUsd: null,
			webSearchRequests: null,
			webSearchRequestsConflict: false,
		});
		expect(parseOpenRouterUsage(undefined)).toBeUndefined();
		expect(parseOpenRouterUsage(null)).toBeUndefined();
		expect(parseOpenRouterUsage("usage")).toBeUndefined();
	});

	it("defaults to web search when the option is omitted", async () => {
		const fetchMock = stubFetch({ choices: [{ message: { content: JSON.stringify(structured) } }] });

		await openrouter.runStructuredResearch!({ prompt: "research", schema });

		expectWebSearchContract(sentRequest(fetchMock).body);
	});

	it("sends no web tool or location when web search is off and still parses the result", async () => {
		const fetchMock = stubFetch({ choices: [{ message: { content: JSON.stringify(structured) } }] });

		const result = await openrouter.runStructuredResearch!({ prompt: "research", schema, webSearch: false });

		const { init, body } = sentRequest(fetchMock);
		expect(body.model).toBe("openai/gpt-5-mini");
		expect(body.response_format).toMatchObject({ type: "json_schema" });
		expectNoWebSearch(init.body as string);
		expect(result.object).toEqual(structured);
	});

	it("rejects content that does not match the schema as a typed error carrying the paid envelope, never the content", async () => {
		const usage = { prompt_tokens: 6410, completion_tokens: 812, cost: 0.020047 };
		stubFetch({
			id: "gen-schema",
			usage,
			choices: [{ message: { content: JSON.stringify({ summary: 1, leaked: "SECRET-TEXT" }) } }],
		});

		await expect(openrouter.runStructuredResearch!({ prompt: "research", schema })).rejects.toSatisfy(
			(error: unknown) => {
				expect(error).toBeInstanceOf(StructuredResearchResponseError);
				const typed = error as StructuredResearchResponseError;
				expect(typed.code).toBe("schema");
				expect(typed.envelope).toEqual({
					provider: "openrouter",
					model: "openai/gpt-5-mini",
					generationId: "gen-schema",
					request: {
						model: "openai/gpt-5-mini",
						webSearch: true,
						maxToolCalls: 1,
						maxOutputTokens: null,
						strictJsonSchema: true,
						requireParameters: true,
					},
					usage: {
						inputTokens: 6410,
						outputTokens: 812,
						reasoningTokens: null,
						costUsd: 0.020047,
						webSearchRequests: null,
						webSearchRequestsConflict: false,
					},
				});
				expect(JSON.stringify({ ...typed, message: typed.message })).not.toContain("SECRET-TEXT");
				return true;
			},
		);
	});

	it("rejects missing content and invalid JSON the same way, with the usage of the charged response", async () => {
		stubFetch({ id: "gen-empty", usage: { cost: 0.01 }, choices: [{ message: { content: null } }] });
		await expect(openrouter.runStructuredResearch!({ prompt: "research", schema })).rejects.toMatchObject({
			name: "StructuredResearchResponseError",
			code: "no-content",
			envelope: { generationId: "gen-empty", usage: { costUsd: 0.01 } },
		});
		stubFetch({ id: "gen-garbage", usage: { cost: 0.02 }, choices: [{ message: { content: "{not json: SECRET" } }] });
		await expect(openrouter.runStructuredResearch!({ prompt: "research", schema })).rejects.toSatisfy(
			(error: unknown) => {
				expect(error).toMatchObject({
					code: "invalid-json",
					envelope: { generationId: "gen-garbage", usage: { costUsd: 0.02 } },
				});
				expect((error as Error).message).not.toContain("SECRET");
				return true;
			},
		);
	});

	it("surfaces a non-2xx response as an error without the credential", async () => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-secret-value");
		stubFetch({}, { ok: false, status: 402, text: "Insufficient credits" });

		await expect(openrouter.runStructuredResearch!({ prompt: "research", schema })).rejects.toSatisfy(
			(error: unknown) => {
				const message = (error as Error).message;
				expect(message).toBe("OpenRouter API error (402): Insufficient credits");
				expect(message).not.toContain("sk-or-secret-value");
				return true;
			},
		);
	});
});

describe("parseOpenRouterUsage web-search counter", () => {
	const empty = {
		inputTokens: null,
		outputTokens: null,
		reasoningTokens: null,
		costUsd: null,
	};

	it("reads the documented `server_tool_use` parent", () => {
		expect(parseOpenRouterUsage({ server_tool_use: { web_search_requests: 1 } })).toEqual({
			...empty,
			webSearchRequests: 1,
			webSearchRequestsConflict: false,
		});
	});

	it("reads the observed `server_tool_use_details` parent", () => {
		expect(parseOpenRouterUsage({ server_tool_use_details: { web_search_requests: 1 } })).toEqual({
			...empty,
			webSearchRequests: 1,
			webSearchRequestsConflict: false,
		});
	});

	it("accepts both parents when they agree", () => {
		expect(
			parseOpenRouterUsage({
				server_tool_use: { web_search_requests: 2 },
				server_tool_use_details: { web_search_requests: 2 },
			}),
		).toEqual({ ...empty, webSearchRequests: 2, webSearchRequestsConflict: false });
	});

	it("trusts neither parent when they disagree and flags the conflict", () => {
		expect(
			parseOpenRouterUsage({
				server_tool_use: { web_search_requests: 1 },
				server_tool_use_details: { web_search_requests: 3 },
			}),
		).toEqual({ ...empty, webSearchRequests: null, webSearchRequestsConflict: true });
	});

	it("uses the valid parent when the other is malformed, without a conflict", () => {
		expect(
			parseOpenRouterUsage({
				server_tool_use: { web_search_requests: "1" },
				server_tool_use_details: { web_search_requests: 1 },
			}),
		).toEqual({ ...empty, webSearchRequests: 1, webSearchRequestsConflict: false });
		expect(parseOpenRouterUsage({ server_tool_use: "native", server_tool_use_details: null })).toEqual({
			...empty,
			webSearchRequests: null,
			webSearchRequestsConflict: false,
		});
	});
});

describe("parseOpenRouterUsage numeric validation", () => {
	const nothing = {
		inputTokens: null,
		outputTokens: null,
		reasoningTokens: null,
		costUsd: null,
		webSearchRequests: null,
		webSearchRequestsConflict: false,
	};

	it.each([
		["strings", "12"],
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
		["-Infinity", Number.NEGATIVE_INFINITY],
		["negative", -1],
		["fractional", 1.5],
		["boolean", true],
		["object", { value: 1 }],
		["null", null],
	])("reports a %s count as null everywhere", (_label, value) => {
		expect(
			parseOpenRouterUsage({
				prompt_tokens: value,
				completion_tokens: value,
				completion_tokens_details: { reasoning_tokens: value },
				server_tool_use: { web_search_requests: value },
			}),
		).toEqual(nothing);
	});

	it.each([
		["string", "0.5"],
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
		["negative", -0.01],
		["boolean", false],
	])("reports a %s cost as null", (_label, value) => {
		expect(parseOpenRouterUsage({ cost: value })).toEqual(nothing);
	});

	it("accepts a fractional non-negative cost and integer counts including zero", () => {
		expect(
			parseOpenRouterUsage({
				prompt_tokens: 0,
				completion_tokens: 8000,
				completion_tokens_details: { reasoning_tokens: 0 },
				cost: 0,
				server_tool_use: { web_search_requests: 0 },
			}),
		).toEqual({
			inputTokens: 0,
			outputTokens: 8000,
			reasoningTokens: 0,
			costUsd: 0,
			webSearchRequests: 0,
			webSearchRequestsConflict: false,
		});
		expect(parseOpenRouterUsage({ cost: 0.0312 })?.costUsd).toBe(0.0312);
	});

	it("does not fall back to the alternative token key when the documented key is present but invalid", () => {
		expect(parseOpenRouterUsage({ prompt_tokens: "7", input_tokens: 7 })?.inputTokens).toBeNull();
		expect(parseOpenRouterUsage({ completion_tokens: -1, output_tokens: 9 })?.outputTokens).toBeNull();
		expect(
			parseOpenRouterUsage({
				completion_tokens_details: { reasoning_tokens: 1.5 },
				output_tokens_details: { reasoning_tokens: 2 },
			})?.reasoningTokens,
		).toBeNull();
	});

	it("retains no other field, id, credential or nested detail of the payload", () => {
		const usage = parseOpenRouterUsage({
			prompt_tokens: 1,
			completion_tokens: 2,
			cost: 0.1,
			cost_details: { upstream_inference_cost: 0.09 },
			prompt_tokens_details: { cached_tokens: 1 },
			total_tokens: 3,
			is_byok: true,
			api_key: "sk-or-must-not-leak",
			request_id: "req-1",
			server_tool_use: { web_search_requests: 1, other_tool: 4 },
		});
		expect(Object.keys(usage ?? {}).sort()).toEqual([
			"costUsd",
			"inputTokens",
			"outputTokens",
			"reasoningTokens",
			"webSearchRequests",
			"webSearchRequestsConflict",
		]);
		expect(JSON.stringify(usage)).not.toMatch(/sk-or-|req-1|byok|upstream|cached|other_tool|total/);
	});
});

describe("openrouter non-2xx responses are typed refusals", () => {
	const schema = z.object({ summary: z.string() });
	const refusal = (status: number, body: unknown, headers: Record<string, string> = {}) => {
		vi.stubEnv("OPENROUTER_API_KEY", "sk-or-secret-value");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status,
				headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
				text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
				json: async () => body,
			}),
		);
		return openrouter.runStructuredResearch!({ prompt: "research", schema }).catch((error: unknown) => error);
	};
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it("the canonical error.metadata.error_type is carried verbatim, whatever the human-readable message says", async () => {
		const error = await refusal(
			429,
			{ error: { code: 429, message: "Too many cats", metadata: { error_type: "rate_limit_exceeded" } } },
			{ "retry-after": "12" },
		);
		expect(error).toBeInstanceOf(StructuredResearchRequestError);
		expect(error).toMatchObject({
			httpStatus: 429,
			errorType: "rate_limit_exceeded",
			structured: true,
			carriesOutput: false,
			retryAfterMs: 12_000,
		});
		expect((error as Error).message).toBe(
			'OpenRouter API error (429): {"error":{"code":429,"message":"Too many cats","metadata":{"error_type":"rate_limit_exceeded"}}}',
		);
		expect((error as Error).message).not.toContain("sk-or-secret-value");
		expect(
			await refusal(503, {
				error: { code: 503, message: "Provider returned error", metadata: { error_type: "provider_overloaded" } },
			}),
		).toMatchObject({ httpStatus: 503, errorType: "provider_overloaded", structured: true });
		// Any well-formed canonical value is passed through untouched; the adapter never renames or maps it.
		for (const type of [
			"provider_unavailable",
			"authentication",
			"payment_required",
			"invalid_request",
			"server",
			"timeout",
			"unmapped",
			"some_future_type",
		]) {
			expect(await refusal(400, { error: { code: 400, message: "x", metadata: { error_type: type } } })).toMatchObject({
				errorType: type,
			});
		}
	});

	it("message text, metadata.raw and provider_code never produce an error type: without the canonical field it is null", async () => {
		expect(await refusal(429, { error: { code: 429, message: "Rate limit exceeded: 10 rpm" } })).toMatchObject({
			httpStatus: 429,
			structured: true,
			errorType: null,
		});
		expect(
			await refusal(503, {
				error: {
					code: 503,
					message: "Provider is overloaded",
					metadata: {
						raw: "Engine is currently overloaded",
						provider_code: "overloaded_error",
						provider_name: "OpenAI",
					},
				},
			}),
		).toMatchObject({ httpStatus: 503, structured: true, errorType: null });
		for (const status of [400, 401, 402, 403, 404, 408, 409, 422, 500, 502, 504, 524, 529]) {
			expect(await refusal(status, { error: { code: status, message: "rate limit overloaded" } })).toMatchObject({
				httpStatus: status,
				errorType: null,
			});
		}
	});

	it("a malformed error_type is null, not a type", async () => {
		for (const malformed of [
			429,
			"",
			" rate_limit_exceeded",
			"rate limit exceeded",
			"RATE_LIMIT_EXCEEDED",
			"a".repeat(65),
			{ type: "rate_limit_exceeded" },
			null,
		]) {
			expect(
				await refusal(429, { error: { code: 429, message: "x", metadata: { error_type: malformed } } }),
			).toMatchObject({ errorType: null });
		}
	});

	it("a body that is not the OpenRouter error envelope is not structured and untyped; a body carrying output is flagged", async () => {
		expect(await refusal(429, "<html>rate limited</html>")).toMatchObject({
			structured: false,
			errorType: null,
			carriesOutput: false,
		});
		expect(await refusal(429, { metadata: { error_type: "rate_limit_exceeded" } })).toMatchObject({
			structured: false,
			errorType: null,
		});
		expect(
			await refusal(429, {
				error: { code: 429, message: "x", metadata: { error_type: "rate_limit_exceeded" } },
				id: "gen-partial",
				usage: { cost: 0.01 },
			}),
		).toMatchObject({
			structured: true,
			errorType: "rate_limit_exceeded",
			carriesOutput: true,
		});
		expect(
			await refusal(503, {
				error: { code: 503, message: "x", metadata: { error_type: "provider_overloaded" } },
				choices: [{ message: { content: "partial" } }],
			}),
		).toMatchObject({ errorType: "provider_overloaded", carriesOutput: true });
	});
});
