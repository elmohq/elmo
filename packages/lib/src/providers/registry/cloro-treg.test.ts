import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRun } from "../../text-extraction";
import { getProvider } from "../index";
import { cloro } from "./cloro";

const ANSWER = {
	text: "A sample answer.",
	markdown: "A **sample answer**.",
	model: "sample-model",
	sources: [{ url: "https://example.com/source", label: "Source" }],
	searchQueries: ["sample search"],
};

function gatewayResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "X-Treg-Call-Id": "call-cloro", "X-Treg-Cost-Micro": "2400" },
	});
}

beforeEach(() => {
	vi.stubEnv("TREG_PROVIDERS", "cloro");
	vi.stubEnv("TREG_API_KEY", "gateway-test-key");
	vi.stubEnv("TREG_MAX_COST_USD", "0.1");
	vi.stubEnv("CLORO_API_KEY", "");
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("Cloro native interface through Treg (mocked HTTP only)", () => {
	it.each(["network", "headers deadline", "body deadline", "body failure"])(
		"continues polling the accepted task after a transient %s failure without resubmitting",
		async (phase) => {
			vi.useFakeTimers();
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(gatewayResponse({ success: true, task: { id: "accepted-task", status: "QUEUED" } }));
			if (phase === "network") fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
			else if (phase === "headers deadline") fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
			else if (phase === "body failure")
				fetchMock.mockResolvedValueOnce(
					new Response(
						new ReadableStream({
							start(controller) {
								controller.error(new TypeError("terminated"));
							},
						}),
						{ headers: { "X-Treg-Call-Id": "broken-poll" } },
					),
				);
			else
				fetchMock.mockResolvedValueOnce(
					new Response(new ReadableStream(), { headers: { "X-Treg-Call-Id": "stalled-poll" } }),
				);
			fetchMock.mockResolvedValueOnce(
				gatewayResponse({ task: { id: "accepted-task", status: "COMPLETED" }, response: ANSWER }),
			);
			vi.stubGlobal("fetch", fetchMock);
			const pending = getProvider("cloro")
				.run("chatgpt", "A sample prompt?")
				.then(
					(result) => ({ result }),
					(error) => ({ error }),
				);
			await vi.runAllTimersAsync();
			const outcome = await pending;
			if ("error" in outcome) throw outcome.error;
			const result = outcome.result;
			expect(extractRun(result.rawOutput, "cloro").textContent).toBe("A **sample answer**.");
			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
			for (const [url, init] of fetchMock.mock.calls.slice(1)) {
				expect(url).toBe("https://treg.to/call/cloro/v1/async/task/accepted-task");
				expect(init.method).toBe("GET");
			}
			expect(result.rawOutput).toMatchObject({
				_treg: { requests: [expect.any(Object), expect.any(Object), expect.any(Object)] },
			});
		},
	);

	it.each(["authentication", "missing audit ID", "redirect"])(
		"fails closed on a fatal %s polling error",
		async (phase) => {
			vi.useFakeTimers();
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(gatewayResponse({ task: { id: "accepted-task", status: "QUEUED" } }));
			if (phase === "authentication") fetchMock.mockResolvedValueOnce(new Response("private", { status: 403 }));
			else if (phase === "missing audit ID") fetchMock.mockResolvedValueOnce(new Response("{}"));
			else fetchMock.mockRejectedValueOnce(new TypeError("fetch failed", { cause: new Error("unexpected redirect") }));
			vi.stubGlobal("fetch", fetchMock);
			const outcome = cloro.run("chatgpt", "A sample prompt?").catch((error) => error);
			await vi.runAllTimersAsync();
			expect(await outcome).toBeInstanceOf(Error);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
		},
	);

	it.each(["missing key", "unsupported task path"])("does not retry a status lookup with %s", async (phase) => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockImplementationOnce(() => {
			if (phase === "missing key") vi.stubEnv("TREG_API_KEY", "");
			return Promise.resolve(
				gatewayResponse({
					task: { id: phase === "missing key" ? "accepted-task" : "unsupported/path", status: "QUEUED" },
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);
		const outcome = cloro.run("chatgpt", "A sample prompt?").catch((error) => error);
		await vi.runAllTimersAsync();
		expect(await outcome).toBeInstanceOf(Error);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("uses Gemini sync rather than buying an unsupported async task", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(gatewayResponse({ success: true, result: ANSWER }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await cloro.run("gemini", "A sample prompt?");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://treg.to/call/cloro.ai-search.gemini.scrape");
		expect(init.method).toBe("POST");
		expect(await new Response(init.body).json()).toEqual({
			prompt: "A sample prompt?",
			country: "US",
			include: { markdown: true },
		});
		expect(new Headers(init.headers).get("authorization")).toBeNull();
		expect(new Headers(init.headers).get("X-Treg-Token")).toBe("gateway-test-key");
		expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
		expect(result.rawOutput).toEqual(ANSWER);
		expect(extractRun(result.rawOutput, "cloro").textContent).toBe("A **sample answer**.");
		expect(extractRun(result.rawOutput, "cloro").citations.map((citation) => citation.url)).toEqual([
			"https://example.com/source",
		]);
		expect(result.webQueries).toEqual(["sample search"]);
		expect(result.modelVersion).toBe("sample-model");
	});

	it.each([
		{
			model: "bing-ai-mode",
			endpoint: "cloro.bing.serp.ai_mode",
			payload: { prompt: "A sample prompt?", country: "US", include: { markdown: true } },
			response: ANSWER,
		},
		{
			model: "google-ai-mode",
			endpoint: "cloro.google.serp.ai_mode",
			payload: { prompt: "A sample prompt?", gl: "US", include: { markdown: true } },
			response: ANSWER,
		},
		{
			model: "google-ai-overview",
			endpoint: "cloro.google.serp.organic",
			payload: { query: "A sample prompt?", gl: "US", include: { aioverview: { markdown: true } } },
			response: { aioverview: ANSWER, organicResults: [{ title: "Not the answer" }] },
		},
	])("adapts $model's sync body and stores the native result, not the gateway envelope", async (test) => {
		const fetchMock = vi.fn().mockResolvedValueOnce(gatewayResponse({ success: true, result: test.response }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await cloro.run(test.model, "A sample prompt?");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe(`https://treg.to/call/${test.endpoint}`);
		expect(init.method).toBe("POST");
		expect(await new Response(init.body).json()).toEqual(test.payload);
		expect(result.rawOutput).toEqual(test.response);
		expect(extractRun(result.rawOutput, "cloro").textContent).toBe("A **sample answer**.");
		expect(extractRun(result.rawOutput, "cloro").citations.map((citation) => citation.url)).toEqual([
			"https://example.com/source",
		]);
		expect(result.webQueries).toEqual(["sample search"]);
		expect(result.modelVersion).toBe("sample-model");
	});

	it("keeps ChatGPT's native async submit and fresh polls without re-purchasing a task", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(gatewayResponse({ success: true, task: { id: "task-test", status: "QUEUED" } }))
			.mockResolvedValueOnce(gatewayResponse({ task: { id: "task-test", status: "PROCESSING" } }))
			.mockResolvedValueOnce(gatewayResponse({ error: "temporary upstream details" }, 503))
			.mockResolvedValueOnce(gatewayResponse({ task: { id: "task-test", status: "COMPLETED" }, response: ANSWER }));
		vi.stubGlobal("fetch", fetchMock);

		const pending = cloro.run("chatgpt", "A sample prompt?");
		await vi.runAllTimersAsync();
		const result = await pending;

		expect(fetchMock).toHaveBeenCalledTimes(4);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://treg.to/call/cloro.ai-search.chatgpt.scrape.task");
		expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
		expect(await new Response(init.body).json()).toEqual({
			taskType: "CHATGPT",
			payload: {
				prompt: "A sample prompt?",
				country: "US",
				include: { markdown: true, searchQueries: true },
				legacy: true,
			},
		});
		expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
		for (const [pollUrl, pollInit] of fetchMock.mock.calls.slice(1)) {
			expect(String(pollUrl)).toBe("https://treg.to/call/cloro/v1/async/task/task-test");
			expect(new Headers(pollInit?.headers).get("authorization")).toBeNull();
		}
		expect(result.rawOutput).toEqual(ANSWER);
		expect(extractRun(result.rawOutput, "cloro").textContent).toBe("A **sample answer**.");
	});

	it.each([
		{ success: false, error: "private upstream envelope" },
		{ success: true, result: null },
		{ success: true, result: {} },
		{ success: true, result: { markdown: "   ", text: "" } },
	])("fails closed on unusable sync responses without leaking upstream errors (%j)", async (body) => {
		vi.stubEnv("CLORO_API_KEY", "native-key-must-not-be-used");
		const fetchMock = vi.fn().mockResolvedValueOnce(gatewayResponse(body));
		vi.stubGlobal("fetch", fetchMock);

		const error = await cloro.run("gemini", "A sample prompt?").catch((error) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toMatch(/Cloro Treg sync response/);
		expect(error.message).not.toContain("private upstream envelope");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it.each([null, undefined, {}])(
		"does not save organic rows as an AI Overview when aioverview is %j",
		async (overview) => {
			const fetchMock = vi.fn().mockResolvedValueOnce(
				gatewayResponse({
					success: true,
					result: { aioverview: overview, text: "Not an overview", organicResults: [] },
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			await expect(cloro.run("google-ai-overview", "A sample prompt?")).rejects.toThrow("no usable answer");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		},
	);

	it("does not retry or use native credentials after a gateway refusal", async () => {
		vi.stubEnv("CLORO_API_KEY", "native-key-must-not-be-used");
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("private upstream envelope", { status: 403, headers: { "X-Treg-Error": "1" } }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const error = await cloro.run("bing-ai-mode", "A sample prompt?").catch((error) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).not.toContain("private upstream envelope");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toBe("https://treg.to/call/cloro.bing.serp.ai_mode");
		expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBeNull();
	});

	it("rejects unknown models before making any request", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(cloro.run("unsupported-model", "A sample prompt?")).rejects.toThrow("no task mapping");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("checks Bing's URL-encoded prompt limit before any submission", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(cloro.run("bing-ai-mode", "界".repeat(390))).rejects.toThrow("3500 URL-encoded characters");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(["gemini", "google-ai-mode"])("checks %s's documented 10000-character prompt limit", async (model) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(cloro.run(model, "x".repeat(10001))).rejects.toThrow("10000 characters");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("serializes sync submissions FIFO and releases the next on failure", async () => {
		let finishFirst!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finishFirst = resolve;
					}),
			)
			.mockResolvedValueOnce(gatewayResponse({ success: true, result: ANSWER }));
		vi.stubGlobal("fetch", fetchMock);

		const first = cloro.run("gemini", "first").catch((error) => error);
		const second = cloro.run("bing-ai-mode", "second");
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		finishFirst(gatewayResponse({ success: false, error: "private upstream envelope" }));

		expect(await first).toBeInstanceOf(Error);
		expect((await second).rawOutput).toEqual(ANSWER);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect((await new Response(fetchMock.mock.calls[0][1].body).json()).prompt).toBe("first");
		expect((await new Response(fetchMock.mock.calls[1][1].body).json()).prompt).toBe("second");
	});

	it("holds the sync slot until the complete response body is consumed", async () => {
		let finishBody!: () => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"success":true,"result":'));
				finishBody = () => {
					controller.enqueue(new TextEncoder().encode(`${JSON.stringify(ANSWER)}}`));
					controller.close();
				};
			},
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(body, { headers: { "X-Treg-Call-Id": "call-slow-body" } }))
			.mockResolvedValueOnce(gatewayResponse({ success: true, result: ANSWER }));
		vi.stubGlobal("fetch", fetchMock);

		const first = cloro.run("gemini", "first");
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const second = cloro.run("google-ai-mode", "second");
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		finishBody();

		expect((await first).rawOutput).toEqual(ANSWER);
		expect((await second).rawOutput).toEqual(ANSWER);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("rejects a missing Treg key without ever using an available native key", async () => {
		vi.stubEnv("TREG_API_KEY", "");
		vi.stubEnv("CLORO_API_KEY", "native-key-must-not-be-used");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(cloro.run("gemini", "A sample prompt?")).rejects.toThrow("TREG_API_KEY");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects malformed JSON without retrying the sync submission", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response("private invalid upstream body", { headers: { "X-Treg-Call-Id": "call-invalid-json" } }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const error = await cloro.run("gemini", "A sample prompt?").catch((error) => error);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).not.toContain("private invalid upstream body");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("rejects a response without an audit ID rather than saving an untracked answer", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: ANSWER })));
		vi.stubGlobal("fetch", fetchMock);

		await expect(cloro.run("gemini", "A sample prompt?")).rejects.toThrow(/audit call ID/);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("rejects excess local sync demand instead of growing an unbounded submission backlog", async () => {
		let finishFirst!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finishFirst = resolve;
					}),
			)
			.mockImplementation(() => Promise.resolve(gatewayResponse({ success: true, result: ANSWER })));
		vi.stubGlobal("fetch", fetchMock);

		const submissions = Array.from({ length: 200 }, (_, index) =>
			cloro.run("gemini", `prompt ${index}`).catch((error) => error),
		);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		finishFirst(gatewayResponse({ success: true, result: ANSWER }));
		const results = await Promise.all(submissions);

		const errors = results.filter((result) => result instanceof Error);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.every((error) => error.message === "Cloro Treg sync queue is full")).toBe(true);
		expect(fetchMock.mock.calls.length).toBe(results.length - errors.length);
	});

	it("the registered sync adapter retains native provider attribution and adds shared audit metadata", async () => {
		const provider = getProvider("cloro");
		const fetchMock = vi.fn().mockResolvedValueOnce(gatewayResponse({ success: true, result: ANSWER }));
		vi.stubGlobal("fetch", fetchMock);

		expect(provider.id).toBe("cloro");
		expect(provider.isConfigured()).toBe(true);
		const result = await provider.run("gemini", "A sample prompt?");

		expect(extractRun(result.rawOutput, "cloro").textContent).toBe("A **sample answer**.");
		expect(result.rawOutput).toMatchObject({
			...ANSWER,
			_treg: { requests: [{ provider: "cloro", endpoint: "cloro.ai-search.gemini.scrape", call_id: "call-cloro" }] },
		});
	});
});
