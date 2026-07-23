import { describe, it, expect } from "vitest";
import type { ExclusionReason } from "@workspace/lib/config/resolve";
import {
	EXCLUSION_REASON_COPY,
	enabledModelsEntries,
	exclusionReasonDescription,
	exclusionReasonLabel,
	formatCadence,
	hoursToParts,
	impactSummary,
	isTrackingAll,
	partsToHours,
} from "./config-ui";

const ALL_REASONS: ExclusionReason[] = [
	"catalog-disabled",
	"credentials-unready",
	"requires-entitlement",
	"not-in-plan-menu",
	"not-picked-by-brand",
	"prompt-disabled",
	"pool-exhausted",
];

describe("EXCLUSION_REASON_COPY", () => {
	it("has non-empty label + description for every reason the resolver can surface", () => {
		for (const reason of ALL_REASONS) {
			const copy = EXCLUSION_REASON_COPY[reason];
			expect(copy.label.length).toBeGreaterThan(0);
			expect(copy.description.length).toBeGreaterThan(0);
		}
	});

	it("exposes label/description accessors", () => {
		expect(exclusionReasonLabel("credentials-unready")).toBe(EXCLUSION_REASON_COPY["credentials-unready"].label);
		expect(exclusionReasonDescription("pool-exhausted")).toBe(EXCLUSION_REASON_COPY["pool-exhausted"].description);
	});
});

describe("enabledModelsEntries", () => {
	const pickable = ["chatgpt", "gemini", "perplexity"];

	it("deletes the row (revert to inherit-all) when every pickable model is selected", () => {
		expect(enabledModelsEntries(["chatgpt", "gemini", "perplexity"], pickable)).toEqual([
			{ key: "run.enabled_models" },
		]);
	});

	it("stores the explicit subset when only some are selected", () => {
		expect(enabledModelsEntries(["chatgpt", "gemini"], pickable)).toEqual([
			{ key: "run.enabled_models", value: ["chatgpt", "gemini"] },
		]);
	});

	it("stores [] (track none) when nothing is selected", () => {
		expect(enabledModelsEntries([], pickable)).toEqual([{ key: "run.enabled_models", value: [] }]);
	});

	it("ignores selected models that aren't pickable", () => {
		expect(enabledModelsEntries(["chatgpt", "claude"], pickable)).toEqual([
			{ key: "run.enabled_models", value: ["chatgpt"] },
		]);
	});

	it("treats selecting exactly the pickable set (order-independent) as inherit-all", () => {
		expect(enabledModelsEntries(["perplexity", "chatgpt", "gemini"], pickable)).toEqual([
			{ key: "run.enabled_models" },
		]);
	});
});

describe("isTrackingAll", () => {
	it("is false when there are no pickable models", () => {
		expect(isTrackingAll([], [])).toBe(false);
	});
	it("is true only when every pickable model is selected", () => {
		expect(isTrackingAll(["a", "b"], ["a", "b"])).toBe(true);
		expect(isTrackingAll(["a"], ["a", "b"])).toBe(false);
	});
});

describe("cadence composition", () => {
	it("round-trips hours through parts", () => {
		for (const hours of [1, 6, 24, 25, 168, 170, 337]) {
			expect(partsToHours(hoursToParts(hours))).toBe(hours);
		}
	});

	it("splits into weeks/days/hours", () => {
		expect(hoursToParts(6)).toEqual({ weeks: 0, days: 0, hours: 6 });
		expect(hoursToParts(24)).toEqual({ weeks: 0, days: 1, hours: 0 });
		expect(hoursToParts(170)).toEqual({ weeks: 1, days: 0, hours: 2 });
	});

	it("formats compactly and rounds fractional hours", () => {
		expect(formatCadence(6)).toBe("6h");
		expect(formatCadence(24)).toBe("1d");
		expect(formatCadence(170)).toBe("1w 2h");
		expect(formatCadence(0)).toBe("0h");
		expect(formatCadence(24 / 7)).toBe("3h");
	});
});

describe("impactSummary", () => {
	it("summarizes model count (pluralized) and cadence", () => {
		expect(impactSummary({ modelCount: 4, cadenceHours: 6 })).toBe("Tracking 4 models · runs every 6h");
		expect(impactSummary({ modelCount: 1, cadenceHours: 24 })).toBe("Tracking 1 model · runs every 1d");
	});
});
