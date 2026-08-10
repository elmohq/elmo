import { afterEach, describe, expect, it, vi } from "vitest";
import { authFetch } from "./dataforseo-shared";

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("DataForSEO authFetch", () => {
	it("adds a bounded abort signal to the network call", async () => {
		vi.stubEnv("DATAFORSEO_LOGIN", "test-user");
		vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
		const fetchMock = vi.fn().mockResolvedValue(new Response());
		vi.stubGlobal("fetch", fetchMock);

		await authFetch("https://api.dataforseo.com/v3/test");

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.dataforseo.com/v3/test",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});
});
