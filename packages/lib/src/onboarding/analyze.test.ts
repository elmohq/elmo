import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the LLM and excerpt modules so the tests never call external services.
vi.mock("./llm", () => ({
	resolveResearchTarget: vi.fn(() => ({
		provider: { id: "anthropic-api", isConfigured: () => true } as any,
		model: "claude-sonnet-4-6",
	})),
	runStructuredResearchPrompt: vi.fn(),
}));
vi.mock("../website-excerpt", () => ({
	getWebsiteExcerpt: vi.fn(async () => ""),
}));

import { getWebsiteExcerpt } from "../website-excerpt";
import { analyzeBrand, buildAnalysisContext } from "./analyze";
import { runStructuredResearchPrompt } from "./llm";

afterEach(() => {
	vi.clearAllMocks();
});

describe("analyzeBrand", () => {
	it("uses the full page URL for analysis while retaining the domain identity", async () => {
		const pageUrl = "https://www.nike.com/golf?category=clubs#featured";
		vi.mocked(getWebsiteExcerpt).mockResolvedValueOnce("Nike Golf page excerpt");
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "Nike Golf",
			additionalDomains: [],
			aliases: [],
			competitors: [],
			suggestedPrompts: [],
		});

		const result = await analyzeBrand({
			website: pageUrl,
			brandName: "Nike Golf",
		});
		const prompt = vi.mocked(runStructuredResearchPrompt).mock.calls[0]?.[0];

		expect(getWebsiteExcerpt).toHaveBeenCalledWith(pageUrl);
		expect(prompt).toContain(`Analyze the brand at ${pageUrl}.`);
		expect(prompt).toContain(`Text from ${pageUrl}:`);
		expect(result.website).toBe("nike.com");
	});

	it("does not disclose embedded URL credentials to analysis services", async () => {
		const privateUrl = "https://alice:secret@example.com/private?view=summary";
		const safeUrl = "https://example.com/private?view=summary";

		const ctx = await buildAnalysisContext({ website: privateUrl });

		expect(getWebsiteExcerpt).toHaveBeenCalledWith(safeUrl);
		expect(ctx.prompt).toContain(`Analyze the brand at ${safeUrl}.`);
		expect(ctx.prompt).not.toContain("alice");
		expect(ctx.prompt).not.toContain("secret");
		expect(ctx.website).toBe("example.com");
	});

	it("rejects unsupported protocols before calling analysis services", async () => {
		await expect(buildAnalysisContext({ website: "ftp://example.com/private" })).rejects.toThrow(
			'Could not parse website "ftp://example.com/private"',
		);

		expect(getWebsiteExcerpt).not.toHaveBeenCalled();
	});

	it("normalizes brand fields, dedupes domains, and filters self-referential competitors", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "Acme",
			additionalDomains: ["acme.co.uk", "ACME.COM", "acme.de"],
			// Aliases containing "Acme" are redundant under substring mention
			// matching; only "Globex Holdings" (a distinct parent) survives.
			aliases: ["Acme Inc", "acme inc", "Acme", "Globex Holdings"],
			competitors: [
				// Competitor alias "Globex Worldwide" contains the comp name → drop;
				// "GBX" stays because it doesn't contain "Globex".
				{ name: "Globex", domains: ["globex.com", "globex.de"], aliases: ["GBX", "Globex Worldwide"] },
				{ name: "Self Reference", domains: ["acme.com"], aliases: [] },
				{ name: "Bad Domain", domains: ["not a domain"], aliases: [] },
				{ name: "Globex Dup", domains: ["globex.com"], aliases: [] },
			],
			suggestedPrompts: [
				// Tags are now free-form / brand-tailored. Normalize step lowercases
				// + kebab-cases + dedupes + caps at 3 per prompt.
				{ prompt: "Best Widgets", tags: ["Industrial Supplies", "Manufacturing"] },
				{ prompt: "best widgets", tags: ["industrial-supplies"] }, // duplicate after lowercasing
				{ prompt: "acme alternative", tags: ["alternatives", "industrial supplies", "buying guide", "extra-tag"] },
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
		expect(result.aliases).toEqual(["Globex Holdings"]);

		expect(result.competitors).toHaveLength(1);
		expect(result.competitors[0]).toMatchObject({
			name: "Globex",
			domains: ["globex.com", "globex.de"],
			aliases: ["GBX"],
		});

		expect(result.suggestedPrompts).toEqual([
			{ prompt: "best widgets", tags: ["industrial-supplies", "manufacturing"] },
			{
				prompt: "acme alternative",
				// "industrial supplies" → "industrial-supplies", capped at 3 (extra-tag dropped)
				tags: ["alternatives", "industrial-supplies", "buying-guide"],
			},
		]);
	});

	it("falls back to inferred brand name when LLM omits it", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "",
			additionalDomains: [],
			aliases: [],
			competitors: [],
			suggestedPrompts: [],
		});

		const result = await analyzeBrand({ website: "nike.com" });
		const prompt = vi.mocked(runStructuredResearchPrompt).mock.calls[0]?.[0];

		expect(getWebsiteExcerpt).toHaveBeenCalledWith("https://nike.com/");
		expect(prompt).toContain("Analyze the brand at https://nike.com/.");
		expect(result.brandName).toBe("Nike");
	});

	it("respects maxCompetitors=0 / maxPrompts=0", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "Acme",
			additionalDomains: [],
			aliases: [],
			competitors: [{ name: "Globex", domains: ["globex.com"], aliases: [] }],
			suggestedPrompts: [{ prompt: "best widgets", tags: ["best-of"] }],
		});

		const result = await analyzeBrand({
			website: "acme.com",
			maxCompetitors: 0,
			maxPrompts: 0,
		});
		expect(result.competitors).toEqual([]);
		expect(result.suggestedPrompts).toEqual([]);
	});

	it("caps competitors and prompts at the requested maxes", async () => {
		(runStructuredResearchPrompt as any).mockResolvedValueOnce({
			brandName: "Acme",
			additionalDomains: [],
			aliases: [],
			competitors: Array.from({ length: 20 }, (_, i) => ({
				name: `Comp ${i}`,
				domains: [`comp${i}.com`],
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
