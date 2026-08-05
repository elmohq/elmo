import fs from "node:fs/promises";
import path from "node:path";
import { writeTextFileAtomically } from "./atomic-file.js";
import type { DeploymentConfigSnapshot } from "./upgrade-release.js";

const RECOVERY_FILE = ".elmo-upgrade-state.json";

export type UpgradeRecoveryPhase =
	| "config-checkpointed"
	| "preparing-release"
	| "release-prepared"
	| "stopping-services"
	| "services-stopped"
	| "migrating-database"
	| "database-migrated"
	| "applying-release"
	| "release-applied"
	| "starting-services"
	| "services-started"
	| "verifying-services"
	| "rolling-back";

const RECOVERY_PHASES: ReadonlySet<string> = new Set<UpgradeRecoveryPhase>([
	"config-checkpointed",
	"preparing-release",
	"release-prepared",
	"stopping-services",
	"services-stopped",
	"migrating-database",
	"database-migrated",
	"applying-release",
	"release-applied",
	"starting-services",
	"services-started",
	"verifying-services",
	"rolling-back",
]);

export interface DevelopmentImageBackup {
	service: string;
	imageId: string;
	originalReference: string;
	backupReference: string;
}

export interface UpgradeRecoveryState {
	formatVersion: 1;
	targetVersion: string;
	detectedVersion: string | null;
	fromVersion: string;
	requiresMaintenance: boolean;
	isDevelopment: boolean;
	previousRunningServices: string[];
	anyComposeServiceWasRunning: boolean;
	rollbackConfig: DeploymentConfigSnapshot;
	developmentImages?: DevelopmentImageBackup[];
	phase: UpgradeRecoveryPhase;
	createdAt: string;
	updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConfigFileSnapshot(value: unknown): boolean {
	return isRecord(value) && typeof value.contents === "string" && typeof value.mode === "number";
}

function isDevelopmentImageBackup(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.service === "string" &&
		typeof value.imageId === "string" &&
		typeof value.originalReference === "string" &&
		typeof value.backupReference === "string"
	);
}

function parseRecoveryState(value: unknown): UpgradeRecoveryState {
	if (
		!isRecord(value) ||
		value.formatVersion !== 1 ||
		typeof value.targetVersion !== "string" ||
		!(typeof value.detectedVersion === "string" || value.detectedVersion === null) ||
		typeof value.fromVersion !== "string" ||
		typeof value.requiresMaintenance !== "boolean" ||
		typeof value.isDevelopment !== "boolean" ||
		!Array.isArray(value.previousRunningServices) ||
		!value.previousRunningServices.every((service) => typeof service === "string") ||
		typeof value.anyComposeServiceWasRunning !== "boolean" ||
		!isRecord(value.rollbackConfig) ||
		!isConfigFileSnapshot(value.rollbackConfig.compose) ||
		!isConfigFileSnapshot(value.rollbackConfig.env) ||
		!(
			value.developmentImages === undefined ||
			(Array.isArray(value.developmentImages) && value.developmentImages.every(isDevelopmentImageBackup))
		) ||
		typeof value.phase !== "string" ||
		!RECOVERY_PHASES.has(value.phase) ||
		typeof value.createdAt !== "string" ||
		typeof value.updatedAt !== "string"
	) {
		throw new Error("Upgrade recovery state is invalid; inspect it before continuing");
	}
	return value as unknown as UpgradeRecoveryState;
}

export function recoveryFilePath(configDir: string): string {
	return path.join(configDir, RECOVERY_FILE);
}

export async function readUpgradeRecoveryState(configDir: string): Promise<UpgradeRecoveryState | null> {
	try {
		return parseRecoveryState(JSON.parse(await fs.readFile(recoveryFilePath(configDir), "utf8")));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
}

export async function writeUpgradeRecoveryState(
	configDir: string,
	state: UpgradeRecoveryState,
): Promise<UpgradeRecoveryState> {
	const next = { ...state, updatedAt: new Date().toISOString() };
	await writeTextFileAtomically(recoveryFilePath(configDir), `${JSON.stringify(next, null, 2)}\n`, 0o600);
	return next;
}

export async function removeUpgradeRecoveryState(configDir: string): Promise<void> {
	await fs.rm(recoveryFilePath(configDir), { force: true });
}
