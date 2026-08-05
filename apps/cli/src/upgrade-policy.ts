import semver from "semver";
import type { Migration } from "./migrations/types.js";

export interface ReleaseCompatibilityBoundary {
	targetVersion: string;
	databaseCutover: "online" | "maintenance";
}

export const RELEASE_COMPATIBILITY_BOUNDARIES: readonly ReleaseCompatibilityBoundary[] = [
	{ targetVersion: "0.2.18", databaseCutover: "maintenance" },
];

function reachesReleaseLine(version: string, releaseVersion: string): boolean {
	return semver.gte(version, `${releaseVersion}-0`);
}

export function crossesCloudSchemaBoundary(input: { detectedVersion: string | null; targetVersion: string }): boolean {
	return (
		input.detectedVersion === null ||
		(semver.lt(input.detectedVersion, "0.2.18") && reachesReleaseLine(input.targetVersion, "0.2.18"))
	);
}

export function legacySingleDeploymentCutoverAllowed(input: {
	crossesSchemaBoundary: boolean;
	deploymentMode: string | undefined;
	managedLocalDeployment: boolean;
	runtimeFenceParticipates: boolean;
	singleDeploymentAcknowledged: boolean;
}): boolean {
	if (!input.crossesSchemaBoundary || input.managedLocalDeployment || input.runtimeFenceParticipates) return false;
	if (input.deploymentMode === "local" && input.singleDeploymentAcknowledged) return true;
	throw new Error(
		input.deploymentMode === "local"
			? "This legacy local deployment uses external PostgreSQL without runtime fencing. After confirming no other Elmo deployment or process uses this database, rerun with --acknowledge-single-deployment. --yes does not imply this acknowledgment."
			: "External and white-label schema upgrades require staged compatibility web and worker images that attest a shared runtime fence generation",
	);
}

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
				reachesReleaseLine(input.targetVersion, boundary.targetVersion),
		) || input.plan.some((migration) => migration.requiresMaintenance)
	);
}
