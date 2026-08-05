import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { writeTextFileAtomically } from "./atomic-file.js";
import { refreshHeaderVersion, repinImages } from "./compose-pin.js";

export interface ConfigFileSnapshot {
	contents: string;
	mode: number;
}

export interface DeploymentConfigSnapshot {
	compose: ConfigFileSnapshot;
	env: ConfigFileSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
): Promise<void> {
	const currentEnv = await readConfigFile(path.join(configDir, ".env"));
	await writeTextFileAtomically(
		path.join(configDir, ".env"),
		refreshHeaderVersion(currentEnv.contents, version),
		currentEnv.mode,
	);
	await writeTextFileAtomically(
		path.join(configDir, "elmo.yaml"),
		refreshHeaderVersion(repinImages(previous.compose.contents, version), version),
		previous.compose.mode,
	);
}

export async function restoreDeploymentConfig(configDir: string, previous: DeploymentConfigSnapshot): Promise<void> {
	await writeTextFileAtomically(path.join(configDir, "elmo.yaml"), previous.compose.contents, previous.compose.mode);
	await writeTextFileAtomically(path.join(configDir, ".env"), previous.env.contents, previous.env.mode);
}

export function getTargetElmoImages(composeContents: string, version: string): string[] {
	const document: unknown = parse(composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Compose file does not define services");
	}

	const images = new Set<string>();
	for (const service of Object.values(document.services)) {
		if (!isRecord(service) || typeof service.image !== "string") continue;
		const match = service.image.match(/^(elmohq\/elmo-[a-z-]+)(?::[^@\s]+|@\S+)?$/u);
		if (match?.[1]) images.add(`${match[1]}:${version}`);
	}
	images.add(`elmohq/elmo-db-migrate:${version}`);
	return [...images].sort();
}
