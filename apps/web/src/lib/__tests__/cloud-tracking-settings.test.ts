import type { TrackingTargetSelection } from "@workspace/config/plans";
import { describe, expect, it } from "vitest";
import {
	buildInitialTargetSelections,
	formatCadenceMinutes,
	getTrackingSettingsPageKind,
} from "@/lib/cloud-tracking-settings";

function targetDefinition(mode: "fixed" | "configurable"): TrackingTargetSelection {
	return {
		mode,
		minimumSelected: mode === "fixed" ? 2 : 1,
		maximumSelected: 2,
		targets: ["chatgpt", "gemini"].map((targetKey) => ({
			targetKey,
			schedule: {
				cadenceMinutes: 360,
				samplesPerEvaluation: 1,
				cadencePolicy: { mode: "fixed" as const },
			},
		})),
	};
}

describe("cloud tracking settings policy", () => {
	it.each(["local", "whitelabel", "demo"] as const)("keeps %s on the legacy page", (mode) => {
		expect(getTrackingSettingsPageKind(mode)).toBe("legacy");
	});

	it("loads cloud plan controls only in cloud mode", () => {
		expect(getTrackingSettingsPageKind("cloud")).toBe("cloud");
	});

	it("renders fixed selections from entitlements even before durable defaults exist", () => {
		expect([...buildInitialTargetSelections(targetDefinition("fixed"), [])]).toEqual([
			["chatgpt", null],
			["gemini", null],
		]);
	});

	it("does not infer unavailable targets from stale stored selections", () => {
		expect([
			...buildInitialTargetSelections(targetDefinition("configurable"), [
				{ targetKey: "perplexity", requestedCadenceMinutes: null },
				{ targetKey: "gemini", requestedCadenceMinutes: 480 },
			]),
		]).toEqual([["gemini", 480]]);
	});

	it("formats common cadence values for read-only policies", () => {
		expect(formatCadenceMinutes(60)).toBe("Hourly");
		expect(formatCadenceMinutes(360)).toBe("Every 6 hours");
		expect(formatCadenceMinutes(1440)).toBe("Daily");
		expect(formatCadenceMinutes(206)).toBe("Every 206 minutes");
	});
});
