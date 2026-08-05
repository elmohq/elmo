import { resolveEntitlements } from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import {
	buildCloudOnboardingTrackingSubmission,
	type CloudOnboardingTrackingData,
	createCloudOnboardingTrackingState,
	getCloudOnboardingGate,
	getCloudOnboardingTrackingError,
} from "@/lib/cloud-onboarding";

function trackingData(planId: "starter" | "basic" | "pro", claudeAddonPromptSlots = 0): CloudOnboardingTrackingData {
	const resolved = resolveEntitlements({
		mode: "cloud",
		subscription: {
			planId,
			status: "active",
			currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
			delinquentSince: null,
			claudeAddonPromptSlots,
		},
	});
	if (resolved.mode !== "cloud" || resolved.access !== "allowed") throw new Error("Expected an allowed plan");
	return {
		organizationId: "org-one",
		resolved,
		selections: resolved.entitlements.trackingTargets.targets
			.slice(0, resolved.entitlements.trackingTargets.minimumSelected)
			.map((target) => ({ targetKey: target.targetKey, requestedCadenceMinutes: null })),
		claudeAssignments: [],
		claudeUsage: {
			usedPromptSlots: 0,
			totalPromptSlots: resolved.entitlements.claudeTracking.totalPromptSlots,
		},
	};
}

const prompts = [
	{ _key: "prompt-one", value: "Which platform is best?", enabled: true },
	{ _key: "prompt-two", value: "Compare the leaders", enabled: true },
	{ _key: "prompt-disabled", value: "Disabled prompt", enabled: false },
];

describe("cloud onboarding tracking", () => {
	it("keeps Starter fixed to ChatGPT even before its durable default is visible", () => {
		const data = { ...trackingData("starter"), selections: [] };
		const state = createCloudOnboardingTrackingState(data);

		expect([...state.targetSelections]).toEqual([["chatgpt", null]]);
		expect(buildCloudOnboardingTrackingSubmission({ data, prompts, state })).toEqual({
			selections: [{ targetKey: "chatgpt", requestedCadenceMinutes: null }],
			claudeAssignments: [],
		});
	});

	it("submits the four Basic targets the user selected instead of the first four defaults", () => {
		const data = trackingData("basic");
		const state = createCloudOnboardingTrackingState(data);
		state.targetSelections.delete("chatgpt");
		state.targetSelections.set("perplexity", null);

		const submission = buildCloudOnboardingTrackingSubmission({ data, prompts, state });
		expect(submission.selections.map((selection) => selection.targetKey)).toEqual([
			"google-ai-mode",
			"google-ai-overview",
			"copilot",
			"perplexity",
		]);
	});

	it("requires the exact Basic target count", () => {
		const data = trackingData("basic");
		const state = createCloudOnboardingTrackingState(data);
		state.targetSelections.delete("chatgpt");

		expect(getCloudOnboardingTrackingError({ data, prompts, state })).toBe("Select exactly 4 answer engines.");
		expect(() => buildCloudOnboardingTrackingSubmission({ data, prompts, state })).toThrow(
			"Select exactly 4 answer engines.",
		);
	});

	it("blocks duplicate normalized prompt values before submitting the wizard", () => {
		const data = trackingData("basic");
		const state = createCloudOnboardingTrackingState(data);

		expect(
			getCloudOnboardingTrackingError({
				data,
				state,
				prompts: [
					{ _key: "first", value: "Same prompt", enabled: true },
					{ _key: "second", value: "  SAME PROMPT ", enabled: true },
				],
			}),
		).toBe("Remove duplicate prompts before starting tracking.");
	});

	it("submits each selected Pro prompt with its Claude mode and enforces the organization pool", () => {
		const data = trackingData("pro", 2);
		data.claudeUsage.usedPromptSlots = data.claudeUsage.totalPromptSlots - 1;
		const state = createCloudOnboardingTrackingState(data);
		state.claudeAssignments.set("prompt-one", "base-model");
		state.claudeAssignments.set("prompt-two", "native-web-search");
		state.claudeAssignments.set("prompt-disabled", "native-web-search");

		expect(getCloudOnboardingTrackingError({ data, prompts, state })).toBe(
			"Choose at most 1 Claude prompt for this brand.",
		);
		state.claudeAssignments.delete("prompt-two");
		expect(buildCloudOnboardingTrackingSubmission({ data, prompts, state }).claudeAssignments).toEqual([
			{ promptClientId: "prompt-one", mode: "base-model" },
		]);
	});

	it("sends denied cloud onboarding back to the owning organization's billing page", () => {
		const resolved = resolveEntitlements({ mode: "cloud", subscription: null });
		if (resolved.mode !== "cloud") throw new Error("Expected cloud entitlements");
		const denied: CloudOnboardingTrackingData = {
			organizationId: "org-denied",
			resolved,
			selections: [],
			claudeAssignments: [],
			claudeUsage: { usedPromptSlots: 0, totalPromptSlots: 0 },
		};

		expect(getCloudOnboardingGate(denied)).toEqual({ kind: "billing", organizationId: "org-denied" });
		expect(getCloudOnboardingGate(null)).toEqual({ kind: "continue" });
	});
});
