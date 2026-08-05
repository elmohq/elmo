import fs from "node:fs/promises";
import path from "node:path";
import { syncDirectory, writeTextFileAtomically } from "./atomic-file.js";
import { isUpgradeCutoverLockIdentity, type UpgradeCutoverLockIdentity } from "./database-cutover-lock.js";
import type { DockerEngineIdentity } from "./docker-engine-identity.js";
import type { RollbackRuntimeImage } from "./rollback-compatibility.js";
import type { DeploymentConfigSnapshot } from "./upgrade-release.js";
import { deploymentUpgradeIdentity, ensurePrivateUpgradeStorage, upgradeRecoveryPath } from "./upgrade-storage.js";

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

export interface PreparedTargetImageIds {
	dbMigrate: string;
	web: string;
	worker: string;
}

export function reconcilePreparedTargetImageIds(
	expected: PreparedTargetImageIds | undefined,
	candidate: PreparedTargetImageIds,
): PreparedTargetImageIds {
	if (!expected) return candidate;
	for (const service of ["dbMigrate", "web", "worker"] as const) {
		if (candidate[service] !== expected[service]) {
			throw new Error(
				`Prepared ${service} image changed during recovery; restore exact image ${expected[service]} before resuming`,
			);
		}
	}
	return expected;
}

export interface UpgradeRecoveryState {
	formatVersion: 1;
	deploymentId: string;
	databaseFingerprint: string;
	dockerEngine: DockerEngineIdentity;
	targetVersion: string;
	detectedVersion: string | null;
	fromVersion: string;
	requiresMaintenance: boolean;
	isDevelopment: boolean;
	previousRunningServices: string[];
	anyComposeServiceWasRunning: boolean;
	rollbackSchemaCompatibility: string | null;
	rollbackConfig: DeploymentConfigSnapshot;
	rollbackImages?: RollbackRuntimeImage[];
	legacySingleDeploymentAcknowledged?: boolean;
	sourceRuntimeFences?: UpgradeCutoverLockIdentity[];
	developmentImages?: DevelopmentImageBackup[];
	preparedTargetImageIds?: PreparedTargetImageIds;
	cutoverLock?: UpgradeCutoverLockIdentity;
	cutoverStarted: boolean;
	databaseBoundaryMayHaveAdvanced: boolean;
	applicationServicesQuiesced: boolean;
	applicationContainersRemoved: boolean;
	phase: UpgradeRecoveryPhase;
	createdAt: string;
	updatedAt: string;
}

