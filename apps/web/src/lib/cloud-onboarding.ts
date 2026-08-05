import type { ResolvedEntitlements } from "@workspace/config/entitlements";
import type { ClaudeTrackingMode } from "@workspace/config/plans";
import { buildInitialTargetSelections, type StoredTargetSelection } from "@/lib/cloud-tracking-settings";

export type CloudOnboardingTrackingData = {
	organizationId: string;
	resolved: Extract<ResolvedEntitlements, { mode: "cloud" }>;
	selections: StoredTargetSelection[];
	claudeAssignments: Array<{ promptId: string; mode: ClaudeTrackingMode }>;
	claudeUsage: {
		usedPromptSlots: number;
		totalPromptSlots: number;
	};
};

export function getCloudOnboardingGate(
	data: CloudOnboardingTrackingData | null,
): { kind: "continue" } | { kind: "billing"; organizationId: string } {
	return data?.resolved.access === "denied"
		? { kind: "billing", organizationId: data.organizationId }
		: { kind: "continue" };
}

export type CloudOnboardingPrompt = {
	_key: string;
	value: string;
	enabled: boolean;
};

export type CloudOnboardingTrackingState = {
	targetSelections: Map<string, number | null>;
	claudeAssignments: Map<string, ClaudeTrackingMode>;
};

export type CloudOnboardingTrackingSubmission = {
	selections: Array<{ targetKey: string; requestedCadenceMinutes: number | null }>;
	claudeAssignments: Array<{ promptClientId: string; mode: ClaudeTrackingMode }>;
};

export function createCloudOnboardingTrackingState(data: CloudOnboardingTrackingData): CloudOnboardingTrackingState {
	return {
		targetSelections: buildInitialTargetSelections(data.resolved.entitlements.trackingTargets, data.selections),
		claudeAssignments: new Map(),
	};
}

export function getLiveClaudeAssignments(
	prompts: readonly CloudOnboardingPrompt[],
	assignments: ReadonlyMap<string, ClaudeTrackingMode>,
): Array<{ promptClientId: string; mode: ClaudeTrackingMode }> {
	return prompts.flatMap((prompt) => {
		if (!prompt.enabled || !prompt.value.trim()) return [];
		const mode = assignments.get(prompt._key);
		return mode ? [{ promptClientId: prompt._key, mode }] : [];
	});
}

export function getCloudOnboardingTrackingError(input: {
	data: CloudOnboardingTrackingData;
	prompts: readonly CloudOnboardingPrompt[];
	state: CloudOnboardingTrackingState;
}): string | null {
	if (input.data.resolved.access !== "allowed") return "An active cloud plan is required.";

	const targets = input.data.resolved.entitlements.trackingTargets;
	const selectedCount = input.state.targetSelections.size;
	if (selectedCount < targets.minimumSelected || selectedCount > targets.maximumSelected) {
		return targets.minimumSelected === targets.maximumSelected
			? `Select exactly ${targets.minimumSelected} answer engine${targets.minimumSelected === 1 ? "" : "s"}.`
			: `Select between ${targets.minimumSelected} and ${targets.maximumSelected} answer engines.`;
	}

	const targetByKey = new Map(targets.targets.map((target) => [target.targetKey, target]));
	for (const [targetKey, requestedCadenceMinutes] of input.state.targetSelections) {
		const target = targetByKey.get(targetKey);
		if (!target) return `${targetKey} is not available on this plan.`;
		if (requestedCadenceMinutes === null) continue;
		if (!Number.isSafeInteger(requestedCadenceMinutes) || requestedCadenceMinutes <= 0) {
			return `Choose a valid cadence for ${targetKey}.`;
		}
		const cadencePolicy = target.schedule.cadencePolicy;
		if (
			cadencePolicy.mode === "fixed"
				? requestedCadenceMinutes !== target.schedule.cadenceMinutes
				: requestedCadenceMinutes < cadencePolicy.minimumCadenceMinutes ||
					requestedCadenceMinutes > cadencePolicy.maximumCadenceMinutes
		) {
			return `Choose a plan-allowed cadence for ${targetKey}.`;
		}
	}

	const claude = input.data.resolved.entitlements.claudeTracking;
	const assignments = getLiveClaudeAssignments(input.prompts, input.state.claudeAssignments);
	if (!claude.enabled && assignments.length > 0) return "Claude tracking is not available on this plan.";
	if (claude.enabled && assignments.some((assignment) => !claude.allowedModes.includes(assignment.mode))) {
		return "Choose a plan-allowed Claude tracking mode.";
	}
	const promptValues = new Set<string>();
	for (const prompt of input.prompts) {
		if (!prompt.enabled || !prompt.value.trim()) continue;
		const valueKey = prompt.value.trim().toLowerCase();
		if (promptValues.has(valueKey)) return "Remove duplicate prompts before starting tracking.";
		promptValues.add(valueKey);
	}
	const usedOutsideBrand = Math.max(0, input.data.claudeUsage.usedPromptSlots - input.data.claudeAssignments.length);
	if (usedOutsideBrand + assignments.length > input.data.claudeUsage.totalPromptSlots) {
		const remaining = Math.max(0, input.data.claudeUsage.totalPromptSlots - usedOutsideBrand);
		return `Choose at most ${remaining} Claude prompt${remaining === 1 ? "" : "s"} for this brand.`;
	}
	return null;
}

export function buildCloudOnboardingTrackingSubmission(input: {
	data: CloudOnboardingTrackingData;
	prompts: readonly CloudOnboardingPrompt[];
	state: CloudOnboardingTrackingState;
}): CloudOnboardingTrackingSubmission {
	const error = getCloudOnboardingTrackingError(input);
	if (error) throw new Error(error);
	if (input.data.resolved.access !== "allowed") throw new Error("An active cloud plan is required.");

	return {
		selections: input.data.resolved.entitlements.trackingTargets.targets.flatMap((target) => {
			if (!input.state.targetSelections.has(target.targetKey)) return [];
			return [
				{
					targetKey: target.targetKey,
					requestedCadenceMinutes: input.state.targetSelections.get(target.targetKey) ?? null,
				},
			];
		}),
		claudeAssignments: getLiveClaudeAssignments(input.prompts, input.state.claudeAssignments),
	};
}
