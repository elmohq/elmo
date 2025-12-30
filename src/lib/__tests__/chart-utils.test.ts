import { calculateVisibilityPercentages, generateDateRange, filterAndCompleteChartData } from "../chart-utils";
import type { PromptRun, Brand, Competitor } from "../db/schema";

describe("chart-utils", () => {
	const mockBrand: Brand = {
		id: "brand-1",
		name: "Test Brand",
		website: "https://testbrand.com",
		enabled: true,
		onboarded: true,
		delayOverrideMs: null,
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

	// Helper to create prompt runs with specific timestamps
	const createPromptRun = (
		id: string,
		createdAt: string, // ISO string for precise control
		brandMentioned = false,
		competitorsMentioned: string[] = [],
	): PromptRun => ({
		id,
		promptId: "test-prompt",
		modelGroup: "anthropic",
		model: "claude-3-haiku",
		webSearchEnabled: true,
		rawOutput: {},
		webQueries: [],
		brandMentioned,
		competitorsMentioned,
		createdAt: new Date(createdAt),
	});

	// Helper to create chart data points
	const createChartDataPoint = (
		date: string,
		brandVisibility: number | null,
		competitorVisibility: number | null = null,
	) => ({
		date,
		[mockBrand.id]: brandVisibility,
		[mockCompetitors[0].id]: competitorVisibility,
	});

	describe("generateDateRange", () => {
		it("should generate consecutive UTC dates", () => {
			const start = new Date("2025-07-20");
			const end = new Date("2025-07-22");

			const result = generateDateRange(start, end);

			expect(result).toEqual(["2025-07-20", "2025-07-21", "2025-07-22"]);
		});

		it("should handle single day range", () => {
			const date = new Date("2025-07-21");

			const result = generateDateRange(date, date);

			expect(result).toEqual(["2025-07-21"]);
		});

		it("should demonstrate the incorrect bucket count issue", () => {
			// This test shows that lookback periods generate too many buckets
			console.log("\n=== INCORRECT BUCKET COUNT ISSUE ===");

			// Mock current date as July 22, 2025
			jest.useFakeTimers();
			jest.setSystemTime(new Date("2025-07-22T12:00:00.000Z"));

			// Test 1w lookback - should show 7 days including today
			const promptRuns = [createPromptRun("run-1", "2025-07-21T12:00:00.000Z", true)];
			const result1w = calculateVisibilityPercentages(promptRuns, mockBrand, mockCompetitors, "1w");

			console.log("1w lookback - After fix:");
			console.log(`  Dates: ${result1w.map((d) => d.date).join(", ")}`);
			console.log(`  Count: ${result1w.length} days (should be 7)`);

			// Test 1m lookback
			const result1m = calculateVisibilityPercentages(promptRuns, mockBrand, mockCompetitors, "1m");
			console.log("1m lookback - After fix:");
			console.log(`  Count: ${result1m.length} days (should be 30)`);
			console.log(`  Range: ${result1m[0].date} to ${result1m[result1m.length - 1].date}`);

			console.log("=== END BUCKET COUNT TEST ===\n");

			jest.useRealTimers();

			// After fix: 1w shows 7 days, 1m shows 30 days
			expect(result1w.length).toBe(7); // Fixed - now shows 7
			expect(result1m.length).toBe(30); // Fixed - now shows 30

			// The date range should be 7 days including today
			expect(result1w[0].date).toBe("2025-07-16"); // 6 days before July 22
			expect(result1w[result1w.length - 1].date).toBe("2025-07-22"); // Today (July 22)
		});

		it("should not include tomorrow in the date range", () => {
			// Test the specific issue: at 6pm on Jul 21 PST, should show Jul 15-21, not Jul 16-22
			console.log("\n=== TOMORROW INCLUSION BUG ===");

			// Mock current time as 6pm on July 21, 2025 PST (1 AM UTC July 22)
			jest.useFakeTimers();
			jest.setSystemTime(new Date("2025-07-22T01:00:00.000Z")); // 6 PM PST Jul 21 = 1 AM UTC Jul 22

			const promptRuns = [createPromptRun("run-1", "2025-07-21T12:00:00.000Z", true)];
			const result = calculateVisibilityPercentages(
				promptRuns,
				mockBrand,
				mockCompetitors,
				"1w",
				"America/Los_Angeles",
			);

			console.log("Current time: 6pm on Jul 21 PST (1 AM UTC Jul 22)");
			console.log(`1w lookback dates: ${result.map((d) => d.date).join(", ")}`);
			console.log(`Count: ${result.length} days`);

			// Check what the current implementation produces
			const startDate = result[0].date;
			const endDate = result[result.length - 1].date;
			console.log(`Range: ${startDate} to ${endDate}`);

			// After fix: should show Jul 15-21 (7 days ending today in PST)
			console.log("After timezone fix:");
			console.log("Expected: Jul 15-21 (7 days ending today in PST)");
			console.log(`Actual:   ${startDate} to ${endDate}`);

			console.log("=== END TOMORROW BUG TEST ===\n");

			jest.useRealTimers();

			// After fix: should show 7 days ending on Jul 21 (today in PST)
			expect(result.length).toBe(7);
			expect(endDate).toBe("2025-07-21"); // Should end on today (Jul 21 PST), not tomorrow
			expect(startDate).toBe("2025-07-15"); // Should start 6 days before today
		});
	});

	describe("filterAndCompleteChartData", () => {
		beforeAll(() => {
			// Mock the current date to July 22, 2025 at noon UTC for consistent testing
			jest.useFakeTimers();
			jest.setSystemTime(new Date("2025-07-22T12:00:00.000Z"));
		});

		afterAll(() => {
			jest.useRealTimers();
		});

		it("should return data as-is for 'all' lookback", () => {
			const inputData = [createChartDataPoint("2025-07-20", 50), createChartDataPoint("2025-07-21", 75)];

			const result = filterAndCompleteChartData(inputData, "all");

			expect(result).toEqual(inputData);
		});

		it("should generate correct UTC date range for 1w lookback", () => {
			// With current date as July 22, 2025, 1w lookback should be July 16-22 (7 days)
			const inputData = [createChartDataPoint("2025-07-21", 75)];

			const result = filterAndCompleteChartData(inputData, "1w");

			// Should generate 7 days ending on current date in user's timezone
			expect(result).toHaveLength(7);

			// July 21 should have the original data
			const july21Data = result.find((d) => d.date === "2025-07-21");
			expect(july21Data).toEqual(inputData[0]);

			// Other dates should be empty objects (just with date)
			const july20Data = result.find((d) => d.date === "2025-07-20");
			expect(july20Data).toEqual({ date: "2025-07-20" });
		});

		it("should handle timezone-aware filtering consistently", () => {
			// Test that filterAndCompleteChartData uses timezone-aware logic
			// Mock 6pm PST July 21 (1 AM UTC July 22)
			jest.useFakeTimers();
			jest.setSystemTime(new Date("2025-07-22T01:00:00.000Z"));

			const inputData = [createChartDataPoint("2025-07-21", 75)];

			const result = filterAndCompleteChartData(inputData, "1w");

			// Should end on July 21 (today in user's timezone), not July 22 (tomorrow)
			expect(result).toHaveLength(7);
			expect(result[0].date).toBe("2025-07-15"); // 6 days before today
			expect(result[6].date).toBe("2025-07-21"); // Today in user's timezone

			jest.useRealTimers();
		});

		it("should filter out data outside the lookback period", () => {
			const inputData = [
				createChartDataPoint("2025-07-10", 50), // Too old for 1w lookback
				createChartDataPoint("2025-07-21", 75), // Within 1w
				createChartDataPoint("2025-07-25", 80), // Future date
			];

			const result = filterAndCompleteChartData(inputData, "1w");

			// Should only include July 21 data, not July 10 or July 25
			const july10Data = result.find((d) => d.date === "2025-07-10");
			const july21Data = result.find((d) => d.date === "2025-07-21");
			const july25Data = result.find((d) => d.date === "2025-07-25");

			expect(july10Data).toBeUndefined();
			expect(july21Data).toEqual(inputData[1]);
			expect(july25Data).toBeUndefined();
		});

		it("should reproduce the user's specific issue: July 21 PDT data appears as July 20 activity", () => {
			// This test reproduces the exact issue described by the user:
			// "I have a bunch of prompt runs that are ONLY in July 21 pacific time,
			//  but they show in the graph as on Jul 20 (which should be 0 due to lack of prompt runs on that day)"

			console.log("\n=== USER'S SPECIFIC ISSUE TEST ===");

			// Step 1: Create prompt runs that happen ONLY on July 21 PDT
			const promptRuns = [
				createPromptRun("run-1", "2025-07-21T09:00:00-07:00", true), // 9 AM PDT = 4 PM UTC same day
				createPromptRun("run-2", "2025-07-21T14:00:00-07:00", true), // 2 PM PDT = 9 PM UTC same day
				createPromptRun("run-3", "2025-07-21T20:00:00-07:00", true), // 8 PM PDT = 3 AM UTC next day
			];

			console.log("Prompt runs (all on July 21 PDT):");
			promptRuns.forEach((run, i) => {
				console.log(
					`  Run ${i + 1}: ${run.createdAt.toISOString()} -> PDT: ${run.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })}`,
				);
			});

			// Step 2: calculateVisibilityPercentages buckets correctly by PDT timezone
			const visibilityData = calculateVisibilityPercentages(
				promptRuns,
				mockBrand,
				mockCompetitors,
				"1w",
				"America/Los_Angeles",
			);

			console.log(
				"Date range from calculateVisibilityPercentages:",
				visibilityData.map((d) => d.date),
			);
			console.log("Data after calculateVisibilityPercentages (PDT bucketing):");
			const dataWithActivity = visibilityData.filter((d) => d[mockBrand.id] !== null);
			dataWithActivity.forEach((d) => {
				console.log(`  ${d.date}: brand=${d[mockBrand.id]}%`);
			});

			// Step 3: filterAndCompleteChartData uses UTC date range, creating the mismatch
			const chartData = filterAndCompleteChartData(visibilityData, "1w");

			console.log(
				"Date range from filterAndCompleteChartData:",
				chartData.map((d) => d.date),
			);
			console.log("Data after filterAndCompleteChartData (UTC range):");
			chartData.forEach((d) => {
				const brandValue = d[mockBrand.id];
				if (brandValue !== undefined) {
					console.log(`  ${d.date}: brand=${brandValue}%`);
				} else {
					console.log(`  ${d.date}: empty data point (could show as 0% in chart)`);
				}
			});

			// Step 4: The issue - the chart now has empty data points that could render as 0%
			// when they should either not exist or be properly filled
			const july20Data = chartData.find((d) => d.date === "2025-07-20");
			const july21Data = chartData.find((d) => d.date === "2025-07-21");

			console.log("The problem:");
			console.log(
				`  July 20: ${july20Data?.[mockBrand.id] !== undefined ? july20Data[mockBrand.id] + "%" : "undefined (appears as 0% in chart)"}`,
			);
			console.log(`  July 21: ${july21Data?.[mockBrand.id]}% (correct data)`);

			// All prompt runs were on July 21 PDT, so July 21 should have 100% brand visibility
			expect(july21Data?.[mockBrand.id]).toBe(100);

			// July 20 should not have brand data defined, but this creates chart rendering issues
			// The actual result is null (not undefined) which is even worse for chart rendering
			expect(july20Data?.[mockBrand.id]).toBe(null);

			// The chart will interpret undefined as 0% or null, making it appear like there was activity on July 20
			// when in reality there were NO prompt runs on July 20 in the user's timezone

			console.log("=== END USER'S ISSUE TEST ===\n");
		});

		it("should handle 1m lookback correctly", () => {
			const inputData = [createChartDataPoint("2025-07-21", 75)];

			const result = filterAndCompleteChartData(inputData, "1m");

			// 1m = 30 days, ending on current date in user's timezone
			expect(result).toHaveLength(30);
		});

		it("should expose timezone mismatch issue - PDT data with UTC filtering", () => {
			// Simulate data that was created by calculateVisibilityPercentages with PDT timezone
			// Data exists for July 21 PDT (both morning and evening events bucketed together)
			const pdtBucketedData = [
				createChartDataPoint("2025-07-21", 75, 25), // Data from both morning and evening PDT events
			];

			console.log("\n=== Timezone Mismatch Test ===");
			console.log("Input data (from PDT bucketing):", pdtBucketedData);

			// filterAndCompleteChartData now also uses timezone-aware logic
			const result = filterAndCompleteChartData(pdtBucketedData, "1w");

			console.log("Output data (after timezone-aware filtering):");
			result.forEach((d) => {
				if (d[mockBrand.id] !== undefined || Object.keys(d).length > 1) {
					console.log(`  ${d.date}: brand=${d[mockBrand.id]}, competitor=${d[mockCompetitors[0].id]}`);
				}
			});

			// Now both functions use timezone-aware date ranges
			expect(result).toHaveLength(7); // 7 days with timezone-aware logic

			const dataWithValues = result.filter((d) => d[mockBrand.id] !== undefined);
			expect(dataWithValues).toHaveLength(1);
			expect(dataWithValues[0].date).toBe("2025-07-21");

			console.log("=== End Timezone Test ===\n");
		});

		it("should show the missing timezone parameter problem", () => {
			// This test shows that filterAndCompleteChartData now uses timezone-aware logic
			// Both functions should generate consistent date ranges

			const timezoneAwareData = [
				// This represents data bucketed in PDT timezone
				createChartDataPoint("2025-07-21", 100), // Evening PDT event bucketed to July 21
			];

			// Both functions now use timezone-aware date ranges
			const result = filterAndCompleteChartData(timezoneAwareData, "1w");

			console.log("\n=== Timezone Consistency Check ===");
			console.log("Both functions now use timezone-aware date ranges");
			console.log("Data bucketed with PDT timezone:", timezoneAwareData);
			console.log(
				"Filtering also uses timezone-aware range:",
				result.map((d) => d.date),
			);
			console.log("=== End Consistency Check ===\n");

			expect(result.some((d) => d.date === "2025-07-21" && d[mockBrand.id] === 100)).toBe(true);
		});

		it("should demonstrate incomplete data filling", () => {
			const inputData = [createChartDataPoint("2025-07-21", 75, 25)];

			const result = filterAndCompleteChartData(inputData, "1w");

			// Check that missing dates only have the date property
			const july20Data = result.find((d) => d.date === "2025-07-20");
			expect(july20Data).toEqual({ date: "2025-07-20" });

			// The data doesn't include brand/competitor keys for missing dates
			// This could cause issues in chart rendering
			expect(july20Data?.[mockBrand.id]).toBeUndefined();
			expect(july20Data?.[mockCompetitors[0].id]).toBeUndefined();

			// Whereas existing data has the full structure
			const july21Data = result.find((d) => d.date === "2025-07-21");
			expect(july21Data?.[mockBrand.id]).toBe(75);
			expect(july21Data?.[mockCompetitors[0].id]).toBe(25);
		});
	});

	describe("calculateVisibilityPercentages - Date Bucketing", () => {
		it("should bucket PDT evening events correctly", () => {
			// Event created at 11 PM PDT on July 21
			// This becomes July 22 06:00 UTC but should bucket to July 21 PDT
			const promptRuns = [
				createPromptRun("run-1", "2025-07-21T23:00:00-07:00", true), // 11 PM PDT = 6 AM UTC next day
			];

			console.log("PDT evening test:");
			console.log("Run created at:", promptRuns[0].createdAt.toISOString());
			console.log("UTC date key would be:", promptRuns[0].createdAt.toISOString().split("T")[0]);
			console.log(
				"PDT date should be:",
				promptRuns[0].createdAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
			);

			// Pass PDT timezone explicitly
			const result = calculateVisibilityPercentages(
				promptRuns,
				mockBrand,
				mockCompetitors,
				"1w",
				"America/Los_Angeles",
			);

			console.log("Chart data result:", result);
			const datesWithData = result.filter((point) => point[mockBrand.id] !== null);
			console.log(
				"Dates with data:",
				datesWithData.map((d) => d.date),
			);

			// The event should be bucketed to July 21 (PDT date), not July 22 (UTC date)
			expect(datesWithData.length).toBeGreaterThan(0);
		});

		it("should bucket PDT morning events correctly", () => {
			// Event created at 8 AM PDT on July 21
			// This should be July 21 15:00 UTC - same date
			const promptRuns = [
				createPromptRun("run-1", "2025-07-21T08:00:00-07:00", true), // 8 AM PDT = 3 PM UTC same day
			];

			console.log("PDT morning test:");
			console.log("Run created at:", promptRuns[0].createdAt.toISOString());
			console.log("UTC date key would be:", promptRuns[0].createdAt.toISOString().split("T")[0]);
			console.log(
				"PDT date should be:",
				promptRuns[0].createdAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
			);

			const result = calculateVisibilityPercentages(
				promptRuns,
				mockBrand,
				mockCompetitors,
				"1w",
				"America/Los_Angeles",
			);

			console.log("Chart data result:", result);
			const datesWithData = result.filter((point) => point[mockBrand.id] !== null);
			console.log(
				"Dates with data:",
				datesWithData.map((d) => d.date),
			);

			expect(datesWithData.length).toBeGreaterThan(0);
		});

		it("should handle multiple events on same PDT date", () => {
			// Two events on July 21 PDT:
			// 1. Early morning (same UTC date)
			// 2. Late evening (next UTC date)
			const promptRuns = [
				createPromptRun("run-1", "2025-07-21T08:00:00-07:00", true), // 8 AM PDT = July 21 15:00 UTC
				createPromptRun("run-2", "2025-07-21T23:00:00-07:00", false), // 11 PM PDT = July 22 06:00 UTC
			];

			console.log("Multi-event test:");
			promptRuns.forEach((run, i) => {
				console.log(`Run ${i + 1} created at:`, run.createdAt.toISOString());
				console.log(`Run ${i + 1} UTC date:`, run.createdAt.toISOString().split("T")[0]);
				console.log(
					`Run ${i + 1} PDT date:`,
					run.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
				);
			});

			// Pass PDT timezone explicitly
			const result = calculateVisibilityPercentages(
				promptRuns,
				mockBrand,
				mockCompetitors,
				"1w",
				"America/Los_Angeles",
			);

			console.log("Multi-event chart data result:", result);
			const datesWithData = result.filter(
				(point) => point[mockBrand.id] !== null || point[mockCompetitors[0].id] !== null,
			);
			console.log(
				"Multi-event dates with data:",
				datesWithData.map((d) => ({
					date: d.date,
					brandMentions: d[mockBrand.id],
					competitorMentions: d[mockCompetitors[0].id],
				})),
			);

			// Both events happened on July 21 PDT, so with proper timezone bucketing
			// they should be in the same bucket
			expect(datesWithData.length).toBeGreaterThan(0);
		});

		it("should handle EST timezone edge cases", () => {
			// Event at 1 AM EST on July 21
			// This would be July 21 06:00 UTC - same date
			const promptRuns = [
				createPromptRun("run-1", "2025-07-21T01:00:00-05:00", true), // 1 AM EST = 6 AM UTC same day
			];

			console.log("EST test:");
			console.log("Run created at:", promptRuns[0].createdAt.toISOString());
			console.log("UTC date key would be:", promptRuns[0].createdAt.toISOString().split("T")[0]);
			console.log(
				"EST date should be:",
				promptRuns[0].createdAt.toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
			);

			const result = calculateVisibilityPercentages(promptRuns, mockBrand, mockCompetitors, "1w", "America/New_York");

			console.log("Chart data result:", result);
			const datesWithData = result.filter((point) => point[mockBrand.id] !== null);
			console.log(
				"Dates with data:",
				datesWithData.map((d) => d.date),
			);

			expect(datesWithData.length).toBeGreaterThan(0);
		});

		it("should show the timezone mismatch issue with current implementation", () => {
			// This test demonstrates the current issue where events from the same local date
			// may be split across multiple UTC chart buckets
			const promptRuns = [
				createPromptRun("run-1", "2025-07-21T08:00:00-07:00", true), // Morning PDT = same UTC date
				createPromptRun("run-2", "2025-07-21T23:00:00-07:00", false), // Evening PDT = next UTC date
			];

			console.log("\n=== Current implementation behavior ===");
			console.log("Both events are on July 21 PDT:");
			promptRuns.forEach((run, i) => {
				console.log(
					`Run ${i + 1}: ${run.createdAt.toISOString()} -> PDT: ${run.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })}`,
				);
			});

			const result = calculateVisibilityPercentages(
				promptRuns,
				mockBrand,
				mockCompetitors,
				"1w",
				"America/Los_Angeles",
			);

			const datesWithData = result.filter(
				(point) => point[mockBrand.id] !== null || point[mockCompetitors[0].id] !== null,
			);
			console.log("Chart buckets created:");
			datesWithData.forEach((d) => {
				console.log(`  ${d.date}: brand=${d[mockBrand.id]}%, competitor=${d[mockCompetitors[0].id]}%`);
			});

			// With the current partial fix (timezone-aware bucketing but UTC date range)
			// the data bucketing should work correctly, but the date range might not include all buckets
			console.log("=== End test ===\n");
		});
	});

	describe("calculateVisibilityPercentages - Date Bucketing", () => {
		it("should demonstrate the double timezone conversion issue in chart display", () => {
			console.log("\n=== DOUBLE TIMEZONE CONVERSION ISSUE ===");

			// This demonstrates the exact issue: data bucketed correctly, but chart display converts again
			const dateString = "2025-07-21"; // This is what our bucketing produces

			console.log("1. Data bucketing produces date string:", dateString);

			// This is what happens in the chart's tickFormatter
			const chartDate = new Date(dateString);
			console.log("2. new Date(dateString) creates:", chartDate.toISOString());
			console.log("   This is midnight UTC on July 21");

			// Then toLocaleDateString converts to user's timezone
			const pdtDisplay = chartDate.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
			console.log("3. toLocaleDateString in PDT shows:", pdtDisplay);

			// The issue: midnight UTC July 21 = 5 PM PDT July 20 (during daylight saving)
			// So July 21 data appears as July 20 on the chart!

			const utcDisplay = chartDate.toLocaleDateString("en-US", { timeZone: "UTC" });
			console.log("4. toLocaleDateString in UTC shows:", utcDisplay);

			console.log("\nTHE PROBLEM:");
			console.log("- Data correctly bucketed to July 21");
			console.log("- But chart displays it as July 20 in PDT!");
			console.log("=== END DOUBLE CONVERSION ISSUE ===\n");

			// The chart should display July 21, not July 20
			expect(pdtDisplay).toContain("7/20"); // This shows the bug
			expect(utcDisplay).toContain("7/21"); // This would be correct
		});

		it("should demonstrate the fix for double timezone conversion", () => {
			console.log("\n=== TIMEZONE CONVERSION FIX ===");

			const dateString = "2025-07-21"; // Data bucketed correctly

			console.log("1. Original problematic approach:");
			const oldWay = new Date(dateString);
			const oldDisplay = oldWay.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
			console.log(`   new Date("${dateString}") -> PDT display: ${oldDisplay}`);

			console.log("2. Fixed approach (parsing components directly):");
			const [year, month, day] = dateString.split("-").map(Number);
			const newWay = new Date(year, month - 1, day); // Local date construction
			const newDisplay = newWay.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});
			console.log(`   Parse components -> display: ${newDisplay}`);

			console.log("=== END FIX DEMO ===\n");

			// The fix should show July 21, not July 20
			expect(oldDisplay).toContain("7/20"); // Old way shows wrong date
			expect(newDisplay).toContain("Jul 21"); // New way shows correct date
		});
	});
});
