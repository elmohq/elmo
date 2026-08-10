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

// Perplexity echoes the prompt back under `search_model_queries`, and suggests
// follow-up questions under `related_queries`.
const PERPLEXITY_RESPONSE = {
	text: "The Sonos Era 100 lasts longer than the Bose SoundLink Flex.",
	sources: [{ position: 1, url: "https://www.soundguys.com/era-100-review", label: "Era 100 review" }],
	search_model_queries: ["Compare the Sonos Era 100 and the Bose SoundLink Flex"],
	related_queries: ["Which is better for a pool party", "What about the JBL Charge 6"],
};

// `relatedLinks` is what Google offers alongside the overview, not what it drew
// on — here a Shopping deep link, which is still not a source for the answer.
const AI_OVERVIEW_WITH_RELATED_LINKS = {
	aioverview: {
		text: "The Audioengine A2+ is a well-reviewed compact desktop speaker system.",
		sources: [{ position: 1, url: "https://www.wired.com/best-computer-speakers", label: "Best computer speakers" }],
		relatedLinks: [
			{
				citationPillId: 1,
				url: "https://www.google.com/search?q=product&prds=pvt:hg,productid:15072490242561411628",
				label: "Audioengine A2+ Bluetooth Speaker",
			},
		],
	},
};

// AI Mode files the same kind of Shopping link under `sources`, alongside pages.
const AI_MODE_RESPONSE = {
	text: "The Bose SoundLink Flex is a well-reviewed portable speaker.",
	sources: [
		{ position: 1, url: "https://www.cnet.com/best-bluetooth-speaker", label: "Best Bluetooth speakers" },
		{
			position: 2,
			url: "https://www.google.com/search?q=product&prds=pvt:hg,productid:12633455567724893623&ibp=oshop",
			label: "Bose SoundLink Flex Portable Bluetooth Speaker",
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
	vi.stubEnv("CLORO_API_KEY", "test-key");
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("cloro provider", () => {
	it("checkpoints an accepted task before polling it", async () => {
		vi.useFakeTimers();
		const checkpoint = vi.fn().mockResolvedValue(undefined);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-checkpoint", status: "QUEUED" } }))
			.mockResolvedValueOnce(
				jsonResponse({ task: { id: "task-checkpoint", status: "COMPLETED" }, response: CHATGPT_RESPONSE }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("chatgpt", "What is a well-reviewed speaker?", {
			idempotencyKey: "scheduler-run-1",
			checkpointExternalTask: checkpoint,
		});
		await vi.runAllTimersAsync();
		await promise;

		expect(checkpoint).toHaveBeenCalledWith("task-checkpoint");
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ idempotencyKey: "scheduler-run-1" });
		expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[1]);
	});

	it("resumes a checkpointed task without submitting a replacement", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ task: { id: "task-resume", status: "COMPLETED" }, response: CHATGPT_RESPONSE }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("chatgpt", "What is a well-reviewed speaker?", {
			externalTaskId: "task-resume",
		});
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("https://api.cloro.dev/v1/async/task/task-resume");
		expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("method", "POST");
		expect(result.textContent).toContain("Sonos Era 300");
	});

	it("submits an async task, polls it, and returns the parsed answer", async () => {
		vi.useFakeTimers();
		const checkpointRawResponse = vi.fn().mockResolvedValue(undefined);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-1", status: "QUEUED" } }))
			.mockResolvedValueOnce(jsonResponse({ task: { id: "task-1", status: "PROCESSING" } }))
			.mockResolvedValueOnce(jsonResponse({ task: { id: "task-1", status: "COMPLETED" }, response: CHATGPT_RESPONSE }));
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("chatgpt", "What is a well-reviewed speaker?", { checkpointRawResponse });
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
		expect(checkpointRawResponse).toHaveBeenCalledWith({ rawOutput: result.rawOutput });
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

	it("stores Perplexity's reported query verbatim and ignores its follow-up suggestions", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-pplx", status: "QUEUED" } }))
			.mockResolvedValueOnce(
				jsonResponse({ task: { id: "task-pplx", status: "COMPLETED" }, response: PERPLEXITY_RESPONSE }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("perplexity", "Compare the Sonos Era 100 and the Bose SoundLink Flex");
		await vi.runAllTimersAsync();
		const result = await promise;

		// The prompt echo is kept as reported — excluding it is the fan-out read
		// path's job — and `related_queries` never counts as a search.
		expect(result.webQueries).toEqual(["Compare the Sonos Era 100 and the Bose SoundLink Flex"]);
	});

	it("does not cite AI Overview's related links", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-rl", status: "QUEUED" } }))
			.mockResolvedValueOnce(
				jsonResponse({ task: { id: "task-rl", status: "COMPLETED" }, response: AI_OVERVIEW_WITH_RELATED_LINKS }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("google-ai-overview", "best desktop speakers");
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(result.citations.map((c) => c.domain)).toEqual(["wired.com"]);
	});

	it("keeps the Shopping link AI Mode files under sources", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-aim", status: "QUEUED" } }))
			.mockResolvedValueOnce(
				jsonResponse({ task: { id: "task-aim", status: "COMPLETED" }, response: AI_MODE_RESPONSE }),
			);
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("google-ai-mode", "best portable speakers");
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(result.citations.map((c) => c.domain)).toEqual(["cnet.com", "google.com"]);
	});

	it("surfaces a transient status API response for circuit accounting", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ success: true, task: { id: "task-2", status: "QUEUED" } }))
			.mockResolvedValueOnce(jsonResponse({ message: "temporary error" }, 500));
		vi.stubGlobal("fetch", fetchMock);

		const promise = cloro.run("perplexity", "What is a well-reviewed speaker?");
		const assertion = expect(promise).rejects.toMatchObject({ taskAccepted: true });
		await vi.runAllTimersAsync();
		await assertion;

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			taskType: "PERPLEXITY",
			payload: { prompt: "What is a well-reviewed speaker?", country: "US" },
		});
	});

	it("terminates a resumed task that the provider no longer retains", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ message: "not found" }, 404)));

		await expect(cloro.run("chatgpt", "prompt", { externalTaskId: "expired-task" })).rejects.toThrow(
			"Cloro task expired-task no longer exists",
		);
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
