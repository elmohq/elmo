import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { oxylabs } from "./oxylabs";

const RESULT_PAYLOAD = {
	results: [
		{
			content: {
				markdown_text: "The Sonos Era 300 is a well-reviewed speaker released recently.",
				citations: [{ url: "https://www.whathifi.com/reviews/sonos-era-300", title: "Sonos Era 300 review" }],
				search_queries: ["recent speaker reviews"],
				llm_model: "gpt-5",
			},
		},
	],
};

// Perplexity exposes no searches of its own, only the follow-up questions it
// suggests below an answer.
const PERPLEXITY_PAYLOAD = {
	results: [
		{
			content: {
				markdown_text: "The Sonos Era 300 is a well-reviewed speaker released recently.",
				citations: [{ url: "https://www.whathifi.com/reviews/sonos-era-300", title: "Sonos Era 300 review" }],
				related_queries: ["What about the JBL Charge 6", "Which is better for a pool party"],
			},
		},
	],
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	vi.stubEnv("OXYLABS_USERNAME", "test-user");
	vi.stubEnv("OXYLABS_PASSWORD", "test-password");
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("oxylabs provider", () => {
	it("checkpoints an accepted job before polling it", async () => {
		vi.useFakeTimers();
		const checkpoint = vi.fn().mockResolvedValue(undefined);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ id: "job-checkpoint", status: "pending" }, 202))
			.mockResolvedValueOnce(jsonResponse({ id: "job-checkpoint", status: "done" }))
			.mockResolvedValueOnce(jsonResponse(RESULT_PAYLOAD));
		vi.stubGlobal("fetch", fetchMock);

		const promise = oxylabs.run("chatgpt", "What is a well-reviewed speaker?", {
			webSearch: true,
			checkpointExternalTask: checkpoint,
		});
		await vi.runAllTimersAsync();
		await promise;

		expect(checkpoint).toHaveBeenCalledWith("job-checkpoint");
		expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[1]);
	});

	it("resumes a checkpointed job without submitting a replacement", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ id: "job-resume", status: "done" }))
			.mockResolvedValueOnce(jsonResponse(RESULT_PAYLOAD));
		vi.stubGlobal("fetch", fetchMock);

		const result = await oxylabs.run("chatgpt", "What is a well-reviewed speaker?", {
			webSearch: true,
			externalTaskId: "job-resume",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0]).toBe("https://data.oxylabs.io/v1/queries/job-resume");
		expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("method", "POST");
		expect(result.textContent).toContain("Sonos Era 300");
	});

	it("submits a Push-Pull job, polls it, and retrieves parsed results", async () => {
		vi.useFakeTimers();
		const checkpointRawResponse = vi.fn().mockResolvedValue(undefined);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ id: "job-123", status: "pending" }, 202))
			.mockResolvedValueOnce(jsonResponse({ id: "job-123", status: "pending" }))
			.mockResolvedValueOnce(jsonResponse({ id: "job-123", status: "done" }))
			.mockResolvedValueOnce(jsonResponse(RESULT_PAYLOAD));
		vi.stubGlobal("fetch", fetchMock);

		const promise = oxylabs.run("chatgpt", "What is a well-reviewed speaker?", {
			webSearch: true,
			checkpointRawResponse,
		});
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(fetchMock.mock.calls[0][0]).toBe("https://data.oxylabs.io/v1/queries");
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			method: "POST",
			headers: {
				Authorization: "Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=",
				"Content-Type": "application/json",
			},
		});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			source: "chatgpt",
			prompt: "What is a well-reviewed speaker?",
			parse: true,
			search: true,
		});
		expect(fetchMock.mock.calls[1][0]).toBe("https://data.oxylabs.io/v1/queries/job-123");
		expect(fetchMock.mock.calls[3][0]).toBe("https://data.oxylabs.io/v1/queries/job-123/results");
		expect(result.textContent).toContain("Sonos Era 300");
		expect(result.citations).toHaveLength(1);
		expect(result.webQueries).toEqual(["recent speaker reviews"]);
		expect(result.modelVersion).toBe("gpt-5");
		expect(checkpointRawResponse).toHaveBeenCalledWith({ rawOutput: result.rawOutput });
	});

	it("does not count Perplexity's suggested follow-ups as searches", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ id: "job-pplx", status: "pending" }, 202))
			.mockResolvedValueOnce(jsonResponse({ id: "job-pplx", status: "done" }))
			.mockResolvedValueOnce(jsonResponse(PERPLEXITY_PAYLOAD));
		vi.stubGlobal("fetch", fetchMock);

		const promise = oxylabs.run("perplexity", "What is a well-reviewed speaker?", { webSearch: true });
		await vi.runAllTimersAsync();
		const result = await promise;

		// Citations prove a search ran, but Oxylabs never reports what was searched.
		expect(result.citations).toHaveLength(1);
		expect(result.webQueries).toEqual(["unavailable"]);
	});

	it("uses the same asynchronous flow for Google AI Mode", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ id: "job-google", status: "done" }, 202))
			.mockResolvedValueOnce(jsonResponse(RESULT_PAYLOAD));
		vi.stubGlobal("fetch", fetchMock);

		await oxylabs.run("google-ai-mode", "What are the best speakers?", { webSearch: true });

		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			source: "google_ai_mode",
			query: "What are the best speakers?",
			parse: true,
			render: "html",
		});
		expect(fetchMock.mock.calls[1][0]).toBe("https://data.oxylabs.io/v1/queries/job-google/results");
	});

	it("surfaces a transient status API response for circuit accounting", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ id: "job-transient", status: "pending" }, 202))
			.mockResolvedValueOnce(jsonResponse({ message: "temporary error" }, 500));
		vi.stubGlobal("fetch", fetchMock);

		const promise = oxylabs.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: false });
		const assertion = expect(promise).rejects.toMatchObject({ taskAccepted: true });
		await vi.runAllTimersAsync();
		await assertion;

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("terminates a resumed job that the provider no longer retains", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ message: "not found" }, 404)));

		await expect(oxylabs.run("chatgpt", "prompt", { webSearch: true, externalTaskId: "expired-job" })).rejects.toThrow(
			"Oxylabs job expired-job no longer exists",
		);
	});

	it("fails a faulted asynchronous job without requesting results", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ id: "job-faulted", status: "pending" }, 202))
			.mockResolvedValueOnce(jsonResponse({ id: "job-faulted", status: "faulted", statuses: [{ status_code: 613 }] }));
		vi.stubGlobal("fetch", fetchMock);

		const promise = oxylabs.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: true });
		const assertion = expect(promise).rejects.toThrow("Oxylabs job job-faulted faulted");
		await vi.runAllTimersAsync();
		await assertion;

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("surfaces job submission errors", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ message: "invalid credentials" }, 401));
		vi.stubGlobal("fetch", fetchMock);

		await expect(oxylabs.run("chatgpt", "What is a well-reviewed speaker?", { webSearch: true })).rejects.toThrow(
			'Oxylabs job submission failed (401: {"message":"invalid credentials"})',
		);
	});
});
