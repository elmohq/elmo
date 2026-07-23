import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloro } from "./cloro";

// A completed ChatGPT task `response`: the answer text plus the two source
// arrays (the `sources` reference panel and the inline `citationPills`), which
// overlap on one URL to exercise de-duplication.
const CHATGPT_RESPONSE = {
	text: "The Sonos Era 300 is a well-reviewed speaker released recently.",
	model: "gpt-5-3-mini",
	sources: [{ position: 1, url: "https://www.whathifi.com/reviews/sonos-era-300", label: "Sonos Era 300 review" }],
	citationPills: [
		{
			citationPillId: 1,
			url: "https://www.whathifi.com/reviews/sonos-era-300",
			label: "Sonos Era 300 review",
			domain: "whathifi.com",
			position: 1,
		},
		{
			citationPillId: 2,
			url: "https://www.techradar.com/best-speakers",
			label: "Best speakers 2026",
			domain: "techradar.com",
			position: 2,
		},
	],
	searchQueries: ["recent speaker reviews"],
};

const AI_OVERVIEW_RESPONSE = {
	aioverview: {
		text: "The best running shoes for beginners include the Brooks Ghost and Nike Pegasus.",
		markdown: "The best running shoes for beginners include the **Brooks Ghost** and Nike Pegasus.",
		sources: [{ position: 1, url: "https://www.runnersworld.com/best-beginner-shoes", label: "Best beginner shoes" }],
		citationPills: [
			{
				citationPillId: 1,
				url: "https://www.runnersworld.com/best-beginner-shoes",
				label: "Best beginner shoes",
				domain: "runnersworld.com",
				position: 1,
			},
		],
	},
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	vi.stubEnv("CLORO_API_KEY", "test-key");
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("cloro provider", () => {
	it("submits an async task, polls it, and returns the parsed answer", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-1", status: "QUEUED" } }))
			.mockResolvedValueOnce(jsonResponse({ task: { id: "task-1", status: "PROCESSING" } }))
			.mockResolvedValueOnce(jsonResponse({ task: { id: "task-1", status: "COMPLETED" }, response: CHATGPT_RESPONSE }));
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("chatgpt", "What is a well-reviewed speaker?");
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[0][0]).toBe("https://api.cloro.dev/v1/async/task");
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			method: "POST",
			headers: {
				Authorization: "Bearer test-key",
				"Content-Type": "application/json",
			},
		});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			taskType: "CHATGPT",
			payload: { prompt: "What is a well-reviewed speaker?", country: "US", include: { searchQueries: true } },
		});
		expect(fetchMock.mock.calls[1][0]).toBe("https://api.cloro.dev/v1/async/task/task-1");

		expect(result.textContent).toContain("Sonos Era 300");
		// whathifi appears in both `sources` and `citationPills`; techradar only in
		// the pills — so two distinct citations after de-duplication.
		expect(result.citations).toHaveLength(2);
		expect(result.citations.map((c) => c.domain)).toEqual(["whathifi.com", "techradar.com"]);
		expect(result.webQueries).toEqual(["recent speaker reviews"]);
		expect(result.modelVersion).toBe("gpt-5-3-mini");
	});

	it("maps Google AI Overview onto the Google Search task and unwraps the overview", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-aio", status: "QUEUED" } }))
			.mockResolvedValueOnce(
				jsonResponse({ task: { id: "task-aio", status: "COMPLETED" }, response: AI_OVERVIEW_RESPONSE }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("google-ai-overview", "best running shoes for beginners");
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			taskType: "GOOGLE",
			payload: {
				query: "best running shoes for beginners",
				country: "US",
				include: { aioverview: { markdown: true } },
			},
		});
		expect(result.textContent).toContain("Brooks Ghost");
		expect(result.citations).toHaveLength(1);
		expect(result.citations[0].domain).toBe("runnersworld.com");
		// The overview exposes no query strings, but its citations prove a search ran.
		expect(result.webQueries).toEqual(["unavailable"]);
	});

	it("keeps polling through transient and no-content status responses", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-2", status: "QUEUED" } }))
			.mockResolvedValueOnce(jsonResponse({ message: "temporary error" }, 500))
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(jsonResponse({ task: { id: "task-2", status: "COMPLETED" }, response: CHATGPT_RESPONSE }));
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("perplexity", "What is a well-reviewed speaker?");
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			taskType: "PERPLEXITY",
			payload: { prompt: "What is a well-reviewed speaker?", country: "US" },
		});
		expect(result.textContent).toContain("Sonos Era 300");
	});

	it("fails a task whose status settles on FAILED", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-3", status: "QUEUED" } }))
			.mockResolvedValueOnce(jsonResponse({ task: { id: "task-3", status: "FAILED", error: "upstream blocked" } }));
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("gemini", "What is a well-reviewed speaker?");
		const assertion = expect(promise).rejects.toThrow("Cloro task task-3 failed (upstream blocked)");
		await vi.runAllTimersAsync();
		await assertion;
	});

	it("surfaces task submission errors", async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "Invalid or missing API key" }, 401));
		vi.stubGlobal("fetch", fetchMock);

		await expect(cloro.run("copilot", "What is a well-reviewed speaker?")).rejects.toThrow(
			'Cloro task submission failed (401: {"error":"Invalid or missing API key"})',
		);
	});
});
