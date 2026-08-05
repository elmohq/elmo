import semver from "semver";
import type { Migration } from "./migrations/types.js";

export interface ReleaseCompatibilityBoundary {
	targetVersion: string;
	databaseCutover: "online" | "maintenance";
}

export const RELEASE_COMPATIBILITY_BOUNDARIES: readonly ReleaseCompatibilityBoundary[] = [
	{ targetVersion: "0.2.18", databaseCutover: "maintenance" },
];

export function requiresMaintenanceUpgrade(input: {
	detectedVersion: string | null;
	targetVersion: string;
	plan: readonly Pick<Migration, "requiresMaintenance">[];
}): boolean {
	const detectedVersion = input.detectedVersion;
	if (detectedVersion === null) return true;
	return (
		RELEASE_COMPATIBILITY_BOUNDARIES.some(
			(boundary) =>
				boundary.databaseCutover === "maintenance" &&
				semver.lt(detectedVersion, boundary.targetVersion) &&
				semver.gte(input.targetVersion, boundary.targetVersion),
		) || input.plan.some((migration) => migration.requiresMaintenance)
	);
}
