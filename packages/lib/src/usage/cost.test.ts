import { describe, expect, it } from "vitest";
import { estimateRunCostUsd, failedRunCostUsd, projectMonthlyTargetCostUsd, runCostUsd } from "./cost";

describe("estimateRunCostUsd", () => {
	it("prices a run by provider", () => {
		expect(estimateRunCostUsd("brightdata", false)).toBe(0.01);
		expect(estimateRunCostUsd("dataforseo", false)).toBe(0.005);
	});

	it("adds Anthropic's per-use web search charge only when grounded", () => {
		const base = estimateRunCostUsd("anthropic-api", false);
		const grounded = estimateRunCostUsd("anthropic-api", true);
		expect(base).not.toBeNull();
		expect(grounded).toBeGreaterThan(base as number);
	});

	it("reports nothing for an unpriced or missing provider", () => {
		expect(estimateRunCostUsd("some-new-provider", false)).toBeNull();
		expect(estimateRunCostUsd(null, false)).toBeNull();
	});
});

describe("projectMonthlyTargetCostUsd", () => {
	it("multiplies per-run cost by prompts, cadence, replication and 30 days", () => {
		// 10 prompts x 4/day x 5 calls x 30 days = 6000 runs at a cent each.
		expect(
			projectMonthlyTargetCostUsd({ costPerRunUsd: 0.01, enabledPrompts: 10, runsPerDay: 4, replication: 5 }),
		).toBeCloseTo(60, 6);
	});

	it("costs nothing when a brand has no enabled prompts", () => {
		expect(projectMonthlyTargetCostUsd({ costPerRunUsd: 0.01, enabledPrompts: 0, runsPerDay: 4, replication: 5 })).toBe(
			0,
		);
	});

	it("stays unknown when the per-run cost is unknown, rather than guessing zero", () => {
		expect(
			projectMonthlyTargetCostUsd({ costPerRunUsd: null, enabledPrompts: 10, runsPerDay: 4, replication: 5 }),
		).toBeNull();
	});
});

describe("runCostUsd", () => {
	it("uses the dollars the provider billed over any estimate", () => {
		expect(runCostUsd({ provider: "openrouter", webSearchEnabled: false, billedUsd: 0.0006 })).toBe(0.0006);
	});

	it("converts billed credits to dollars at the provider's plan rate", () => {
		const sevenCredits = runCostUsd({ provider: "cloro", webSearchEnabled: true, billedCredits: 7 });
		expect(sevenCredits).toBeCloseTo((7 * 500) / 1_350_000, 9);
	});

	it("falls back to the flat estimate when the provider reported nothing", () => {
		expect(runCostUsd({ provider: "brightdata", webSearchEnabled: true })).toBe(estimateRunCostUsd("brightdata", true));
	});
});

describe("failedRunCostUsd", () => {
	it("costs nothing for providers that only bill results", () => {
		expect(failedRunCostUsd("cloro", true)).toBe(0);
		expect(failedRunCostUsd("openrouter", false)).toBe(0);
	});

	it("keeps the estimate for providers that may bill a failed call", () => {
		expect(failedRunCostUsd("brightdata", true)).toBe(estimateRunCostUsd("brightdata", true));
	});
});
