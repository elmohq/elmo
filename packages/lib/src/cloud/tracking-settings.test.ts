import { resolveEntitlements } from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import {
	resolveRequestedCadence,
	TrackingSettingsError,
	validateRequestedClaudePromptAssignments,
	validateRequestedTrackingTargets,
} from "./tracking-settings";

function allowed(planId: "starter" | "basic" | "pro") {
	const resolved = resolveEntitlements({
		mode: "cloud",
		subscription: {
			planId,
			status: "active",
			currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
			delinquentSince: null,
		},
	});
	if (resolved.mode !== "cloud" || resolved.access !== "allowed") throw new Error("Expected an allowed fixture");
	return resolved;
}

describe("tracking settings policy", () => {
	it("requires the complete fixed Starter selection", () => {
		expect(validateRequestedTrackingTargets(allowed("starter"), [{ targetKey: "chatgpt" }])).toEqual([
			{ targetKey: "chatgpt", requestedCadenceMinutes: null, effectiveCadenceMinutes: 1440 },
		]);
		expect(() => validateRequestedTrackingTargets(allowed("starter"), [])).toThrow(TrackingSettingsError);
		expect(() =>
			validateRequestedTrackingTargets(allowed("starter"), [{ targetKey: "chatgpt", requestedCadenceMinutes: 360 }]),
		).toThrow("fixed by the plan");
	});

	it("requires exactly one allowed Claude mode per selected prompt", () => {
		expect(
			validateRequestedClaudePromptAssignments(allowed("pro"), [
				{ promptId: "prompt-1", mode: "base-model" },
				{ promptId: "prompt-2", mode: "native-web-search" },
			]),
		).toEqual([
			{ promptId: "prompt-1", mode: "base-model", targetKey: "claude-base-model" },
			{ promptId: "prompt-2", mode: "native-web-search", targetKey: "claude-native-web" },
		]);
		expect(() =>
			validateRequestedClaudePromptAssignments(allowed("pro"), [
				{ promptId: "prompt-1", mode: "base-model" },
				{ promptId: "prompt-1", mode: "native-web-search" },
			]),
		).toThrow("selected twice");
		expect(() =>
			validateRequestedClaudePromptAssignments(allowed("basic"), [{ promptId: "prompt-1", mode: "base-model" }]),
		).toThrow("not available");
	});

	it("enforces configurable target cardinality and membership", () => {
		expect(
			validateRequestedTrackingTargets(allowed("basic"), [
				{ targetKey: "chatgpt" },
				{ targetKey: "gemini" },
				{ targetKey: "perplexity" },
				{ targetKey: "copilot" },
			]),
		).toHaveLength(4);
		expect(() => validateRequestedTrackingTargets(allowed("basic"), [])).toThrow("at least 4");
		expect(() =>
			validateRequestedTrackingTargets(allowed("basic"), [
				{ targetKey: "chatgpt" },
				{ targetKey: "gemini" },
				{ targetKey: "perplexity" },
				{ targetKey: "copilot" },
				{ targetKey: "deepseek" },
			]),
		).toThrow("at most 4");
		expect(() => validateRequestedTrackingTargets(allowed("basic"), [{ targetKey: "claude-native-web" }])).toThrow(
			"not available",
		);
	});

	it("accepts only explicitly bounded configurable cadences", () => {
		const policy = {
			targetKey: "custom-search",
			schedule: {
				cadenceMinutes: 720,
				samplesPerEvaluation: 1,
				cadencePolicy: {
					mode: "configurable" as const,
					minimumCadenceMinutes: 240,
					maximumCadenceMinutes: 1440,
				},
			},
		};
		expect(resolveRequestedCadence(policy, 480)).toEqual({
			effectiveCadenceMinutes: 480,
			storedCadenceMinutes: 480,
		});
		expect(resolveRequestedCadence(policy, null)).toEqual({
			effectiveCadenceMinutes: 720,
			storedCadenceMinutes: null,
		});
		expect(() => resolveRequestedCadence(policy, 200)).toThrow("between 240 and 1440");
	});
});
