import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brightdata } from "./brightdata";

beforeEach(() => {
	vi.stubEnv("BRIGHTDATA_API_TOKEN", "test-token");
});

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("brightdata provider", () => {
	it("checkpoints a paid SERP response before parsing it", async () => {
		const checkpointRawResponse = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not valid JSON")));

		await expect(
			brightdata.run("google-ai-overview", "best speakers", {
				webSearch: true,
				checkpointRawResponse,
			}),
		).rejects.toThrow("BrightData SERP returned an invalid JSON response");

		expect(checkpointRawResponse).toHaveBeenCalledWith({
			rawOutput: "not valid JSON",
			modelVersion: "brightdata-serp",
		});
	});
});
