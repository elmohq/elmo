import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { syncDirectory, writeNewTextFileDurably } from "./atomic-file.js";
import { databaseUtilityConnectivity } from "./database-compose-connectivity.js";
import { deploymentUpgradeIdentity } from "./upgrade-storage.js";

export const UPGRADE_CUTOVER_LOCK_MARKER_LABEL = "com.elmohq.elmo.upgrade-cutover-lock";
export const UPGRADE_CUTOVER_LOCK_CONFIG_LABEL = "com.elmohq.elmo.upgrade-config";
export const UPGRADE_CUTOVER_LOCK_DEPLOYMENT_LABEL = "com.elmohq.elmo.upgrade-deployment";
export const UPGRADE_CUTOVER_LOCK_DATABASE_LABEL = "com.elmohq.elmo.upgrade-database";
export const UPGRADE_CUTOVER_LOCK_OWNER_LABEL = "com.elmohq.elmo.upgrade-owner";
export const UPGRADE_CUTOVER_LOCK_ROLE_LABEL = "com.elmohq.elmo.upgrade-lock-role";
export const UPGRADE_CUTOVER_LOCK_GENERATION_LABEL = "com.elmohq.elmo.runtime-fence-generation";
export const UPGRADE_CUTOVER_LOCK_TARGET_LABEL = "com.elmohq.elmo.upgrade-target";
export const UPGRADE_CUTOVER_LOCK_SERVICE_NAME = "elmo-upgrade-cutover-lock";
export const UPGRADE_CUTOVER_LOCK_READY_FILE = "/tmp/elmo-upgrade-cutover-lock-ready";
export const UPGRADE_CUTOVER_LOCK_UNAVAILABLE_EXIT_CODE = 75;
const CUTOVER_LOCK_MAX_MARKER_AGE_MS = 15_000;

export interface UpgradeCutoverLockIdentity {
	containerName: string;
	configKey: string;
	databaseFingerprint: string;
	deploymentKey: string;
	lockRole: "serialization" | "source-runtime";
	ownerToken: string;
	runtimeFenceGeneration?: string;
}

type CaptureDocker = (args: string[]) => Promise<string>;
type RunDocker = (args: string[]) => Promise<void>;
type RunCompose = (args: string[]) => Promise<void>;

interface ContainerInspect {
	Config?: { Labels?: Record<string, string> };
	Image?: string;
	Name?: string;
	State?: {
		ExitCode?: number;
		Health?: { Status?: string };
		Status?: string;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingContainer(error: unknown): boolean {
	return error instanceof Error && /no such (?:object|container)/i.test(error.message);
}

function parseInspect(output: string): ContainerInspect {
	const parsed: unknown = JSON.parse(output);
	if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0])) {
		throw new Error("Docker returned invalid upgrade cutover lock metadata");
	}
	return parsed[0] as ContainerInspect;
}

async function inspectContainer(containerName: string, capture: CaptureDocker): Promise<ContainerInspect | undefined> {
	try {
		return parseInspect(await capture(["container", "inspect", containerName]));
	} catch (error) {
		if (isMissingContainer(error)) return undefined;
		throw error;
	}
}

function expectedLabels(identity: UpgradeCutoverLockIdentity, targetVersion: string): Record<string, string> {
	return {
		[UPGRADE_CUTOVER_LOCK_MARKER_LABEL]: "true",
		[UPGRADE_CUTOVER_LOCK_CONFIG_LABEL]: identity.configKey,
		[UPGRADE_CUTOVER_LOCK_DEPLOYMENT_LABEL]: identity.deploymentKey,
		[UPGRADE_CUTOVER_LOCK_DATABASE_LABEL]: identity.databaseFingerprint,
		[UPGRADE_CUTOVER_LOCK_OWNER_LABEL]: identity.ownerToken,
		[UPGRADE_CUTOVER_LOCK_ROLE_LABEL]: identity.lockRole,
		[UPGRADE_CUTOVER_LOCK_TARGET_LABEL]: targetVersion,
		...(identity.runtimeFenceGeneration
			? { [UPGRADE_CUTOVER_LOCK_GENERATION_LABEL]: identity.runtimeFenceGeneration }
			: {}),
	};
}

