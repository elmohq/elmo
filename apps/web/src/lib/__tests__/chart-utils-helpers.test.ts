import { describe, it, expect } from "vitest";
import {
	getDefaultLookbackPeriod,
	getDaysFromLookback,
	normalizeToPercentage,
	getBadgeVariant,
	getBadgeClassName,
	selectCompetitorsToDisplay,
	getCompetitorColor,
	getBrandColor,
	createPromptToWebQueryMapping,
	type ChartDataPoint,
} from "../chart-utils";
import { generateOptimizationUrl } from "@workspace/whitelabel/config";
import type { Competitor, PromptRun } from "@workspace/lib/db/schema";

describe("chart-utils helpers", () => {
	describe("getDefaultLookbackPeriod", () => {
		it("should return 1w when no data date provided", () => {
			expect(getDefaultLookbackPeriod(null)).toBe("1w");
			expect(getDefaultLookbackPeriod(undefined)).toBe("1w");
		});

		it("should return 1w for brands with less than 7 days of data", () => {
			const recentDate = new Date();
			recentDate.setDate(recentDate.getDate() - 5);
			expect(getDefaultLookbackPeriod(recentDate.toISOString())).toBe("1w");
		});

		it("should return 1m for brands with more than 7 days of data", () => {
			const olderDate = new Date();
			olderDate.setDate(olderDate.getDate() - 10);
			expect(getDefaultLookbackPeriod(olderDate.toISOString())).toBe("1m");
		});

		it("should return 1m for brands with exactly 8 days of data", () => {
			const date = new Date();
			date.setDate(date.getDate() - 8);
			expect(getDefaultLookbackPeriod(date.toISOString())).toBe("1m");
		});
	});

	describe("getDaysFromLookback", () => {
		it("should return correct days for each lookback period", () => {
			expect(getDaysFromLookback("1w")).toBe(7);
			expect(getDaysFromLookback("1m")).toBe(30);
			expect(getDaysFromLookback("3m")).toBe(90);
			expect(getDaysFromLookback("6m")).toBe(180);
			expect(getDaysFromLookback("1y")).toBe(365);
			expect(getDaysFromLookback("all")).toBe(730); // 2 years
		});
	});

	describe("normalizeToPercentage", () => {
		it("should normalize 0-500 range to 0-100%", () => {
			expect(normalizeToPercentage(0)).toBe(0);
			expect(normalizeToPercentage(500)).toBe(100);
			expect(normalizeToPercentage(250)).toBe(40); // 50% -> rounded down to 40%
		});

		it("should round down to nearest 20%", () => {
			expect(normalizeToPercentage(50)).toBe(0); // 10% -> 0%
			expect(normalizeToPercentage(100)).toBe(20); // 20% -> 20%
			expect(normalizeToPercentage(150)).toBe(20); // 30% -> 20%
			expect(normalizeToPercentage(200)).toBe(40); // 40% -> 40%
			expect(normalizeToPercentage(350)).toBe(60); // 70% -> 60%
		});

		it("should cap at 100%", () => {
			expect(normalizeToPercentage(600)).toBe(100);
			expect(normalizeToPercentage(1000)).toBe(100);
		});
	});

	describe("getBadgeVariant", () => {
		it("should return default for values > 75", () => {
			expect(getBadgeVariant(76)).toBe("default");
			expect(getBadgeVariant(100)).toBe("default");
		});

		it("should return secondary for values between 46 and 75", () => {
			expect(getBadgeVariant(46)).toBe("secondary");
			expect(getBadgeVariant(75)).toBe("secondary");
			expect(getBadgeVariant(60)).toBe("secondary");
		});

		it("should return destructive for values <= 45", () => {
			expect(getBadgeVariant(45)).toBe("destructive");
			expect(getBadgeVariant(0)).toBe("destructive");
			expect(getBadgeVariant(30)).toBe("destructive");
		});
	});

	describe("getBadgeClassName", () => {
		it("should return green classes for high values", () => {
			expect(getBadgeClassName(80)).toContain("emerald");
		});

		it("should return amber classes for medium values", () => {
			expect(getBadgeClassName(60)).toContain("amber");
		});

		it("should return rose classes for low values", () => {
			expect(getBadgeClassName(30)).toContain("rose");
		});
	});

	describe("selectCompetitorsToDisplay", () => {
		const createCompetitor = (id: string, name: string): Competitor => ({
			id,
			name,
			brandId: "brand-1",
			domain: `${name.toLowerCase()}.com`,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const competitors = [
			createCompetitor("c1", "Alpha"),
			createCompetitor("c2", "Beta"),
			createCompetitor("c3", "Gamma"),
			createCompetitor("c4", "Delta"),
		];

		it("should select top competitors by visibility", () => {
			const chartData: ChartDataPoint[] = [
				{ date: "2025-01-01", c1: 10, c2: 80, c3: 50, c4: 30 },
				{ date: "2025-01-02", c1: 20, c2: 90, c3: 60, c4: 40 },
			];

			const selected = selectCompetitorsToDisplay(competitors, chartData, 2);

			expect(selected).toHaveLength(2);
			expect(selected[0].id).toBe("c2"); // Beta has highest avg (85%)
			expect(selected[1].id).toBe("c3"); // Gamma has second highest (55%)
		});

		it("should respect maxCompetitors parameter", () => {
			const chartData: ChartDataPoint[] = [
				{ date: "2025-01-01", c1: 50, c2: 60, c3: 70, c4: 80 },
			];

			const selected = selectCompetitorsToDisplay(competitors, chartData, 3);
			expect(selected).toHaveLength(3);
		});

		it("should fill with alphabetically sorted competitors when fewer available", () => {
			// Request more competitors than have data
			const twoCompetitors = competitors.slice(0, 2); // Alpha, Beta only
			const chartData: ChartDataPoint[] = [
				{ date: "2025-01-01", c1: 50, c2: null }, // Only Alpha has data
			];

			const selected = selectCompetitorsToDisplay(twoCompetitors, chartData, 3);

			// Should return all available (2), can't fill more
			expect(selected).toHaveLength(2);
			expect(selected[0].id).toBe("c1"); // Alpha (50%)
			expect(selected[1].id).toBe("c2"); // Beta (0%, filled alphabetically)
		});

		it("should handle empty chart data", () => {
			const selected = selectCompetitorsToDisplay(competitors, [], 2);
			// All have 0 visibility, so filled alphabetically
			expect(selected).toHaveLength(2);
		});
	});

	describe("getCompetitorColor", () => {
		const competitors: Competitor[] = [
			{ id: "c1", name: "Zebra", brandId: "b1", domain: "zebra.com", createdAt: new Date(), updatedAt: new Date() },
			{ id: "c2", name: "Alpha", brandId: "b1", domain: "alpha.com", createdAt: new Date(), updatedAt: new Date() },
			{ id: "c3", name: "Beta", brandId: "b1", domain: "beta.com", createdAt: new Date(), updatedAt: new Date() },
		];
		const colors = ["#brand", "#color1", "#color2", "#color3"];

		it("should assign colors based on alphabetical position", () => {
			// Sorted: Alpha, Beta, Zebra
			expect(getCompetitorColor("Alpha", competitors, colors)).toBe("#color1"); // index 0 -> color[1]
			expect(getCompetitorColor("Beta", competitors, colors)).toBe("#color2"); // index 1 -> color[2]
			expect(getCompetitorColor("Zebra", competitors, colors)).toBe("#color3"); // index 2 -> color[3]
		});

		it("should wrap around colors if more competitors than colors", () => {
			const moreCompetitors: Competitor[] = [
				...competitors,
				{ id: "c4", name: "Charlie", brandId: "b1", domain: "charlie.com", createdAt: new Date(), updatedAt: new Date() },
			];
			// Sorted: Alpha (idx 0), Beta (idx 1), Charlie (idx 2), Zebra (idx 3)
			// Charlie: (2 + 1) % 4 = 3 -> colors[3]
			// Zebra: (3 + 1) % 4 = 0 -> colors[0]
			expect(getCompetitorColor("Zebra", moreCompetitors, colors)).toBe("#brand");
		});
	});

	describe("getBrandColor", () => {
		it("should return the first color", () => {
			expect(getBrandColor(["#primary", "#secondary"])).toBe("#primary");
		});
	});

	describe("createPromptToWebQueryMapping", () => {
		const createPromptRun = (
			id: string,
			promptId: string,
			webQueries: string[],
			createdAt: Date
		): PromptRun => ({
			id,
			promptId,
			modelGroup: "openai",
			model: "gpt-4",
			webSearchEnabled: true,
			rawOutput: {},
			webQueries,
			brandMentioned: false,
			competitorsMentioned: [],
			createdAt,
		});

		it("should map prompts to their oldest web query", () => {
			const runs = [
				createPromptRun("r1", "p1", ["newer query"], new Date("2025-01-02")),
				createPromptRun("r2", "p1", ["older query"], new Date("2025-01-01")),
				createPromptRun("r3", "p2", ["p2 query"], new Date("2025-01-01")),
			];

			const mapping = createPromptToWebQueryMapping(runs);

			expect(mapping["p1"]).toBe("older query");
			expect(mapping["p2"]).toBe("p2 query");
		});

		it("should select first alphabetically when tied on date", () => {
			const sameDate = new Date("2025-01-01");
			const runs = [
				createPromptRun("r1", "p1", ["zebra query"], sameDate),
				createPromptRun("r2", "p1", ["alpha query"], sameDate),
			];

			const mapping = createPromptToWebQueryMapping(runs);

			expect(mapping["p1"]).toBe("alpha query");
		});

		it("should skip prompts without web queries", () => {
			const runs = [
				createPromptRun("r1", "p1", [], new Date("2025-01-01")),
				createPromptRun("r2", "p2", ["has query"], new Date("2025-01-01")),
			];

			const mapping = createPromptToWebQueryMapping(runs);

			expect(mapping["p1"]).toBeUndefined();
			expect(mapping["p2"]).toBe("has query");
		});

		it("should handle empty array", () => {
			const mapping = createPromptToWebQueryMapping([]);
			expect(mapping).toEqual({});
		});
	});

	describe("generateOptimizationUrl", () => {
		it("should generate URL with prompt and org_id", () => {
			const url = generateOptimizationUrl("best running shoes", "org-123");

			expect(url).toContain("https://app.whitelabel-client.com/search/create-aeo-funnel");
			expect(url).toContain("prompt=best%20running%20shoes");
			expect(url).toContain("org_id=org-123");
		});

		it("should include web_query when web search is enabled", () => {
			const url = generateOptimizationUrl(
				"best shoes",
				"org-123",
				true,
				"running shoe reviews"
			);

			expect(url).toContain("web_query=running%20shoe%20reviews");
		});

		it("should not include web_query when web search is disabled", () => {
			const url = generateOptimizationUrl(
				"best shoes",
				"org-123",
				false,
				"running shoe reviews"
			);

			expect(url).not.toContain("web_query");
		});

		it("should not include web_query when no query provided", () => {
			const url = generateOptimizationUrl("best shoes", "org-123", true);

			expect(url).not.toContain("web_query");
		});

		it("should properly encode special characters", () => {
			const url = generateOptimizationUrl("best shoes & boots?", "org-123");

			expect(url).toContain("prompt=best%20shoes%20%26%20boots%3F");
		});
	});
});
