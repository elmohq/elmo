import { afterEach, describe, expect, it, vi } from "vitest";
import { brightdata, extractWebQueries, readAnswer } from "./brightdata";

vi.mock("@brightdata/sdk", () => ({
	bdclient: class {
		scrape = { snapshot: { cancel: vi.fn().mockResolvedValue(undefined), fetch: vi.fn() } };
		close = vi.fn().mockResolvedValue(undefined);
	},
}));

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("extractWebQueries", () => {
	it("reports the queries a run expanded the prompt into", () => {
		expect(
			extractWebQueries({
				web_search_query: ["best running shoes", "running shoe reviews"],
			}),
		).toEqual(["best running shoes", "running shoe reviews"]);
	});

	it("keeps queries on a run that reports web_search_triggered false", () => {
		// Real ChatGPT runs mostly carry `false` here while still reporting a query
		// derived from the prompt, so the flag cannot be used to discard them —
		// doing so drops the bulk of genuine fan-out data.
		expect(
			extractWebQueries({
				web_search_triggered: false,
				web_search_query: ["test 1 meaning"],
			}),
		).toEqual(["test 1 meaning"]);
	});

	it("reads ChatGPT's nested query shape", () => {
		expect(
			extractWebQueries({ metadata: { search_model_queries: { queries: ["trail shoes", "hiking boots"] } } }),
		).toEqual(["trail shoes", "hiking boots"]);
	});

	it("drops blanks and non-strings rather than recording them as searches", () => {
		expect(extractWebQueries({ web_search_query: ["ok", "", "   ", null, 7] })).toEqual(["ok"]);
	});

	it("reports nothing when the payload carries no query fields", () => {
		expect(extractWebQueries({ answer_text: "hello" })).toEqual([]);
	});
});

describe("readAnswer", () => {
	it("reads the answer the chatbot gave, preferring the markdown form", () => {
		expect(readAnswer({ answer_text_markdown: "  **Yes**  ", answer_text: "Yes" }, "chatgpt snapshot sd_1")).toBe(
			"**Yes**",
		);
	});

	it("fails a run BrightData could not collect, naming the reason it gave", () => {
		const record = {
			timestamp: "2026-09-06T10:37:52.406Z",
			input: { url: "https://www.perplexity.ai/", prompt: "best speakers", index: 1 },
			error: "Crawler error: Unexpected Status 502 (no_peer)",
			error_code: "no_peers",
		};
		expect(() => readAnswer(record, "perplexity snapshot sd_2")).toThrow(
			/perplexity snapshot sd_2 .*Crawler error: Unexpected Status 502 \(no_peer\).*no_peers/,
		);
	});

	it("fails a row with no answer rather than passing the payload off as one", () => {
		expect(() => readAnswer({ input: { prompt: "best speakers" } }, "gemini snapshot sd_3")).toThrow(
			/gemini snapshot sd_3/,
		);
	});

	it("keeps an answer that arrived alongside an error field", () => {
		expect(readAnswer({ answer_text: "Yes", error: "partial page load" }, "copilot snapshot sd_4")).toBe("Yes");
	});

	it("treats an empty error field as no error at all", () => {
		expect(() => readAnswer({ error: "", error_code: null }, "chatgpt snapshot sd_5")).toThrow(/no answer/);
	});
});

describe("brightdata polling", () => {
	it("polls a running snapshot past BrightData's nine-minute give-up before abandoning it", async () => {
		vi.useFakeTimers();
		vi.stubEnv("BRIGHTDATA_API_TOKEN", "test-token");
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockImplementation((url: string) =>
					Promise.resolve(
						url.includes("/trigger") ? jsonResponse({ snapshot_id: "sd_stuck" }) : jsonResponse({ status: "running" }),
					),
				),
		);

		const promise = brightdata.run("perplexity", "What is a well-reviewed speaker?", { webSearch: true });
		const settled: Promise<Error> = promise.then(
			() => {
				throw new Error("expected the run to reject");
			},
			(e: unknown) => e as Error,
		);
		await vi.runAllTimersAsync();
		const error = await settled;

		expect(error.message).toMatch(/sd_stuck timed out/);
		expect(Number(error.message.match(/timed out after (\d+)s/)?.[1])).toBeGreaterThanOrEqual(9 * 60);
	});
});