function assertOwnedMetadata(input: {
	identity: UpgradeCutoverLockIdentity;
	targetVersion: string;
	migrationImageId: string;
	metadata: ContainerInspect;
}): ContainerInspect {
	const labels = input.metadata.Config?.Labels;
	for (const [name, value] of Object.entries(expectedLabels(input.identity, input.targetVersion))) {
		if (labels?.[name] !== value) {
			throw new Error(
				`Container ${input.identity.containerName} is not the database cutover lock owned by this upgrade`,
			);
		}
	}
	if (input.metadata.Image !== input.migrationImageId) {
		throw new Error(`Database cutover lock is not running the prepared migrator image ${input.migrationImageId}`);
	}
	return input.metadata;
}

export async function createUpgradeCutoverLockIdentity(
	configDir: string,
	ownerToken = randomUUID(),
): Promise<UpgradeCutoverLockIdentity> {
	const identity = await deploymentUpgradeIdentity(configDir);
	return {
		containerName: `elmo-upgrade-cutover-lock-${identity.configKey.slice(0, 20)}`,
		configKey: identity.configKey,
		databaseFingerprint: identity.databaseFingerprint,
		deploymentKey: identity.deploymentKey,
		lockRole: "serialization",
		ownerToken,
	};
}

export async function createSourceRuntimeFenceIdentity(
	configDir: string,
	runtimeFenceGeneration: string,
	ownerToken = randomUUID(),
): Promise<UpgradeCutoverLockIdentity> {
	if (!/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(runtimeFenceGeneration)) {
		throw new Error("Source runtime fence generation is invalid");
	}
	const identity = await deploymentUpgradeIdentity(configDir);
	const generationKey = crypto.createHash("sha256").update(runtimeFenceGeneration, "utf8").digest("hex");
	return {
		containerName: `elmo-upgrade-source-fence-${identity.configKey.slice(0, 12)}-${generationKey.slice(0, 12)}`,
		configKey: identity.configKey,
		databaseFingerprint: identity.databaseFingerprint,
		deploymentKey: identity.deploymentKey,
		lockRole: "source-runtime",
		ownerToken,
		runtimeFenceGeneration,
	};
}

export function isUpgradeCutoverLockIdentity(value: unknown): value is UpgradeCutoverLockIdentity {
	return (
		isRecord(value) &&
		typeof value.containerName === "string" &&
		(/^elmo-upgrade-cutover-lock-[a-f0-9]{20}$/u.test(value.containerName) ||
			/^elmo-upgrade-source-fence-[a-f0-9]{12}-[a-f0-9]{12}$/u.test(value.containerName)) &&
		typeof value.configKey === "string" &&
		/^[a-f0-9]{64}$/u.test(value.configKey) &&
		typeof value.databaseFingerprint === "string" &&
		/^[a-f0-9]{64}$/u.test(value.databaseFingerprint) &&
		typeof value.deploymentKey === "string" &&
		/^[a-f0-9]{64}$/u.test(value.deploymentKey) &&
		(value.lockRole === "serialization" || value.lockRole === "source-runtime") &&
		typeof value.ownerToken === "string" &&
		/^[0-9a-f-]{36}$/iu.test(value.ownerToken) &&
		(value.lockRole === "source-runtime"
			? typeof value.runtimeFenceGeneration === "string" &&
				/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(value.runtimeFenceGeneration)
			: value.runtimeFenceGeneration === undefined)
	);
}

