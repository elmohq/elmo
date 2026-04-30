import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the LLM and excerpt modules so the test exercises only normalization.
vi.mock("./llm", () => ({
	resolveResearchTarget: vi.fn(() => ({
		provider: { id: "anthropic-api", isConfigured: () => true } as any,
		model: "claude-sonnet-4-20250514",
	})),
	runStructuredResearchPrompt: vi.fn(),
}));
vi.mock("../website-excerpt", () => ({
	getWebsiteExcerpt: vi.fn(async () => ""),
}));

import { runStructuredResearchPrompt } from "./llm";
import { analyzeBrand } from "./analyze";

afterEach(() => {
	vi.clearAllMocks();
});

describe("analyzeBrand", () => {
	it("normalizes brand fields, dedupes domains, and filters self-referential competitors", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "Acme",
			additionalDomains: ["acme.co.uk", "ACME.COM", "acme.de"],
			aliases: ["Acme Inc", "acme inc", "Acme"], // alias matching brand should drop
			products: ["Widgets", "Industrial Supplies", "widgets"],
			competitors: [
				{ name: "Globex", domain: "globex.com", additionalDomains: ["globex.de"], aliases: ["GBX"] },
				{ name: "Self Reference", domain: "acme.com", additionalDomains: [], aliases: [] },
				{ name: "Bad Domain", domain: "not a domain", additionalDomains: [], aliases: [] },
				{ name: "Globex Dup", domain: "globex.com", additionalDomains: [], aliases: [] },
			],
			suggestedPrompts: [
				{ prompt: "Best Widgets", tags: ["best-of"] },
				{ prompt: "best widgets", tags: ["comparison"] }, // duplicate after lowercasing
				{ prompt: "acme alternative", tags: ["alternative", "branded"] },
			],
		});

		const result = await analyzeBrand({
			website: "https://www.acme.com",
			brandName: "Acme",
			maxCompetitors: 5,
			maxPrompts: 10,
		});

		expect(result.brandName).toBe("Acme");
		expect(result.website).toBe("acme.com");
		expect(result.additionalDomains).toEqual(["acme.co.uk", "acme.de"]);
		expect(result.aliases).toEqual(["Acme Inc"]);
		expect(result.products).toEqual(["widgets", "industrial supplies"]);

		expect(result.competitors).toHaveLength(1);
		expect(result.competitors[0]).toMatchObject({
			name: "Globex",
			domain: "globex.com",
			additionalDomains: ["globex.de"],
			aliases: ["GBX"],
		});

		expect(result.suggestedPrompts).toEqual([
			{ prompt: "best widgets", tags: ["best-of"] },
			{ prompt: "acme alternative", tags: ["alternative", "branded"] },
		]);
	});

	it("falls back to inferred brand name when LLM omits it", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "",
			additionalDomains: [],
			aliases: [],
			products: [],
			competitors: [],
			suggestedPrompts: [],
		});

		const result = await analyzeBrand({ website: "nike.com" });
		expect(result.brandName).toBe("Nike");
	});

	it("respects includeCompetitors=false / includePrompts=false", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "Acme",
			additionalDomains: [],
			aliases: [],
			products: ["widgets"],
			competitors: [{ name: "Globex", domain: "globex.com", additionalDomains: [], aliases: [] }],
			suggestedPrompts: [{ prompt: "best widgets", tags: ["best-of"] }],
		});

		const result = await analyzeBrand({
			website: "acme.com",
			includeCompetitors: false,
			includePrompts: false,
		});
		expect(result.competitors).toEqual([]);
		expect(result.suggestedPrompts).toEqual([]);
	});

	it("caps competitors and prompts at the requested maxes", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "Acme",
			additionalDomains: [],
			aliases: [],
			products: [],
			competitors: Array.from({ length: 20 }, (_, i) => ({
				name: `Comp ${i}`,
				domain: `comp${i}.com`,
				additionalDomains: [],
				aliases: [],
			})),
			suggestedPrompts: Array.from({ length: 50 }, (_, i) => ({
				prompt: `prompt ${i}`,
				tags: ["best-of"],
			})),
		});

		const result = await analyzeBrand({
			website: "acme.com",
			maxCompetitors: 3,
			maxPrompts: 5,
		});
		expect(result.competitors).toHaveLength(3);
		expect(result.suggestedPrompts).toHaveLength(5);
	});
});
