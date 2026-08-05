import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@brightdata/sdk", () => ({ bdclient: class {} }));

import { brightdata } from "./brightdata";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function failingFetch() {
	const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "unavailable" });
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("brightdata paid-request retries", () => {
	it("preserves the legacy retry default", async () => {
		vi.useFakeTimers();
		const fetchMock = failingFetch();
		const promise = brightdata.run("google-ai-overview", "speaker recommendations", { webSearch: true });
		const assertion = expect(promise).rejects.toThrow("after 3 attempt(s)");
		await vi.runAllTimersAsync();
		await assertion;
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("makes one paid request when durable-attempt retries are disabled", async () => {
		const fetchMock = failingFetch();
		await expect(
			brightdata.run("google-ai-overview", "speaker recommendations", { webSearch: true, maxRetries: 0 }),
		).rejects.toThrow("after 1 attempt(s)");
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
