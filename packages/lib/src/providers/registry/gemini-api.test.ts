/**
 * Runs the real `ai` + `@ai-sdk/google` stack against a stubbed network, so a
 * change in how the SDK reads or reports Gemini's response fails here rather
 * than silently zeroing out stored answers and citations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { extractRun } from "../../text-extraction";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import { geminiApi } from "./gemini-api";

vi.mock("../../secrets", () => ({ getCredential: (key: string) => (key === "GEMINI_API_KEY" ? "gemini-key" : "") }));

const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123";
const REAL_URL = "https://www.whathifi.com/best-buys/hi-fi/best-hi-fi-speakers";

function generateContentResponse(over: Record<string, unknown> = {}) {
	return {
		candidates: [
			{
				content: { role: "model", parts: [{ text: "Elmo tracks " }, { text: "AI visibility." }] },
				finishReason: "STOP",
				...over,
			},
		],
		usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
		modelVersion: "gemini-3.8-flash",
	};
}

const groundedResponse = generateContentResponse({
	groundingMetadata: {
		webSearchQueries: ["best hi-fi speakers", "speaker reviews"],
		searchEntryPoint: { renderedContent: "<style>.chip{}</style><div>suggestions</div>" },
		groundingChunks: [
			{ web: { uri: REDIRECT, title: "whathifi.com" } },
			{ web: { uri: "https://example.com/a", title: "example.com" } },
		],
		groundingSupports: [],
	},
});

let geminiBody: unknown;
const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
	const url = String(input);
	if (url.startsWith(REDIRECT)) return new Response(null, { status: 302, headers: { location: REAL_URL } });
	return new Response(JSON.stringify(geminiBody), { status: 200, headers: { "content-type": "application/json" } });
});

/** The generateContent request the SDK sent to Google. */
function sentRequest(): { url: string; headers: Headers; body: Record<string, any> } {
	const call = fetchMock.mock.calls.find(([input]) => String(input).includes("generativelanguage.googleapis.com"));
	if (!call) throw new Error("no Gemini request was sent");
	const [input, init] = call;
	return { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
}

const stored = (result: { rawOutput: unknown }) => extractRun(result.rawOutput, "gemini-api");

beforeEach(() => {
	geminiBody = generateContentResponse();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("gemini-api run", () => {
	it("calls the pinned model with the operator's key and an output cap", async () => {
		await geminiApi.run("gemini", "prompt", { webSearch: false, version: "gemini-3.8-flash" });

		const request = sentRequest();
		expect(request.url).toContain("models/gemini-3.8-flash:generateContent");
		expect(request.headers.get("x-goog-api-key")).toBe("gemini-key");
		expect(request.body.generationConfig.maxOutputTokens).toBe(API_PROVIDER_MAX_OUTPUT_TOKENS["gemini-api"]);
	});

	it("grounds with Google Search only when web search is on", async () => {
		await geminiApi.run("gemini", "prompt", { webSearch: false, version: "gemini-3.8-flash" });
		expect(sentRequest().body.tools).toBeUndefined();

		fetchMock.mockClear();
		await geminiApi.run("gemini", "prompt", { webSearch: true, version: "gemini-3.8-flash" });
		expect(sentRequest().body.tools).toEqual([{ googleSearch: {} }]);
	});

	it("stores an answer that reads back as the model's text", async () => {
		const res = await geminiApi.run("gemini", "prompt", { webSearch: false, version: "gemini-3.8-flash" });

		expect(stored(res)).toEqual({ textContent: "Elmo tracks AI visibility.", citations: [] });
		expect(res.webQueries).toEqual([]);
		expect(res.modelVersion).toBe("gemini-3.8-flash");
	});

	it("logs a warning when the response stops on the output cap", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		geminiBody = generateContentResponse({ finishReason: "MAX_TOKENS" });

		await geminiApi.run("gemini", "prompt", { webSearch: false, version: "gemini-3.8-flash" });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("hit the output cap"));
	});
});

describe("gemini-api grounded runs", () => {
	beforeEach(() => {
		geminiBody = structuredClone(groundedResponse);
	});

	it("cites the real source behind each grounding redirect", async () => {
		const res = await geminiApi.run("gemini", "prompt", { webSearch: true, version: "gemini-3.8-flash" });

		expect(fetchMock).toHaveBeenCalledWith(REDIRECT, expect.objectContaining({ redirect: "manual" }));
		expect(stored(res).citations).toEqual([
			{ url: REAL_URL, title: "whathifi.com", domain: "whathifi.com", citationIndex: 0 },
			{ url: "https://example.com/a", title: "example.com", domain: "example.com", citationIndex: 1 },
		]);
	});

	it("keeps the redirect when it won't resolve, rather than failing the run", async () => {
		fetchMock.mockImplementation(async (input) => {
			if (String(input).startsWith(REDIRECT)) throw new Error("network down");
			return new Response(JSON.stringify(geminiBody), { status: 200 });
		});

		const res = await geminiApi.run("gemini", "prompt", { webSearch: true, version: "gemini-3.8-flash" });

		expect(stored(res).citations.map((c) => c.url)).toEqual([REDIRECT, "https://example.com/a"]);
	});

	it("reports the searches Gemini ran", async () => {
		const res = await geminiApi.run("gemini", "prompt", { webSearch: true, version: "gemini-3.8-flash" });

		expect(res.webQueries).toEqual(["best hi-fi speakers", "speaker reviews"]);
	});

	it("marks queries unavailable when Gemini cited sources but didn't say what it searched", async () => {
		geminiBody = generateContentResponse({
			groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/a", title: "example.com" } }] },
		});

		const res = await geminiApi.run("gemini", "prompt", { webSearch: true, version: "gemini-3.8-flash" });

		expect(res.webQueries).toEqual([WEB_QUERIES_UNAVAILABLE]);
	});

	it("drops the search-suggestions widget from the stored payload", async () => {
		const res = await geminiApi.run("gemini", "prompt", { webSearch: true, version: "gemini-3.8-flash" });

		expect(JSON.stringify(res.rawOutput)).not.toContain("suggestions");
		expect(stored(res).textContent).toBe("Elmo tracks AI visibility.");
	});
});

describe("gemini-api structured research", () => {
	const schema = z.object({ brand: z.string(), competitors: z.array(z.string()) });
	const payload = { brand: "Elmo", competitors: ["a", "b"] };

	beforeEach(() => {
		geminiBody = generateContentResponse({ content: { role: "model", parts: [{ text: JSON.stringify(payload) }] } });
	});

	it("returns the schema-validated object, grounded in Google Search by default", async () => {
		const res = await geminiApi.runStructuredResearch!({ prompt: "p", schema });

		expect(res.object).toEqual(payload);
		const { body } = sentRequest();
		expect(body.tools).toEqual([{ googleSearch: {} }]);
		expect(body.generationConfig.responseMimeType).toBe("application/json");
	});

	it("sends no tools for a pure completion", async () => {
		const res = await geminiApi.runStructuredResearch!({ prompt: "p", schema, webSearch: false });

		expect(res.object).toEqual(payload);
		expect(sentRequest().body.tools).toBeUndefined();
	});
});