const CUTOVER_PHASES: ReadonlySet<UpgradeRecoveryPhase> = new Set([
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

const DATABASE_PHASES: ReadonlySet<UpgradeRecoveryPhase> = new Set([
	"migrating-database",
	"database-migrated",
	"applying-release",
	"release-applied",
	"starting-services",
	"services-started",
	"verifying-services",
	"rolling-back",
]);

const RECOVERY_SENTINEL_NAME = ".elmo-upgrade-in-progress.json";

interface RecoverySentinel {
	formatVersion: 1;
	status: "active" | "complete";
	recoveryPath: string;
	configKey: string;
	deploymentId: string;
	databaseFingerprint: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecoverySentinel(value: unknown): RecoverySentinel {
	if (
		!isRecord(value) ||
		value.formatVersion !== 1 ||
		(value.status !== "active" && value.status !== "complete") ||
		typeof value.recoveryPath !== "string" ||
		!path.isAbsolute(value.recoveryPath) ||
		typeof value.configKey !== "string" ||
		typeof value.deploymentId !== "string" ||
		typeof value.databaseFingerprint !== "string"
	) {
		throw new Error("Upgrade recovery sentinel is invalid; inspect it before continuing");
	}
	return value as unknown as RecoverySentinel;
}

function recoverySentinelPath(configDir: string): string {
	return path.join(configDir, RECOVERY_SENTINEL_NAME);
}

async function readRecoverySentinel(configDir: string): Promise<RecoverySentinel | null> {
	const sentinelPath = recoverySentinelPath(configDir);
	try {
		const metadata = await fs.lstat(sentinelPath);
		if (metadata.isSymbolicLink() || !metadata.isFile()) {
			throw new Error(`Upgrade recovery sentinel must be a regular file: ${sentinelPath}`);
		}
		const sentinel = parseRecoverySentinel(JSON.parse(await fs.readFile(sentinelPath, "utf8")));
		const identity = await deploymentUpgradeIdentity(configDir);
		if (
			sentinel.configKey !== identity.configKey ||
			sentinel.deploymentId !== identity.deploymentId ||
			sentinel.databaseFingerprint !== identity.databaseFingerprint ||
			path.basename(sentinel.recoveryPath) !== `${identity.configKey}.recovery.json`
		) {
			throw new Error("Upgrade recovery sentinel belongs to a different deployment or database target");
		}
		return sentinel;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
}

async function writeRecoverySentinel(configDir: string, sentinel: RecoverySentinel): Promise<void> {
	await writeTextFileAtomically(recoverySentinelPath(configDir), `${JSON.stringify(sentinel, null, 2)}\n`, 0o600);
}

function isConfigFileSnapshot(value: unknown): boolean {
	return isRecord(value) && typeof value.contents === "string" && typeof value.mode === "number";
}

function isDockerEngineIdentity(value: unknown): value is DockerEngineIdentity {
	return (
		isRecord(value) &&
		typeof value.daemonId === "string" &&
		value.daemonId.length > 0 &&
		typeof value.context === "string" &&
		value.context.length > 0 &&
		typeof value.endpoint === "string" &&
		value.endpoint.length > 0 &&
		typeof value.composeProject === "string" &&
		value.composeProject.length > 0
	);
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

function isRollbackRuntimeImage(value: unknown): value is RollbackRuntimeImage {
	return (
		isRecord(value) &&
		(value.service === "web" || value.service === "worker") &&
		typeof value.imageId === "string" &&
		/^sha256:[a-f0-9]+$/iu.test(value.imageId) &&
		typeof value.reference === "string" &&
		value.reference.length > 0 &&
		(value.runtimeFenceGeneration === undefined ||
			(typeof value.runtimeFenceGeneration === "string" &&
				/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(value.runtimeFenceGeneration)))
	);
}

function isRollbackRuntimeImages(value: unknown): value is RollbackRuntimeImage[] {
	return (
		Array.isArray(value) &&
		value.every(isRollbackRuntimeImage) &&
		new Set(value.map((image) => image.service)).size === value.length
	);
}

function isPreparedTargetImageIds(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.dbMigrate === "string" &&
		/^sha256:[a-f0-9]+$/iu.test(value.dbMigrate) &&
		typeof value.web === "string" &&
		/^sha256:[a-f0-9]+$/iu.test(value.web) &&
		typeof value.worker === "string" &&
		/^sha256:[a-f0-9]+$/iu.test(value.worker)
	);
}

function parseRecoveryState(value: unknown): UpgradeRecoveryState {
	if (
		!isRecord(value) ||
		value.formatVersion !== 1 ||
		typeof value.deploymentId !== "string" ||
		typeof value.databaseFingerprint !== "string" ||
		!isDockerEngineIdentity(value.dockerEngine) ||
		typeof value.targetVersion !== "string" ||
		!(typeof value.detectedVersion === "string" || value.detectedVersion === null) ||
		typeof value.fromVersion !== "string" ||
		typeof value.requiresMaintenance !== "boolean" ||
		typeof value.isDevelopment !== "boolean" ||
		!Array.isArray(value.previousRunningServices) ||
		!value.previousRunningServices.every((service) => typeof service === "string") ||
		typeof value.anyComposeServiceWasRunning !== "boolean" ||
		!(typeof value.rollbackSchemaCompatibility === "string" || value.rollbackSchemaCompatibility === null) ||
		!isRecord(value.rollbackConfig) ||
		!isConfigFileSnapshot(value.rollbackConfig.compose) ||
		!isConfigFileSnapshot(value.rollbackConfig.env) ||
		!(value.rollbackImages === undefined || isRollbackRuntimeImages(value.rollbackImages)) ||
		!(
			value.legacySingleDeploymentAcknowledged === undefined ||
			typeof value.legacySingleDeploymentAcknowledged === "boolean"
		) ||
		!(
			value.sourceRuntimeFences === undefined ||
			(Array.isArray(value.sourceRuntimeFences) &&
				value.sourceRuntimeFences.every(isUpgradeCutoverLockIdentity) &&
				new Set(value.sourceRuntimeFences.map((lock) => lock.runtimeFenceGeneration)).size ===
					value.sourceRuntimeFences.length)
		) ||
		!(
			value.developmentImages === undefined ||
			(Array.isArray(value.developmentImages) && value.developmentImages.every(isDevelopmentImageBackup))
		) ||
		!(value.preparedTargetImageIds === undefined || isPreparedTargetImageIds(value.preparedTargetImageIds)) ||
		!(value.cutoverLock === undefined || isUpgradeCutoverLockIdentity(value.cutoverLock)) ||
		!(value.cutoverStarted === undefined || typeof value.cutoverStarted === "boolean") ||
		!(
			value.databaseBoundaryMayHaveAdvanced === undefined || typeof value.databaseBoundaryMayHaveAdvanced === "boolean"
		) ||
		!(value.applicationServicesQuiesced === undefined || typeof value.applicationServicesQuiesced === "boolean") ||
		!(value.applicationContainersRemoved === undefined || typeof value.applicationContainersRemoved === "boolean") ||
		typeof value.phase !== "string" ||
		!RECOVERY_PHASES.has(value.phase) ||
		typeof value.createdAt !== "string" ||
		typeof value.updatedAt !== "string"
	) {
		throw new Error("Upgrade recovery state is invalid; inspect it before continuing");
	}
	if (value.cutoverLock && value.cutoverLock.lockRole !== "serialization") {
		throw new Error("Upgrade recovery serialization lock has an invalid role");
	}
	if (value.sourceRuntimeFences?.some((lock) => lock.lockRole !== "source-runtime")) {
		throw new Error("Upgrade recovery source runtime fence has an invalid role");
	}
	const phase = value.phase as UpgradeRecoveryPhase;
	return {
		...(value as unknown as UpgradeRecoveryState),
		cutoverStarted: typeof value.cutoverStarted === "boolean" ? value.cutoverStarted : CUTOVER_PHASES.has(phase),
		databaseBoundaryMayHaveAdvanced:
			typeof value.databaseBoundaryMayHaveAdvanced === "boolean"
				? value.databaseBoundaryMayHaveAdvanced
				: DATABASE_PHASES.has(phase),
		applicationServicesQuiesced:
			typeof value.applicationServicesQuiesced === "boolean" ? value.applicationServicesQuiesced : false,
		applicationContainersRemoved:
			typeof value.applicationContainersRemoved === "boolean" ? value.applicationContainersRemoved : false,
	};
}

export function advanceUpgradeRecoveryState(
	state: UpgradeRecoveryState,
	phase: UpgradeRecoveryPhase,
	facts: {
		cutoverStarted?: boolean;
		databaseBoundaryMayHaveAdvanced?: boolean;
		applicationServicesQuiesced?: boolean;
		applicationContainersRemoved?: boolean;
	} = {},
): UpgradeRecoveryState {
	return {
		...state,
		phase,
		cutoverStarted: state.cutoverStarted || facts.cutoverStarted === true,
		databaseBoundaryMayHaveAdvanced:
			state.databaseBoundaryMayHaveAdvanced || facts.databaseBoundaryMayHaveAdvanced === true,
		applicationServicesQuiesced: state.applicationServicesQuiesced || facts.applicationServicesQuiesced === true,
		applicationContainersRemoved: state.applicationContainersRemoved || facts.applicationContainersRemoved === true,
	};
}

export async function recoveryFilePath(configDir: string, storageRoot?: string): Promise<string> {
	const sentinel = await readRecoverySentinel(configDir);
	return sentinel?.status === "active" ? sentinel.recoveryPath : upgradeRecoveryPath(configDir, storageRoot);
}

export async function readUpgradeRecoveryState(
	configDir: string,
	storageRoot?: string,
): Promise<UpgradeRecoveryState | null> {
	const sentinel = await readRecoverySentinel(configDir);
	if (sentinel?.status === "complete") return null;
	const statePath = sentinel?.recoveryPath ?? (await upgradeRecoveryPath(configDir, storageRoot));
	try {
		const metadata = await fs.lstat(statePath);
		if (metadata.isSymbolicLink() || !metadata.isFile()) {
			throw new Error(`Upgrade recovery state must be a regular file: ${statePath}`);
		}
		const state = parseRecoveryState(JSON.parse(await fs.readFile(statePath, "utf8")));
		const { configKey, databaseFingerprint, deploymentId, deploymentKey } = await deploymentUpgradeIdentity(configDir);
		if (state.deploymentId !== deploymentId || state.databaseFingerprint !== databaseFingerprint) {
			throw new Error("Upgrade recovery state belongs to a different deployment or database target");
		}
		for (const lock of [state.cutoverLock, ...(state.sourceRuntimeFences ?? [])]) {
			if (
				lock &&
				(lock.configKey !== configKey ||
					lock.deploymentKey !== deploymentKey ||
					lock.databaseFingerprint !== databaseFingerprint)
			) {
				throw new Error("Upgrade recovery database lock belongs to a different deployment or database target");
			}
		}
		return state;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			if (sentinel) {
				throw new Error(`Upgrade recovery sentinel exists but its private state is missing: ${statePath}`, {
					cause: error,
				});
			}
			return null;
		}
		throw error;
	}
}

export async function writeUpgradeRecoveryState(
	configDir: string,
	state: UpgradeRecoveryState,
	storageRoot?: string,
): Promise<UpgradeRecoveryState> {
	const next = { ...state, updatedAt: new Date().toISOString() };
	const { configKey, databaseFingerprint, deploymentId, deploymentKey } = await deploymentUpgradeIdentity(configDir);
	if (next.deploymentId !== deploymentId || next.databaseFingerprint !== databaseFingerprint) {
		throw new Error("Refusing to write recovery state for a different deployment or database target");
	}
	if (next.cutoverLock?.lockRole !== undefined && next.cutoverLock.lockRole !== "serialization") {
		throw new Error("Refusing to write an invalid upgrade serialization lock role");
	}
	if (next.sourceRuntimeFences?.some((lock) => lock.lockRole !== "source-runtime")) {
		throw new Error("Refusing to write an invalid source runtime fence role");
	}
	for (const lock of [next.cutoverLock, ...(next.sourceRuntimeFences ?? [])]) {
		if (
			lock &&
			(lock.configKey !== configKey ||
				lock.deploymentKey !== deploymentKey ||
				lock.databaseFingerprint !== databaseFingerprint)
		) {
			throw new Error("Refusing to write a database lock for a different deployment or database target");
		}
	}
	let existingSentinel = await readRecoverySentinel(configDir);
	if (existingSentinel?.status === "complete") {
		await fs.rm(existingSentinel.recoveryPath, { force: true });
		await syncDirectory(path.dirname(existingSentinel.recoveryPath));
		await fs.rm(recoverySentinelPath(configDir));
		await syncDirectory(configDir);
		existingSentinel = null;
	}
	const statePath = existingSentinel?.recoveryPath ?? (await upgradeRecoveryPath(configDir, storageRoot));
	await ensurePrivateUpgradeStorage(statePath);
	if (!existingSentinel) {
		const identity = await deploymentUpgradeIdentity(configDir);
		await writeRecoverySentinel(configDir, {
			formatVersion: 1,
			status: "active",
			recoveryPath: statePath,
			configKey: identity.configKey,
			deploymentId,
			databaseFingerprint,
		});
	}
	await writeTextFileAtomically(statePath, `${JSON.stringify(next, null, 2)}\n`, 0o600);
	return next;
}

export async function removeUpgradeRecoveryState(configDir: string, storageRoot?: string): Promise<void> {
	const sentinel = await readRecoverySentinel(configDir);
	const statePath = sentinel?.recoveryPath ?? (await upgradeRecoveryPath(configDir, storageRoot));
	if (sentinel?.status === "active") {
		await writeRecoverySentinel(configDir, { ...sentinel, status: "complete" });
	}
	try {
		const metadata = await fs.lstat(statePath);
		if (metadata.isSymbolicLink() || !metadata.isFile()) {
			throw new Error(`Upgrade recovery state must be a regular file: ${statePath}`);
		}
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
	try {
		await fs.rm(statePath);
		await syncDirectory(path.dirname(statePath));
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
	}
	if (sentinel) {
		await fs.rm(recoverySentinelPath(configDir));
		await syncDirectory(configDir);
	}
}
