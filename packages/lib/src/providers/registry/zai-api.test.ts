import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { WEB_QUERIES_UNAVAILABLE } from "../../constants";
import { API_PROVIDER_MAX_OUTPUT_TOKENS } from "../config";
import type { StructuredResearchOptions } from "../types";
import { zaiApi } from "./zai-api";

const CAP = API_PROVIDER_MAX_OUTPUT_TOKENS["zai-api"];

function stubFetch(json: unknown, init: { ok?: boolean; status?: number } = {}) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: init.ok ?? true,
		status: init.status ?? 200,
		json: async () => json,
		text: async () => JSON.stringify(json),
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, any> {
	const [, init] = fetchMock.mock.calls[0];
	return JSON.parse((init as RequestInit).body as string);
}

function calledUrl(fetchMock: ReturnType<typeof vi.fn>): string {
	return fetchMock.mock.calls[0][0] as string;
}

beforeEach(() => {
	vi.stubEnv("ZAI_API_KEY", "zai-test-key");
	vi.stubEnv("ZAI_BASE_URL", "");
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("zai-api run", () => {
	it("asks the pinned model directly, without search, under the output cap", async () => {
		const fetchMock = stubFetch({ model: "glm-5.2", choices: [{ message: { content: "answer" } }] });

		const result = await zaiApi.run("glm", "best running shoes?", { webSearch: false, version: "glm-5.2" });

		expect(calledUrl(fetchMock)).toBe("https://api.z.ai/api/paas/v4/chat/completions");
		const [, init] = fetchMock.mock.calls[0];
		expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer zai-test-key" });
		const body = sentBody(fetchMock);
		expect(body.model).toBe("glm-5.2");
		expect(body.messages).toEqual([{ role: "user", content: "best running shoes?" }]);
		expect(body.max_tokens).toBe(CAP);
		expect(body.tools).toBeUndefined();
		expect(result).toMatchObject({ webQueries: [], modelVersion: "glm-5.2" });
	});

	it("turns on Z.ai's web search with results returned, and marks the unreported query", async () => {
		const fetchMock = stubFetch({
			model: "glm-5.2",
			choices: [{ message: { content: "answer [ref_1]" } }],
			web_search: [{ refer: "ref_1", link: "https://example.com", title: "Example" }],
		});

		const result = await zaiApi.run("glm", "prompt", { webSearch: true, version: "glm-5.2" });

		const [tool] = sentBody(fetchMock).tools;
		expect(tool.type).toBe("web_search");
		expect(tool.web_search).toMatchObject({ enable: true, search_result: true });
		expect(result.webQueries).toEqual([WEB_QUERIES_UNAVAILABLE]);
	});

	it("records no searches when the model answered without searching", async () => {
		stubFetch({ model: "glm-5.2", choices: [{ message: { content: "answer" } }] });

		const result = await zaiApi.run("glm", "prompt", { webSearch: true, version: "glm-5.2" });

		expect(result.webQueries).toEqual([]);
	});

	it("sends requests to an overridden host, such as the mainland China endpoint", async () => {
		vi.stubEnv("ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/");
		const fetchMock = stubFetch({ choices: [{ message: { content: "answer" } }] });

		await zaiApi.run("glm", "prompt", { version: "glm-5.2" });

		expect(calledUrl(fetchMock)).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
	});

	it("surfaces the API's error, so a missing resource package is diagnosable", async () => {
		stubFetch({ error: { code: "1113", message: "Insufficient balance" } }, { ok: false, status: 429 });

		await expect(zaiApi.run("glm", "prompt", { version: "glm-5.3" })).rejects.toThrow(/Z\.ai API error \(429\).*1113/);
	});
});

function research<T>(options: StructuredResearchOptions<T>) {
	if (!zaiApi.runStructuredResearch) throw new Error("zai-api should support structured research");
	return zaiApi.runStructuredResearch(options);
}

describe("zai-api structured research", () => {
	const schema = z.object({ name: z.string(), competitors: z.array(z.string()) });

	it("returns the validated object, searching by default", async () => {
		const fetchMock = stubFetch({
			model: "glm-5.2",
			choices: [{ message: { content: JSON.stringify({ name: "Nike", competitors: ["Adidas"] }) } }],
		});

		const result = await research({ prompt: "Research nike.com", schema });

		expect(result).toEqual({ object: { name: "Nike", competitors: ["Adidas"] }, modelVersion: "glm-5.2" });
		const body = sentBody(fetchMock);
		expect(body.response_format).toEqual({ type: "json_object" });
		expect(body.messages[0].content).toContain("Research nike.com");
		expect(body.messages[0].content).toContain('"competitors"');
		expect(body.tools?.[0]?.type).toBe("web_search");
	});

	it("leaves search off for a completion over supplied context", async () => {
		const fetchMock = stubFetch({
			choices: [{ message: { content: JSON.stringify({ name: "Nike", competitors: [] }) } }],
		});

		await research({ prompt: "p", schema, webSearch: false });

		expect(sentBody(fetchMock).tools).toBeUndefined();
	});

	it("rejects a reply that doesn't match the schema", async () => {
		stubFetch({ choices: [{ message: { content: JSON.stringify({ name: "Nike" }) } }] });

		await expect(research({ prompt: "p", schema })).rejects.toThrow();
	});

	it("fails clearly when the model returns no content", async () => {
		stubFetch({ choices: [{ message: { content: "" } }] });

		await expect(research({ prompt: "p", schema })).rejects.toThrow(/no JSON content/);
	});
});
