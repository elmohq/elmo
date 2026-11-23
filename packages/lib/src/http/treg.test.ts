import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTregEnabled, tregFetch, withTregAudit } from "./treg";

const storedCredentials = vi.hoisted(() => new Map<string, string>());
vi.mock("../secrets", () => ({ getCredential: (name: string) => storedCredentials.get(name) ?? process.env[name] }));

const DFS_URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const CLORO_URL = "https://api.cloro.dev/v1/monitor/bing/aimode";
const body = JSON.stringify([{ keyword: "example question" }]);

function response(value: unknown = { tasks: [{ status_code: 20000 }] }, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(value), {
		headers: { "Content-Type": "application/json", "X-Treg-Call-Id": "call-example", ...headers },
	});
}

beforeEach(() => {
	storedCredentials.clear();
	vi.stubEnv("TREG_PROVIDERS", "cloro,dataforseo");
	vi.stubEnv("TREG_API_KEY", "gateway-key");
	vi.stubEnv("TREG_ORG", undefined);
	vi.stubEnv("TREG_MAX_COST_USD", "2.5");
	vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("Treg logical operations", () => {
	it("reuses POST keys within a run, but changes them for changed payloads and fresh runs", async () => {
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({})));
		vi.stubGlobal("fetch", fetchMock);
		const run = () =>
			withTregAudit("dataforseo", async () => {
				await (await tregFetch("dataforseo", DFS_URL, { method: "POST", body })).text();
				await (await tregFetch("dataforseo", DFS_URL, { method: "POST", body })).text();
				await (await tregFetch("dataforseo", DFS_URL, { method: "POST", body: '[{"keyword":"other"}]' })).text();
				return { rawOutput: { tasks: [] }, webQueries: [] };
			});
		const first = await run();
		await run();
		const keys = fetchMock.mock.calls.map(([, init]) => new Headers(init.headers).get("Idempotency-Key"));
		expect(keys[0]).toBe(keys[1]);
		expect(keys[0]).not.toBe(keys[2]);
		expect(keys[0]).not.toBe(keys[3]);
		expect(first.rawOutput).toMatchObject({
			tasks: [],
			_treg: { requests: [expect.any(Object), expect.any(Object), expect.any(Object)] },
		});
		expect(first.webQueries).toEqual([]);
	});

	it("reuses the reconciliation key for a native retry after a network interruption", async () => {
		const fetchMock = vi.fn().mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(response({}));
		vi.stubGlobal("fetch", fetchMock);
		await withTregAudit("dataforseo", async () => {
			await expect(tregFetch("dataforseo", DFS_URL, { method: "POST", body })).rejects.toThrow(/Reconcile/);
			return { rawOutput: await (await tregFetch("dataforseo", DFS_URL, { method: "POST", body })).json() };
		});
		expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Idempotency-Key")).toBe(
			new Headers(fetchMock.mock.calls[1][1].headers).get("Idempotency-Key"),
		);
	});

	it("polls the native dynamic path fresh without idempotency caching", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response({ task: { status: "PROCESSING" } }))
			.mockResolvedValueOnce(response({ task: { status: "COMPLETED" }, response: { text: "answer" } }));
		vi.stubGlobal("fetch", fetchMock);
		const result = await withTregAudit("cloro", async () => {
			const poll = () => tregFetch("cloro", "https://api.cloro.dev/v1/async/task/task_123-abc?include=answer");
			expect((await (await poll()).json()).task.status).toBe("PROCESSING");
			return { rawOutput: await (await poll()).json() };
		});
		expect(result.rawOutput.response.text).toBe("answer");
		expect(result.rawOutput._treg.requests).toHaveLength(2);
		for (const [url, init] of fetchMock.mock.calls) {
			expect(url).toBe("https://treg.to/call/cloro/v1/async/task/task_123-abc?include=answer");
			expect(init.method).toBe("GET");
			expect(init.body).toBeUndefined();
			expect(new Headers(init.headers).get("Idempotency-Key")).toBeNull();
		}
	});

	it("isolates concurrent logical operations without a global request queue", async () => {
		const pending: Array<(response: Response) => void> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve))),
		);
		const run = (provider: string, url: string, payload: string) =>
			withTregAudit(provider, async () => ({
				rawOutput: await (await tregFetch(provider, url, { method: "POST", body: payload })).json(),
			}));
		const first = run("cloro", CLORO_URL, "{}");
		const second = run("dataforseo", DFS_URL, body);
		await vi.waitFor(() => expect(pending).toHaveLength(2));
		pending[1](response({ tasks: [] }, { "X-Treg-Call-Id": "call-second" }));
		pending[0](response({ response: {} }, { "X-Treg-Call-Id": "call-first" }));
		const [one, two] = await Promise.all([first, second]);
		expect(one.rawOutput._treg.requests).toMatchObject([{ provider: "cloro", call_id: "call-first" }]);
		expect(two.rawOutput._treg.requests).toMatchObject([{ provider: "dataforseo", call_id: "call-second" }]);
		expect(one.rawOutput._treg.requests).toHaveLength(1);
		expect(two.rawOutput._treg.requests).toHaveLength(1);
	});

	it("never wraps non-object raw output", async () => {
		for (const rawOutput of [null, "text", [], 42]) {
			const value = { rawOutput };
			expect(await withTregAudit("cloro", async () => value)).toBe(value);
		}
	});

	it("uses a fresh POST identity outside an audit scope", async () => {
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({})));
		vi.stubGlobal("fetch", fetchMock);
		await (await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).text();
		await (await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).text();
		expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Idempotency-Key")).not.toBe(
			new Headers(fetchMock.mock.calls[1][1].headers).get("Idempotency-Key"),
		);
	});
});

