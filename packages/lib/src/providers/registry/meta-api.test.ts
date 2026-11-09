import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRun } from "../../text-extraction";
import { metaApi } from "./meta-api";

function stubFetch(json: unknown, ok = true) {
	const fetchMock = vi
		.fn()
		.mockResolvedValue({ ok, status: ok ? 200 : 401, json: async () => json, text: async () => "denied" });
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
	const [, init] = fetchMock.mock.calls[0];
	return JSON.parse((init as RequestInit).body as string);
}

const groundedResponse = {
	model: "muse-spark-1.1",
	output: [
		{ type: "web_search_call", action: { type: "search", query: "best running shoes 2026" } },
		{
			type: "message",
			content: [
				{
					type: "output_text",
					text: "Acme Runners are a popular pick.",
					annotations: [{ type: "url_citation", url: "https://www.example.com/shoes", title: "Shoe Guide" }],
				},
			],
		},
	],
};

beforeEach(() => {
	vi.stubEnv("META_API_KEY", "test-key");
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("meta-api run", () => {
	it("searches the web only for a grounded target", async () => {
		const grounded = stubFetch(groundedResponse);
		await metaApi.run("meta-ai", "prompt", { webSearch: true, version: "muse-spark-1.1" });
		expect(sentBody(grounded).tools).toEqual([{ type: "web_search" }]);

		const plain = stubFetch(groundedResponse);
		await metaApi.run("meta-ai", "prompt", { webSearch: false, version: "muse-spark-1.1" });
		expect(sentBody(plain).tools).toBeUndefined();
	});

	it("records the queries the model searched and the pinned model it ran", async () => {
		stubFetch(groundedResponse);
		const result = await metaApi.run("meta-ai", "prompt", { webSearch: true, version: "muse-spark-1.1" });
		expect(result.webQueries).toEqual(["best running shoes 2026"]);
		expect(result.modelVersion).toBe("muse-spark-1.1");
	});

	it("stores a run the answer and its citations can be read back from", async () => {
		stubFetch(groundedResponse);
		const result = await metaApi.run("meta-ai", "prompt", { webSearch: true, version: "muse-spark-1.1" });
		const run = extractRun(result.rawOutput, "meta-api");
		expect(run.textContent).toBe("Acme Runners are a popular pick.");
		expect(run.citations.map((citation) => citation.url)).toEqual(["https://www.example.com/shoes"]);
	});

	it("refuses an unpinned target rather than letting Meta pick the model", async () => {
		stubFetch(groundedResponse);
		await expect(metaApi.run("meta-ai", "prompt", { webSearch: true })).rejects.toThrow(/version slug/);
	});

	it("surfaces an API error", async () => {
		stubFetch({}, false);
		await expect(metaApi.run("meta-ai", "prompt", { version: "muse-spark-1.1" })).rejects.toThrow(/401/);
	});
});
