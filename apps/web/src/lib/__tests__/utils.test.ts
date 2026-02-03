import { describe, it, expect } from "vitest";
import { calculateAverageVisibility } from "../utils";
import type { Prompt, PromptRun, Brand, Competitor } from "@workspace/lib/db/schema";

describe("calculateAverageVisibility", () => {
	const mockBrand: Brand = {
		id: "brand-1",
		name: "Test Brand",
		website: "https://testbrand.com",
		enabled: true,
		onboarded: true,
		delayOverrideHours: null,
		createdAt: new Date("2023-01-01"),
		updatedAt: new Date("2023-01-01"),
	};

	const mockCompetitors: Competitor[] = [
		{
			id: "comp-1",
			name: "Competitor 1",
			brandId: "brand-1",
			domain: "competitor1.com",
			createdAt: new Date("2023-01-01"),
			updatedAt: new Date("2023-01-01"),
		},
	];

	const createMockPrompt = (id: string, enabled = true): Prompt => ({
		id,
		brandId: "brand-1",
		value: `Test prompt ${id}`,
		enabled,
		tags: [],
		systemTags: [],
		createdAt: new Date("2023-01-01"),
		updatedAt: new Date("2023-01-01"),
	});

	const createMockPromptRun = (
		promptId: string,
		brandMentioned = false,
		competitorsMentioned: string[] = [],
		daysAgo = 0,
	): PromptRun => ({
		id: `run-${promptId}-${daysAgo}`,
		promptId,
		modelGroup: "anthropic",
		model: "claude-3-haiku",
		webSearchEnabled: true,
		rawOutput: {},
		webQueries: [],
		brandMentioned,
		competitorsMentioned,
		createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
	});

	describe("Basic functionality", () => {
		it("should calculate percentage of runs with brand mentions for qualifying prompts", () => {
			const prompts = [createMockPrompt("prompt-1")];
			const promptRuns = [
				createMockPromptRun("prompt-1", true, [], 5), // brand mentioned
				createMockPromptRun("prompt-1", false, ["comp-1"], 6), // competitor mentioned
				createMockPromptRun("prompt-1", false, [], 7), // no mentions
			];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);

			// Prompt has mentions (brand + competitor), so it qualifies
			// 1 out of 3 runs has brand mentioned = 33.33% -> 33%
			expect(result).toBe(33);
		});

		it("should exclude prompts with no brand or competitor mentions", () => {
			const prompts = [
				createMockPrompt("prompt-1"), // has mentions
				createMockPrompt("prompt-2"), // no mentions
			];
			const promptRuns = [
				// prompt-1 has mentions
				createMockPromptRun("prompt-1", true, [], 5),
				createMockPromptRun("prompt-1", false, ["comp-1"], 6),
				// prompt-2 has no mentions
				createMockPromptRun("prompt-2", false, [], 5),
				createMockPromptRun("prompt-2", false, [], 6),
			];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);

			// Only prompt-1 qualifies (has mentions)
			// 1 out of 2 qualifying runs has brand mentioned = 50%
			expect(result).toBe(50);
		});

		it("should handle prompts with only competitor mentions", () => {
			const prompts = [createMockPrompt("prompt-1")];
			const promptRuns = [
				createMockPromptRun("prompt-1", false, ["comp-1"], 5), // only competitor
				createMockPromptRun("prompt-1", false, ["comp-1"], 6), // only competitor
			];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);

			// Prompt qualifies (has competitor mentions)
			// 0 out of 2 runs has brand mentioned = 0%
			expect(result).toBe(0);
		});

		it("should handle prompts with only brand mentions", () => {
			const prompts = [createMockPrompt("prompt-1")];
			const promptRuns = [
				createMockPromptRun("prompt-1", true, [], 5), // only brand
				createMockPromptRun("prompt-1", true, [], 6), // only brand
			];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);

			// Prompt qualifies (has brand mentions)
			// 2 out of 2 runs has brand mentioned = 100%
			expect(result).toBe(100);
		});
	});

	describe("Filtering", () => {
		it("should only include enabled prompts", () => {
			const prompts = [
				createMockPrompt("prompt-1", true), // enabled
				createMockPrompt("prompt-2", false), // disabled
			];
			const promptRuns = [
				createMockPromptRun("prompt-1", true, [], 5),
				createMockPromptRun("prompt-2", true, [], 5), // disabled prompt run
			];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);

			// Only prompt-1 is enabled and has brand mention = 100%
			expect(result).toBe(100);
		});

		it("should only include runs from last 30 days", () => {
			const prompts = [createMockPrompt("prompt-1")];
			const promptRuns = [
				createMockPromptRun("prompt-1", true, [], 5), // recent
				createMockPromptRun("prompt-1", false, ["comp-1"], 10), // recent
				createMockPromptRun("prompt-1", true, [], 35), // too old
			];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);

			// Only recent runs count: 1 brand mention out of 2 recent runs = 50%
			expect(result).toBe(50);
		});
	});

	describe("Edge cases", () => {
		it("should return 0 for empty prompts array", () => {
			const result = calculateAverageVisibility([], [], mockBrand, mockCompetitors);
			expect(result).toBe(0);
		});

		it("should return 0 when no prompts are enabled", () => {
			const prompts = [createMockPrompt("prompt-1", false)];
			const promptRuns = [createMockPromptRun("prompt-1", true, [], 5)];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);
			expect(result).toBe(0);
		});

		it("should return 0 when no recent runs exist", () => {
			const prompts = [createMockPrompt("prompt-1")];
			const promptRuns = [createMockPromptRun("prompt-1", true, [], 35)]; // too old

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);
			expect(result).toBe(0);
		});

		it("should return 0 when no prompts have any mentions", () => {
			const prompts = [createMockPrompt("prompt-1"), createMockPrompt("prompt-2")];
			const promptRuns = [
				createMockPromptRun("prompt-1", false, [], 5), // no mentions
				createMockPromptRun("prompt-2", false, [], 5), // no mentions
			];

			const result = calculateAverageVisibility(prompts, promptRuns, mockBrand, mockCompetitors);
			expect(result).toBe(0);
		});

		it("should work without brand and competitors parameters", () => {
			const prompts = [createMockPrompt("prompt-1")];
			const promptRuns = [
				createMockPromptRun("prompt-1", true, ["comp-1"], 5),
				createMockPromptRun("prompt-1", false, [], 6),
			];

			const result = calculateAverageVisibility(prompts, promptRuns);

			// Should still work: 1 brand mention out of 2 qualifying runs = 50%
			expect(result).toBe(50);
		});
	});
});