describe("Treg deadlines and cancellation", () => {
	it("sanitizes native response stream failures and releases the deadline", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					new ReadableStream({
						pull(controller) {
							controller.error(new Error("private-stream-message"));
						},
					}),
					{ headers: { "X-Treg-Call-Id": "stream-failure" } },
				),
			),
		);
		const result = await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" });
		await expect(result.text()).rejects.toThrow(/response could not be read.*stream-failure/);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("sanitizes outgoing stream failures before network", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const input = new Request(CLORO_URL, {
			method: "POST",
			body: new ReadableStream({
				pull(controller) {
					controller.error(new Error("private-stream-message"));
				},
			}),
			duplex: "half",
		} as RequestInit);
		await expect(tregFetch("cloro", input)).rejects.toThrow(/request body interrupted/);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("releases the deadline for empty successful responses", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { "X-Treg-Call-Id": "empty-call" } })),
		);
		expect((await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).status).toBe(204);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps cancellation effective on a stalled outgoing body", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn();
		const cancel = vi.fn();
		const controller = new AbortController();
		vi.stubGlobal("fetch", fetchMock);
		const input = new Request(CLORO_URL, {
			method: "POST",
			body: new ReadableStream({ cancel }),
			duplex: "half",
			signal: controller.signal,
		} as RequestInit);
		const pending = tregFetch("cloro", input);
		const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await rejected;
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("times out even while waiting for response headers", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));
		vi.stubGlobal("fetch", fetchMock);
		const pending = tregFetch("dataforseo", DFS_URL, { method: "POST", body });
		const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
		await vi.advanceTimersByTimeAsync(180_000);
		await rejected;
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("keeps the deadline active while reading a stalled response body", async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(new ReadableStream({ cancel }), { headers: { "X-Treg-Call-Id": "slow-call" } }),
				),
		);
		const result = await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" });
		const rejected = expect(result.text()).rejects.toMatchObject({
			name: "TimeoutError",
			message: expect.stringContaining("slow-call"),
		});
		await vi.advanceTimersByTimeAsync(180_000);
		await rejected;
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(["headers", "body"])("propagates caller abort during %s without leaking its reason", async (phase) => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const fetchMock = vi
			.fn()
			.mockImplementation(() =>
				phase === "headers"
					? new Promise<Response>(() => {})
					: Promise.resolve(new Response(new ReadableStream(), { headers: { "X-Treg-Call-Id": "abort-call" } })),
			);
		vi.stubGlobal("fetch", fetchMock);
		const pending = tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}", signal: controller.signal });
		let consumed: Promise<unknown> = pending;
		if (phase === "body") consumed = (await pending).text();
		else await vi.advanceTimersByTimeAsync(0);
		const rejected = expect(consumed).rejects.toMatchObject({
			name: "AbortError",
			message: expect.not.stringContaining("private-reason"),
		});
		controller.abort(new Error("private-reason"));
		await rejected;
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects already-aborted calls without sending a request", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const controller = new AbortController();
		controller.abort();
		await expect(
			tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}", signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("bounds a stalled outgoing body and cancels it before network", async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const input = new Request(CLORO_URL, {
			method: "POST",
			body: new ReadableStream({ cancel }),
			duplex: "half",
		} as RequestInit);
		const rejected = expect(tregFetch("cloro", input)).rejects.toMatchObject({ name: "TimeoutError" });
		await vi.advanceTimersByTimeAsync(180_000);
		await rejected;
		expect(fetchMock).not.toHaveBeenCalled();
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("clears timers on complete response consumption and explicit cancellation", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response()));
		vi.stubGlobal("fetch", fetchMock);
		await (await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).text();
		expect(vi.getTimerCount()).toBe(0);
		await (await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).body?.cancel();
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("Treg transport", () => {
	it("resolves gateway credentials through the stored-credential interface without native keys", async () => {
		vi.stubEnv("TREG_API_KEY", undefined);
		vi.stubEnv("CLORO_API_KEY", undefined);
		storedCredentials.set("TREG_API_KEY", "stored-gateway-key");
		storedCredentials.set("TREG_ORG", "stored-org");
		const fetchMock = vi.fn().mockResolvedValue(response({}));
		vi.stubGlobal("fetch", fetchMock);
		await (await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).json();
		const headers = new Headers(fetchMock.mock.calls[0][1].headers);
		expect(headers.get("X-Treg-Token")).toBe("stored-gateway-key");
		expect(headers.get("X-Treg-Org")).toBe("stored-org");
	});

	it.each([
		[
			"ai_optimization/chat_gpt/llm_scraper/live/advanced",
			"dataforseo.x.ai-optimization-chat-gpt-llm-scraper-live-advanced",
		],
		[
			"ai_optimization/gemini/llm_scraper/live/advanced",
			"dataforseo.x.ai-optimization-gemini-llm-scraper-live-advanced",
		],
		["serp/google/ai_mode/live/advanced", "dataforseo.x.serp-google-ai-mode-live-advanced"],
		["serp/google/organic/live/advanced", "dataforseo.x.serp-google-organic-live-advanced"],
		["ai_optimization/chat_gpt/llm_responses/live", "dataforseo.x.ai-optimization-chat-gpt-llm-responses-live"],
		["ai_optimization/gemini/llm_responses/live", "dataforseo.x.ai-optimization-gemini-llm-responses-live"],
		["ai_optimization/perplexity/llm_responses/live", "dataforseo.x.ai-optimization-perplexity-llm-responses-live"],
	])("maps the verified DataForSEO native route %s", async (path, endpoint) => {
		const fetchMock = vi.fn().mockResolvedValue(response());
		vi.stubGlobal("fetch", fetchMock);
		await (await tregFetch("dataforseo", `https://api.dataforseo.com/v3/${path}`, { method: "POST", body })).json();
		expect(fetchMock.mock.calls[0][0]).toBe(`https://treg.to/call/${endpoint}`);
	});

	it.each([
		["/v1/async/task", "cloro.ai-search.chatgpt.scrape.task", { taskType: "CHATGPT", payload: { prompt: "example" } }],
		["/v1/monitor/bing/aimode", "cloro.bing.serp.ai_mode", { prompt: "example", country: "US" }],
		["/v1/monitor/gemini", "cloro.ai-search.gemini.scrape", { prompt: "example", country: "US" }],
		["/v1/monitor/aimode", "cloro.google.serp.ai_mode", { prompt: "example", gl: "us" }],
		["/v1/monitor/google", "cloro.google.serp.organic", { query: "example", gl: "us" }],
	])("maps the verified Cloro native route %s", async (path, endpoint, payload) => {
		const fetchMock = vi.fn().mockResolvedValue(response());
		vi.stubGlobal("fetch", fetchMock);
		const serialized = JSON.stringify(payload, null, 2);
		await (await tregFetch("cloro", `https://api.cloro.dev${path}`, { method: "POST", body: serialized })).text();
		expect(fetchMock.mock.calls[0][0]).toBe(`https://treg.to/call/${endpoint}`);
		expect(new TextDecoder().decode(fetchMock.mock.calls[0][1].body)).toBe(serialized);
	});

	it("preserves query bytes, Request inputs and safe headers, but overrides caller gateway headers", async () => {
		vi.stubEnv("TREG_ORG", "example-team");
		const fetchMock = vi.fn().mockResolvedValue(response());
		vi.stubGlobal("fetch", fetchMock);
		const request = new Request(`${DFS_URL}?tag=a%20b&tag=c`, {
			method: "POST",
			body,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"x-api-key": "native-secret",
				"X-Treg-Token": "caller-token",
				"X-Treg-Meta": "prompt=private",
				"Idempotency-Key": "caller-key",
				"X-Unknown": "private",
			},
		});
		await (await tregFetch("dataforseo", request)).text();
		expect(fetchMock.mock.calls[0][0]).toBe(
			"https://treg.to/call/dataforseo.x.serp-google-organic-live-advanced?tag=a%20b&tag=c",
		);
		const headers = new Headers(fetchMock.mock.calls[0][1].headers);
		expect(headers.get("Accept")).toBe("application/json");
		expect(headers.get("Content-Type")).toBe("application/json");
		expect(headers.get("X-Treg-Org")).toBe("example-team");
		expect(headers.get("x-api-key")).toBeNull();
		expect(headers.get("X-Unknown")).toBeNull();
		expect(headers.get("X-Treg-Token")).toBe("gateway-key");
		expect(headers.get("Idempotency-Key")).not.toBe("caller-key");
		expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(
			/private|native-secret|gateway-key|caller-token|example question/,
		);
	});

	it("is explicitly selected, not implicitly enabled by credentials", async () => {
		vi.stubEnv("TREG_PROVIDERS", undefined);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(isTregEnabled("cloro")).toBe(false);
		const native = { rawOutput: { response: { text: "native" } } };
		expect(await withTregAudit("cloro", async () => native)).toBe(native);
		await expect(tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).rejects.toThrow(/explicit/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["TREG_API_KEY", undefined],
		["TREG_API_KEY", " "],
		["TREG_MAX_COST_USD", undefined],
		["TREG_MAX_COST_USD", "0"],
		["TREG_MAX_COST_USD", "Infinity"],
		["TREG_PROVIDERS", "cloro,searchapi"],
	])("fails closed for invalid %s even with native credentials", async (key, value) => {
		vi.stubEnv(key, value);
		vi.stubEnv("CLORO_API_KEY", "native-key");
		vi.stubEnv("DATAFORSEO_LOGIN", "native-login");
		vi.stubEnv("DATAFORSEO_PASSWORD", "native-password");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).rejects.toThrow(/TREG_/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		["cloro", "https://example.org/v1/monitor/gemini", "POST", "{}"],
		["cloro", "http://api.cloro.dev/v1/monitor/gemini", "POST", "{}"],
		["cloro", "https://api.cloro.dev.example.org/v1/monitor/gemini", "POST", "{}"],
		["cloro", "https://api.cloro.dev:444/v1/monitor/gemini", "POST", "{}"],
		["cloro", "https://user:pass@api.cloro.dev/v1/monitor/gemini", "POST", "{}"],
		["cloro", "https://api.cloro.dev/v1/monitor/chatgpt", "POST", "{}"],
		["cloro", CLORO_URL, "PUT", "{}"],
		["cloro", CLORO_URL, "GET", undefined],
		["cloro", "https://api.cloro.dev/v1/async/task/x/extra", "GET", undefined],
		["cloro", "https://api.cloro.dev/v1/async/task", "POST", '{"taskType":"GEMINI","payload":{}}'],
		["cloro", "https://api.cloro.dev/v1/async/task", "POST", '{"taskType":"CHATGPT"}'],
		["cloro", CLORO_URL, "POST", "[]"],
		["cloro", CLORO_URL, "POST", "not-json-private"],
		["dataforseo", DFS_URL, "POST", "{}"],
		["dataforseo", DFS_URL, "POST", "[]"],
		["dataforseo", DFS_URL, "POST", "[{},{}]"],
		["dataforseo", DFS_URL, "POST", "[null]"],
		["dataforseo", "https://api.dataforseo.com/v3/unlisted", "POST", "[{}]"],
		["dataforseo", "https://api.cloro.dev/v1/monitor/gemini", "POST", "[{}]"],
	])("rejects unsupported native requests before network: %s %s %s", async (provider, url, method, payload) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(tregFetch(provider, url, { method, body: payload })).rejects.toThrow(/Treg/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([undefined, "", "-1", "1.5", "Infinity", "9007199254740992", "private"])(
		"keeps unknown/invalid costs nullable: %s",
		async (cost) => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue(response({}, cost === undefined ? {} : { "X-Treg-Cost-Micro": cost })),
			);
			const result = await withTregAudit("cloro", async () => ({
				rawOutput: await (await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).json(),
			}));
			expect(result.rawOutput._treg.requests[0]).toMatchObject({
				observed_charged_micro: null,
				original_cost_micro: null,
			});
		},
	);

	it("distinguishes replay charge from original charge and logs receipt metadata", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					response(
						{},
						{ "X-Treg-Cost-Micro": "0", "X-Treg-Original-Cost-Micro": "25000", "X-Treg-Idempotent-Replay": "true" },
					),
				),
		);
		const result = await withTregAudit("cloro", async () => ({
			rawOutput: await (await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).json(),
		}));
		expect(result.rawOutput._treg.requests[0]).toMatchObject({
			observed_charged_micro: 0,
			original_cost_micro: 25000,
			replayed: true,
		});
		expect(console.info).toHaveBeenCalledTimes(1);
		expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0].slice(7))).toEqual(result.rawOutput._treg.requests[0]);
	});

	it.each([402, 409, 429, 503])("preserves HTTP %s but removes private gateway errors", async (status) => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response('{"balance_micro":12345,"key":"private-key"}', {
					status,
					statusText: "private-status",
					headers: { "X-Treg-Call-Id": "call-failure", "X-Private": "secret", "Retry-After": "10" },
				}),
			),
		);
		const result = await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" });
		expect(result.status).toBe(status);
		expect(result.statusText).toBe("");
		expect(result.headers.get("X-Private")).toBeNull();
		expect(result.headers.get("Retry-After")).toBe("10");
		expect(await result.json()).toEqual({ error: "Treg request failed", call_id: "call-failure" });
	});

	it("refuses successful answers without a gateway call ID", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"text":"answer"}')));
		await expect(tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" })).rejects.toThrow(
			/missing its audit call ID/,
		);
	});

	it("preserves successful status, headers and streamed bytes without eagerly parsing JSON", async () => {
		let source: ReadableStreamDefaultController<Uint8Array> | undefined;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				source = controller;
			},
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(stream, {
					status: 201,
					statusText: "Created",
					headers: { "X-Treg-Call-Id": "stream-call", "X-Native": "value" },
				}),
			),
		);
		const result = await tregFetch("cloro", CLORO_URL, { method: "POST", body: "{}" });
		expect(result.status).toBe(201);
		expect(result.statusText).toBe("Created");
		expect(result.headers.get("X-Native")).toBe("value");
		expect(result.bodyUsed).toBe(false);
		source?.enqueue(new TextEncoder().encode("native-stream"));
		source?.close();
		expect(await result.text()).toBe("native-stream");
	});

	it("sanitizes network errors, logs reconciliation identity, and never automatically retries", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("private-token and prompt"));
		vi.stubGlobal("fetch", fetchMock);
		const error = await tregFetch("dataforseo", DFS_URL, { method: "POST", body }).catch((error: Error) => error);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toMatch(/idempotency key [\da-f-]{36}/);
		expect((error as Error).message).not.toContain("private-token");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(console.info).toHaveBeenCalledTimes(1);
	});

	it("forwards native JSON without native credentials and attaches audit without altering provider fields", async () => {
		const native = { tasks: [{ status_code: 20000, result: [{ text: "example" }] }] };
		const fetchMock = vi.fn().mockResolvedValue(response(native, { "X-Treg-Cost-Micro": "12345" }));
		vi.stubGlobal("fetch", fetchMock);
		const result = await withTregAudit("dataforseo", async () => ({
			rawOutput: await (
				await tregFetch("dataforseo", DFS_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json", Authorization: "Basic native-key", Cookie: "secret" },
					body,
				})
			).json(),
		}));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://treg.to/call/dataforseo.x.serp-google-organic-live-advanced");
		expect(new TextDecoder().decode(request.body as ArrayBuffer)).toBe(body);
		expect(request).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" });
		const headers = new Headers(request.headers);
		expect(headers.get("Authorization")).toBeNull();
		expect(headers.get("Cookie")).toBeNull();
		expect(headers.get("X-Treg-Token")).toBe("gateway-key");
		expect(headers.get("X-Treg-Org")).toBeNull();
		expect(headers.get("X-Treg-Route-Max-Cost")).toBe("2.5");
		expect(headers.get("X-Treg-Meta")).toBe("application=elmo,provider=dataforseo");
		expect(result.rawOutput).toMatchObject({
			...native,
			_treg: { requests: [{ provider: "dataforseo", call_id: "call-example", observed_charged_micro: 12345 }] },
		});
	});
});
