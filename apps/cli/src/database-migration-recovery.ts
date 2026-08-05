import { deploymentUpgradeKey } from "./upgrade-storage.js";

export const UPGRADE_MIGRATOR_MARKER_LABEL = "com.elmohq.elmo.upgrade-migrator";
export const UPGRADE_MIGRATOR_TARGET_LABEL = "com.elmohq.elmo.upgrade-target";
export const UPGRADE_MIGRATOR_DEPLOYMENT_LABEL = "com.elmohq.elmo.upgrade-deployment";

export interface UpgradeMigratorIdentity {
	containerName: string;
	deploymentKey: string;
}

type CaptureDocker = (args: string[]) => Promise<string>;
type RunDocker = (args: string[]) => Promise<void>;

interface ContainerInspect {
	Config?: { Labels?: Record<string, string> };
	Image?: string;
	Name?: string;
	State?: { ExitCode?: number; Status?: string };
}

function isMissingContainer(error: unknown): boolean {
	return error instanceof Error && /no such (?:object|container)/i.test(error.message);
}

function parseInspect(output: string): ContainerInspect {
	const parsed: unknown = JSON.parse(output);
	if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0] !== "object" || parsed[0] === null) {
		throw new Error("Docker returned invalid upgrade migrator metadata");
	}
	return parsed[0] as ContainerInspect;
}

export async function createUpgradeMigratorIdentity(configDir: string): Promise<UpgradeMigratorIdentity> {
	const deploymentKey = await deploymentUpgradeKey(configDir);
	return {
		containerName: `elmo-upgrade-db-migrate-${deploymentKey.slice(0, 20)}`,
		deploymentKey,
	};
}

export async function assertNoConflictingUpgradeMigrators(input: {
	identity: UpgradeMigratorIdentity;
	allowCurrent: boolean;
	capture: CaptureDocker;
}): Promise<void> {
	const output = await input.capture([
		"container",
		"ls",
		"--filter",
		`label=${UPGRADE_MIGRATOR_MARKER_LABEL}=true`,
		"--format",
		"{{.Names}}",
	]);
	const names = output
		.split("\n")
		.map((name) => name.trim())
		.filter(Boolean);
	const conflicting = names.find((name) => name !== input.identity.containerName);
	if (conflicting) {
		throw new Error(`Another Elmo database upgrade is active in ${conflicting}; wait for it to finish and retry`);
	}
	if (names.includes(input.identity.containerName) && !input.allowCurrent) {
		throw new Error(
			`An unexpected database upgrade container ${input.identity.containerName} is active; wait for it to finish and retry`,
		);
	}
}

export async function recoverExistingUpgradeMigrator(input: {
	identity: UpgradeMigratorIdentity;
	expectedImageId: string;
	targetVersion: string;
	capture: CaptureDocker;
	run: RunDocker;
}): Promise<boolean> {
	let metadata: ContainerInspect;
	try {
		metadata = parseInspect(await input.capture(["container", "inspect", input.identity.containerName]));
	} catch (error) {
		if (isMissingContainer(error)) return false;
		throw error;
	}

	const labels = metadata.Config?.Labels;
	if (
		labels?.[UPGRADE_MIGRATOR_MARKER_LABEL] !== "true" ||
		labels[UPGRADE_MIGRATOR_DEPLOYMENT_LABEL] !== input.identity.deploymentKey ||
		labels[UPGRADE_MIGRATOR_TARGET_LABEL] !== input.targetVersion
	) {
		throw new Error(`Container ${input.identity.containerName} is not the fenced migrator for this deployment`);
	}
	if (metadata.Image !== input.expectedImageId) {
		throw new Error(
			`Container ${input.identity.containerName} does not use checkpointed migrator image ${input.expectedImageId}`,
		);
	}

	const status = metadata.State?.Status?.toLowerCase();
	if (status === "created") {
		await input.run(["container", "rm", input.identity.containerName]);
		return false;
	}

	let exitCode: number | undefined;
	if (status === "running" || status === "restarting") {
		let waitOutput: string;
		try {
			waitOutput = await input.capture(["container", "wait", input.identity.containerName]);
		} catch (error) {
			if (isMissingContainer(error)) return false;
			throw error;
		}
		exitCode = Number.parseInt(waitOutput.trim(), 10);
	} else if (status === "exited" || status === "dead") {
		exitCode = metadata.State?.ExitCode;
	} else {
		throw new Error(`Cannot recover upgrade migrator in Docker state ${status ?? "unknown"}`);
	}

	if (!Number.isInteger(exitCode)) {
		throw new Error("Docker returned an invalid upgrade migrator exit code");
	}
	await input.run(["container", "rm", input.identity.containerName]).catch(() => undefined);
	if (exitCode !== 0) {
		throw new Error(`Upgrade migrator exited with code ${exitCode}`);
	}
	return true;
}
