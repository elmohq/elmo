import type { TrackingTargetSelection } from "@workspace/config/plans";
import type { DeploymentMode } from "@workspace/config/types";

export type StoredTargetSelection = {
	targetKey: string;
	requestedCadenceMinutes: number | null;
};

export function getTrackingSettingsPageKind(mode: DeploymentMode): "cloud" | "legacy" {
	return mode === "cloud" ? "cloud" : "legacy";
}

export function buildInitialTargetSelections(
	definition: TrackingTargetSelection,
	storedSelections: readonly StoredTargetSelection[],
): Map<string, number | null> {
	const availableTargetKeys = new Set(definition.targets.map((target) => target.targetKey));
	const selections = new Map(
		storedSelections
			.filter((selection) => availableTargetKeys.has(selection.targetKey))
			.map((selection) => [selection.targetKey, selection.requestedCadenceMinutes]),
	);
	if (definition.mode === "fixed") {
		for (const target of definition.targets) {
			if (!selections.has(target.targetKey)) selections.set(target.targetKey, null);
		}
	}
	return selections;
}

export function formatCadenceMinutes(minutes: number): string {
	if (minutes % 1440 === 0) {
		const days = minutes / 1440;
		return days === 1 ? "Daily" : `Every ${days} days`;
	}
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return hours === 1 ? "Hourly" : `Every ${hours} hours`;
	}
	return `Every ${minutes} minutes`;
}
