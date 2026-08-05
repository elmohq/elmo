import fs from "node:fs/promises";
import path from "node:path";
import { writeTextFileAtomically } from "./atomic-file.js";
import { enforceRuntimeDrainContract, planImageRelease, refreshHeaderVersion } from "./compose-pin.js";

export interface ConfigFileSnapshot {
	contents: string;
	mode: number;
}

export interface DeploymentConfigSnapshot {
	compose: ConfigFileSnapshot;
	env: ConfigFileSnapshot;
}

async function readConfigFile(filePath: string): Promise<ConfigFileSnapshot> {
	const stats = await fs.lstat(filePath);
	if (stats.isSymbolicLink()) {
		throw new Error(`Refusing to upgrade symbolic link ${filePath}; update its managed target directly`);
	}
	if (!stats.isFile()) throw new Error(`Deployment config ${filePath} is not a regular file`);
	const contents = await fs.readFile(filePath, "utf8");
	return { contents, mode: stats.mode & 0o777 };
}

export async function captureDeploymentConfig(configDir: string): Promise<DeploymentConfigSnapshot> {
	const [compose, env] = await Promise.all([
		readConfigFile(path.join(configDir, "elmo.yaml")),
		readConfigFile(path.join(configDir, ".env")),
	]);
	return { compose, env };
}

export async function applyDeploymentRelease(
	configDir: string,
	previous: DeploymentConfigSnapshot,
	version: string,
	targetComposeContents = previous.compose.contents,
): Promise<void> {
	const currentEnv = await readConfigFile(path.join(configDir, ".env"));
	await writeTextFileAtomically(
		path.join(configDir, ".env"),
		refreshHeaderVersion(currentEnv.contents, version),
		currentEnv.mode,
	);
	await writeTextFileAtomically(
		path.join(configDir, "elmo.yaml"),
		refreshHeaderVersion(enforceRuntimeDrainContract(targetComposeContents), version),
		previous.compose.mode,
	);
}

export async function restoreDeploymentConfig(configDir: string, previous: DeploymentConfigSnapshot): Promise<void> {
	await writeTextFileAtomically(path.join(configDir, "elmo.yaml"), previous.compose.contents, previous.compose.mode);
	await writeTextFileAtomically(path.join(configDir, ".env"), previous.env.contents, previous.env.mode);
}

export function getTargetElmoImages(composeContents: string, version: string): string[] {
	return Object.values(planImageRelease(composeContents, version).images).sort();
}