export function buildUpgradeCutoverLockOverride(input: {
	migrationImageId: string;
	managedPostgres?: boolean;
	connectivity?: Record<string, unknown>;
	runtimeFenceGeneration?: string;
}): string {
	const service: Record<string, unknown> = {
		...input.connectivity,
		image: input.migrationImageId,
		pull_policy: "never",
		restart: "no",
		command: ["./node_modules/.bin/tsx", "scripts/hold-cutover-lock.ts"],
		environment: {
			DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
			ELMO_CUTOVER_LOCK_READY_FILE: UPGRADE_CUTOVER_LOCK_READY_FILE,
			...(input.runtimeFenceGeneration ? { ELMO_CUTOVER_RUNTIME_FENCE_GENERATION: input.runtimeFenceGeneration } : {}),
		},
		healthcheck: {
			test: [
				"CMD",
				"node",
				"-e",
				`const fs=require("node:fs");const age=Date.now()-fs.statSync("${UPGRADE_CUTOVER_LOCK_READY_FILE}").mtimeMs;if(age>${CUTOVER_LOCK_MAX_MARKER_AGE_MS})process.exit(1);process.kill(1,0)`,
			],
			interval: "2s",
			timeout: "2s",
			retries: 3,
			start_period: input.runtimeFenceGeneration ? "35s" : "10s",
		},
	};
	if (input.managedPostgres) {
		service.depends_on = {
			...(isRecord(service.depends_on) ? service.depends_on : {}),
			postgres: { condition: "service_healthy" },
		};
	}
	return stringify({ services: { [UPGRADE_CUTOVER_LOCK_SERVICE_NAME]: service } });
}

async function withCutoverLockOverride<T>(
	input: {
		configDir: string;
		identity: UpgradeCutoverLockIdentity;
		migrationImageId: string;
	},
	action: (withOverride: (args: string[]) => string[]) => Promise<T>,
): Promise<T> {
	const overridePath = path.join(input.configDir, `.elmo-upgrade-cutover-lock-${crypto.randomUUID()}.yaml`);
	const composeContents = await fs.readFile(path.join(input.configDir, "elmo.yaml"), "utf8");
	const composeDocument: unknown = parse(composeContents);
	if (!isRecord(composeDocument) || !isRecord(composeDocument.services)) {
		throw new Error("Compose file does not define services");
	}
	const override = buildUpgradeCutoverLockOverride({
		migrationImageId: input.migrationImageId,
		managedPostgres: isRecord(composeDocument.services.postgres),
		connectivity: databaseUtilityConnectivity(composeContents),
		runtimeFenceGeneration: input.identity.runtimeFenceGeneration,
	});
	await writeNewTextFileDurably(overridePath, override, 0o600);
	try {
		return await action((args) => ["-f", overridePath, ...args]);
	} finally {
		await fs.rm(overridePath, { force: true });
		await syncDirectory(input.configDir);
	}
}

async function waitForReady(input: {
	identity: UpgradeCutoverLockIdentity;
	targetVersion: string;
	migrationImageId: string;
	capture: CaptureDocker;
	run: RunDocker;
	wait?: () => Promise<void>;
	maxAttempts?: number;
}): Promise<void> {
	const wait = input.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 250)));
	const maxAttempts = input.maxAttempts ?? (input.identity.lockRole === "source-runtime" ? 240 : 120);
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const metadata = await inspectContainer(input.identity.containerName, input.capture);
		if (!metadata) throw new Error("Database cutover lock container disappeared before becoming ready");
		assertOwnedMetadata({ ...input, metadata });
		const status = metadata.State?.Status?.trim().toLowerCase();
		const health = metadata.State?.Health?.Status?.trim().toLowerCase();
		if (status === "running" && health === "healthy") return;
		if (status === "exited" || status === "dead") {
			const exitCode = metadata.State?.ExitCode;
			await input.run(["container", "rm", input.identity.containerName]).catch(() => undefined);
			if (exitCode === UPGRADE_CUTOVER_LOCK_UNAVAILABLE_EXIT_CODE) {
				throw new Error("Another Elmo upgrade already owns this database's cutover lock");
			}
			throw new Error(`Database cutover lock exited before becoming ready (exit ${exitCode ?? "unknown"})`);
		}
		if (health === "unhealthy") {
			throw new Error("Database cutover lock failed its database health check");
		}
		await wait();
	}
	throw new Error("Timed out waiting for the database cutover lock");
}

