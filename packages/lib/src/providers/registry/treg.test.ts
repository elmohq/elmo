import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRun } from "../../text-extraction";
import type { ModelConfig, ProviderOptions } from "../types";
import { treg } from "./treg";

vi.mock("../../secrets", () => ({ getCredential: (name: string) => process.env[name] }));

const BING_RESULT = {
	text: "Example has a useful reference page.",
	markdown: "**Example** has a [useful reference page](https://example.org/reference).",
	sources: [{ url: "https://example.org/reference", label: "Example reference" }],
	model: "bing-ai-mode",
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "X-Treg-Call-Id": "call-example", ...headers },
	});
}

beforeEach(() => {
	vi.stubEnv("TREG_API_KEY", "test-key");
	vi.stubEnv("TREG_ORG", "example-team");
	vi.stubEnv("TREG_MAX_COST_USD", undefined);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("treg provider", () => {
	it("purchases a synchronous Bing answer with extractable text and citations", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ success: true, result: BING_RESULT }, 200, { "X-Treg-Cost-Micro": "10000" }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await treg.run("bing-ai-mode", "Find the Example reference page.", { webSearch: true });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("https://treg.to/call/cloro.bing.serp.ai_mode");
		const request = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = new Headers(request.headers);
		expect(request.method).toBe("POST");
		expect(headers.get("X-Treg-Token")).toBe("test-key");
		expect(headers.get("X-Treg-Org")).toBe("example-team");
		expect(headers.get("X-Treg-Route-Max-Cost")).toBe("0.01");
		expect(headers.get("Authorization")).toBeNull();
		expect(headers.get("X-Treg-Meta")).toBe("application=elmo,feature=bing-ai-mode");
		expect(headers.get("Idempotency-Key")).toMatch(/^[\da-f-]{36}$/);
		expect(request.signal).toBeInstanceOf(AbortSignal);
		expect(JSON.parse(request.body as string)).toEqual({
			prompt: "Find the Example reference page.",
			country: "US",
			include: { markdown: true },
		});
		expect(result.rawOutput).toEqual({
			response: BING_RESULT,
			_treg: {
				call_id: "call-example",
				observed_charged_micro: 10000,
				idempotency_key: headers.get("Idempotency-Key"),
			},
		});
		const extracted = extractRun(result.rawOutput, "treg");
		expect(extracted.textContent).toBe(BING_RESULT.markdown);
		expect(extracted.citations).toMatchObject([
			{ url: "https://example.org/reference", domain: "example.org", title: "Example reference" },
		]);
		expect(result.webQueries).toEqual(["unavailable"]);
		expect(result.modelVersion).toBe("bing-ai-mode");
	});

	it.each(["TREG_API_KEY", "TREG_ORG"])("requires %s to be configured and to purchase", async (key) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(treg.isConfigured()).toBe(true);
		vi.stubEnv(key, undefined);
		expect(treg.isConfigured()).toBe(false);
		await expect(treg.run("bing-ai-mode", "Example reference", { webSearch: true })).rejects.toThrow(
			"TREG_API_KEY and TREG_ORG",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("validates the explicit Bing online target", () => {
		expect(treg.validateTarget?.({ model: "bing-ai-mode", provider: "treg", webSearch: true })).toBeNull();
	});

	it.each<[string, ProviderOptions | undefined, string]>([
		["chatgpt", { webSearch: true }, "only supports"],
		["copilot", { webSearch: true }, "only supports"],
		["bing-ai-mode", undefined, "requires :online"],
		["bing-ai-mode", { webSearch: false }, "requires :online"],
		["bing-ai-mode", { webSearch: true, version: "example-version" }, "does not accept a version"],
		["bing-ai-mode", { webSearch: true, version: "" }, "does not accept a version"],
	])("rejects unsupported targets before purchasing: %s %j", async (model, options, message) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const config: ModelConfig = { model, provider: "treg", webSearch: false, ...options };
		expect(treg.validateTarget?.(config)).toContain(message);
		await expect(treg.run(model, "Example reference", options)).rejects.toThrow(message);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each(["", " ", "a".repeat(3501), "é".repeat(584), "\uD800"])(
		"rejects an invalid prompt before purchasing: %#",
		async (prompt) => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			await expect(treg.run("bing-ai-mode", prompt, { webSearch: true })).rejects.toThrow(/Treg requires/);
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it.each(["a".repeat(3500), "é".repeat(583)])("accepts prompts within the encoded limit: %#", async (prompt) => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, result: BING_RESULT }));
		vi.stubGlobal("fetch", fetchMock);
		await treg.run("bing-ai-mode", prompt, { webSearch: true });
		expect(JSON.parse(fetchMock.mock.calls[0][1].body).prompt).toBe(prompt);
	});

	it("honors a smaller configured per-call ceiling", async () => {
		vi.stubEnv("TREG_MAX_COST_USD", "0.005");
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, result: BING_RESULT }));
		vi.stubGlobal("fetch", fetchMock);
		await treg.run("bing-ai-mode", "Example reference", { webSearch: true });
		expect(new Headers(fetchMock.mock.calls[0][1].headers).get("X-Treg-Route-Max-Cost")).toBe("0.005");
	});

	it.each(["", " ", "0", "-0.01", "0.010001", "Infinity", "NaN", "example"])(
		"rejects invalid cost ceiling %j before purchasing",
		async (cost) => {
			vi.stubEnv("TREG_MAX_COST_USD", cost);
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			await expect(treg.run("bing-ai-mode", "Example reference", { webSearch: true })).rejects.toThrow(
				"TREG_MAX_COST_USD must be a positive finite number no greater than 0.01",
			);
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);

	it.each<[string | undefined, number | null]>([
		[undefined, null],
		["", null],
		["unknown", null],
		["-1", null],
		["1.5", null],
		["Infinity", null],
		["9007199254740992", null],
		["0", 0],
		["5000", 5000],
	])("records observed cost %j without inventing a zero charge", async (cost, expected) => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					jsonResponse(
						{ success: true, result: BING_RESULT },
						200,
						cost === undefined ? {} : { "X-Treg-Cost-Micro": cost },
					),
				),
		);
		const result = await treg.run("bing-ai-mode", "Example reference", { webSearch: true });
		expect(result.rawOutput).toMatchObject({ _treg: { observed_charged_micro: expected } });
	});

	it.each([
		{ text: "Example text answer." },
		{ text: " ", markdown: "**Example markdown answer.**" },
		{ markdown: "## Search results\n\n[Example](https://example.org/reference)", sources: BING_RESULT.sources },
	])("preserves usable answers without fabricating missing fields: %j", async (answer) => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ success: true, result: answer })));
		const result = await treg.run("bing-ai-mode", "Example reference", { webSearch: true });
		expect(result.rawOutput).toMatchObject({ response: answer });
		expect(extractRun(result.rawOutput, "treg").textContent).toBe(answer.markdown ?? answer.text);
	});

	it.each([
		null,
		[],
		{},
		{ success: false, result: BING_RESULT, error: "test-key private error" },
		{ result: BING_RESULT },
		{ success: "true", result: BING_RESULT },
		{ success: true },
		{ success: true, result: null },
		{ success: true, result: [] },
		{ success: true, result: {} },
		{ success: true, result: { text: " ", markdown: "\n" } },
		{ success: true, result: { text: 42, markdown: false, sources: BING_RESULT.sources } },
		{ success: true, task: { id: "example-task", status: "QUEUED" } },
		{ success: true, result: { response: BING_RESULT } },
	])("rejects unusable envelopes without leaking their contents: %j", async (body) => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
		vi.stubGlobal("fetch", fetchMock);
		const error = await treg.run("bing-ai-mode", "Example reference", { webSearch: true }).catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ message: expect.stringContaining("successful nonempty Bing answer") });
		expect(String(error)).toContain("HTTP 200; call ID call-example");
		expect(String(error)).not.toContain("test-key");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("requires an audit call ID even when an answer is usable", async () => {
		const response = jsonResponse({ success: true, result: BING_RESULT });
		response.headers.delete("X-Treg-Call-Id");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
		await expect(treg.run("bing-ai-mode", "Example reference", { webSearch: true })).rejects.toThrow(
			"missing its audit call ID",
		);
	});

	it("does not expose malformed response bodies or JSON parser errors", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("test-key private body", { headers: { "X-Treg-Call-Id": "call-json" } })),
		);
		const error = await treg.run("bing-ai-mode", "Example reference", { webSearch: true }).catch((e: Error) => e);
		expect(String(error)).toContain("could not be read as JSON (HTTP 200; call ID call-json");
		expect(String(error)).not.toContain("test-key");
		expect(String(error)).not.toContain("private body");
	});

	it.each([401, 429, 500])("does not retry or expose upstream HTTP %s errors", async (status) => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse({ error: "test-key private provider details" }, status, { "Retry-After": "1" }));
		vi.stubGlobal("fetch", fetchMock);
		const error = await treg.run("bing-ai-mode", "Example reference", { webSearch: true }).catch((e: Error) => e);
		expect(String(error)).toContain(`HTTP ${status}; call ID call-example`);
		expect(String(error)).toContain(new Headers(fetchMock.mock.calls[0][1].headers).get("Idempotency-Key"));
		expect(String(error)).not.toContain("test-key");
		expect(String(error)).not.toContain("private provider details");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("does not retry a network interruption and retains the idempotency key for reconciliation", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("test-key private network details"));
		vi.stubGlobal("fetch", fetchMock);
		const error = await treg.run("bing-ai-mode", "Example reference", { webSearch: true }).catch((e: Error) => e);
		expect(String(error)).toContain("request interrupted or timed out");
		expect(String(error)).toContain(new Headers(fetchMock.mock.calls[0][1].headers).get("Idempotency-Key"));
		expect(String(error)).toContain("Reconcile before retrying");
		expect(String(error)).not.toContain("test-key");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("aborts a request at 180 seconds without retrying", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockImplementation((_url: string, request: RequestInit) => {
			return new Promise<Response>((_resolve, reject) => {
				request.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		const run = treg.run("bing-ai-mode", "Example reference", { webSearch: true });
		const assertion = expect(run).rejects.toThrow("request interrupted or timed out");
		await vi.advanceTimersByTimeAsync(179_999);
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await assertion;
		expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("serializes purchases in FIFO order through body consumption and recovers after rejection", async () => {
		let releaseBody: (body: unknown) => void = () => {};
		let bodyStarted: () => void = () => {};
		const started = new Promise<void>((resolve) => {
			bodyStarted = resolve;
		});
		const firstResponse = jsonResponse({});
		vi.spyOn(firstResponse, "json").mockImplementation(() => {
			bodyStarted();
			return new Promise((resolve) => {
				releaseBody = resolve;
			});
		});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(firstResponse)
			.mockRejectedValueOnce(new Error("example network interruption"))
			.mockResolvedValueOnce(jsonResponse({ success: true, result: BING_RESULT }));
		vi.stubGlobal("fetch", fetchMock);
		const first = treg.run("bing-ai-mode", "First example", { webSearch: true });
		const second = treg.run("bing-ai-mode", "Second example", { webSearch: true });
		const secondAssertion = expect(second).rejects.toThrow("request interrupted");
		const third = treg.run("bing-ai-mode", "Third example", { webSearch: true });
		await started;
		expect(fetchMock).toHaveBeenCalledTimes(1);
		releaseBody({ success: true, result: BING_RESULT });
		await first;
		await secondAssertion;
		const result = await third;
		expect(extractRun(result.rawOutput, "treg").textContent).toBe(BING_RESULT.markdown);
		expect(fetchMock.mock.calls.map(([, request]) => JSON.parse(request.body).prompt)).toEqual([
			"First example",
			"Second example",
			"Third example",
		]);
		const keys = fetchMock.mock.calls.map(([, request]) => new Headers(request.headers).get("Idempotency-Key"));
		expect(new Set(keys).size).toBe(3);
	});
});
