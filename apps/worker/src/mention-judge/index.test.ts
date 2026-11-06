import { afterEach, expect, it, vi } from "vitest";
import { configureMentionAnalyzer } from "./index";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

it("reads the OpenRouter key as a provider credential when there's no TypeSafe key", async () => {
	vi.stubEnv("OPENROUTER_API_KEY", "or-key");
	const fetchSpy = vi
		.spyOn(globalThis, "fetch")
		.mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad key", code: 401 } }), { status: 401 }));

	await configureMentionAnalyzer("")
		.analyze("Apple is great.", { brand: { name: "Apple", aliases: [], domains: [] }, competitors: [] })
		.catch(() => undefined);

	expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("https://openrouter.ai/api/v1/systemone");
});
