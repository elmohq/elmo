import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./llm", () => ({ runStructuredResearchPrompt: vi.fn() }));
vi.mock("../website-excerpt", () => ({ getWebsiteExcerpt: vi.fn(async () => "") }));

import { runStructuredResearchPrompt } from "./llm";
import { suggestPrompts } from "./suggest-prompts";

afterEach(() => {
	vi.clearAllMocks();
});

describe("suggestPrompts", () => {
	it("never returns a prompt the brand already has, however the model spells it", async () => {
		vi.mocked(runStructuredResearchPrompt).mockResolvedValueOnce({
			suggestedPrompts: [
				{ prompt: "Best  Running Shoes", tags: [] },
				{ prompt: "trail shoes for wide feet", tags: ["trail"] },
			],
		});

		const result = await suggestPrompts({
			website: "acme.com",
			brandName: "Acme",
			existingPrompts: ["best running shoes"],
		});

		expect(result).toEqual([{ prompt: "trail shoes for wide feet", tags: ["trail"] }]);
	});

	it("tells the model what the brand already tracks", async () => {
		vi.mocked(runStructuredResearchPrompt).mockResolvedValueOnce({ suggestedPrompts: [] });

		await suggestPrompts({
			website: "acme.com",
			brandName: "Acme",
			existingPrompts: ["best running shoes"],
			existingTags: ["trail"],
			competitors: ["Globex"],
		});
		const prompt = vi.mocked(runStructuredResearchPrompt).mock.calls[0]?.[0];

		expect(prompt).toContain("- best running shoes");
		expect(prompt).toContain("Globex");
		expect(prompt).toContain("trail");
	});

	it("asks for suggestions in the brand's market language, and leaves the default market's request alone", async () => {
		vi.mocked(runStructuredResearchPrompt).mockResolvedValue({ suggestedPrompts: [] });
		const base = { website: "acme.com", brandName: "Acme", existingPrompts: [] };

		await suggestPrompts({ ...base, market: { country: "BR", language: "pt" } });
		await suggestPrompts(base);
		const [brazil, unset] = vi.mocked(runStructuredResearchPrompt).mock.calls.map((call) => call[0]);

		expect(brazil).toContain("Portuguese as written in Brazil");
		expect(unset).not.toContain("as written in");
	});

	it("returns at most the requested number of prompts", async () => {
		vi.mocked(runStructuredResearchPrompt).mockResolvedValueOnce({
			suggestedPrompts: ["a", "b", "c", "d"].map((p) => ({ prompt: `prompt ${p}`, tags: [] })),
		});

		const result = await suggestPrompts({ website: "acme.com", brandName: "Acme", existingPrompts: [], count: 2 });

		expect(result.map((p) => p.prompt)).toEqual(["prompt a", "prompt b"]);
	});
});