export async function acquireUpgradeCutoverLock(input: {
	configDir: string;
	identity: UpgradeCutoverLockIdentity;
	targetVersion: string;
	migrationImageId: string;
	capture: CaptureDocker;
	run: RunDocker;
	runCompose: RunCompose;
	wait?: () => Promise<void>;
	maxAttempts?: number;
}): Promise<void> {
	let existing = await inspectContainer(input.identity.containerName, input.capture);
	if (existing) {
		assertOwnedMetadata({ ...input, metadata: existing });
		const status = existing.State?.Status?.trim().toLowerCase();
		if (status === "created" || status === "exited" || status === "dead") {
			await input.run(["container", "rm", input.identity.containerName]);
			existing = undefined;
		} else if (status !== "running" && status !== "restarting") {
			throw new Error(`Cannot recover database cutover lock in Docker state ${status ?? "unknown"}`);
		}
	}

	if (!existing) {
		await withCutoverLockOverride(input, async (withOverride) => {
			await input.runCompose(
				withOverride([
					"run",
					"--detach",
					"--name",
					input.identity.containerName,
					...Object.entries(expectedLabels(input.identity, input.targetVersion)).flatMap(([name, value]) => [
						"--label",
						`${name}=${value}`,
					]),
					"--pull",
					"never",
					"--no-TTY",
					UPGRADE_CUTOVER_LOCK_SERVICE_NAME,
				]),
			);
		});
	}

	await waitForReady(input);
}

export async function assertUpgradeCutoverLockOwned(input: {
	identity: UpgradeCutoverLockIdentity;
	targetVersion: string;
	migrationImageId: string;
	capture: CaptureDocker;
}): Promise<void> {
	const metadata = await inspectContainer(input.identity.containerName, input.capture);
	if (!metadata) throw new Error("Database cutover lock is missing; refusing to cross the deployment boundary");
	assertOwnedMetadata({ ...input, metadata });
	const status = metadata.State?.Status?.trim().toLowerCase();
	const health = metadata.State?.Health?.Status?.trim().toLowerCase();
	if (status !== "running" || health !== "healthy") {
		throw new Error(
			`Database cutover lock is ${status ?? "unknown"}/${health ?? "without health attestation"}; refusing to cross the deployment boundary`,
		);
	}
}

export async function releaseUpgradeCutoverLock(input: {
	identity: UpgradeCutoverLockIdentity;
	targetVersion: string;
	migrationImageId: string;
	capture: CaptureDocker;
	run: RunDocker;
	allowMissing?: boolean;
}): Promise<void> {
	let metadata = await inspectContainer(input.identity.containerName, input.capture);
	if (!metadata) {
		if (input.allowMissing) return;
		throw new Error("Database cutover lock disappeared before it could be released safely");
	}
	assertOwnedMetadata({ ...input, metadata });
	const status = metadata.State?.Status?.trim().toLowerCase();
	if (status === "running" || status === "restarting") {
		await assertUpgradeCutoverLockOwned(input);
		await input.run(["container", "stop", "--time", "30", input.identity.containerName]);
		metadata = await inspectContainer(input.identity.containerName, input.capture);
		if (!metadata) throw new Error("Database cutover lock disappeared while stopping");
		assertOwnedMetadata({ ...input, metadata });
	}
	const finalStatus = metadata.State?.Status?.trim().toLowerCase();
	if (finalStatus !== "exited" && finalStatus !== "dead") {
		throw new Error(`Database cutover lock remained ${finalStatus ?? "unknown"} while releasing`);
	}
	if (metadata.State?.ExitCode !== 0) {
		throw new Error(`Database cutover lock did not release cleanly (exit ${metadata.State?.ExitCode ?? "unknown"})`);
	}
	await input.run(["container", "rm", input.identity.containerName]);
}
