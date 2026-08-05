import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parsePostgreSqlConnectionTarget } from "@workspace/config/database-url";
import { parse as parseDotenv } from "dotenv";

export interface UpgradeStoragePaths {
	configKey: string;
	databaseFingerprint: string;
	deploymentId: string;
	deploymentKey: string;
	lock: string;
	recovery: string;
}

function defaultUpgradeStorageRoot(): string {
	const xdgStateHome = process.env.XDG_STATE_HOME?.trim();
	const stateHome =
		xdgStateHome && path.isAbsolute(xdgStateHome) ? xdgStateHome : path.join(os.homedir(), ".local", "state");
	return path.join(stateHome, "elmo", "upgrades");
}

export async function deploymentUpgradeIdentity(configDir: string): Promise<{
	canonicalConfigDir: string;
	configKey: string;
	databaseFingerprint: string;
	deploymentId: string;
	deploymentKey: string;
}> {
	const canonicalConfigDir = await fs.realpath(configDir);
	const configKey = crypto.createHash("sha256").update(canonicalConfigDir).digest("hex");
	const env = parseDotenv(await fs.readFile(path.join(canonicalConfigDir, ".env"), "utf8"));
	const deploymentId = env.DEPLOYMENT_ID?.trim();
	if (!deploymentId || deploymentId.length > 256 || deploymentId.includes("\0")) {
		throw new Error("DEPLOYMENT_ID is required before an Elmo upgrade can be identified safely");
	}
	const databaseFingerprint = databaseConnectionIdentityFingerprint(env.DATABASE_URL, env.DATABASE_URL_UNPOOLED);
	return {
		canonicalConfigDir,
		configKey,
		databaseFingerprint,
		deploymentId,
		deploymentKey: crypto
			.createHash("sha256")
			.update(canonicalConfigDir)
			.update("\0")
			.update(deploymentId)
			.update("\0")
			.update(databaseFingerprint)
			.digest("hex"),
	};
}

export function databaseTargetFingerprint(databaseUrl: string | undefined, variableName = "DATABASE_URL"): string {
	const target = parsePostgreSqlConnectionTarget(databaseUrl, variableName);
	if (!databaseUrl) throw new Error(`${variableName} is required before an Elmo upgrade can be identified safely`);
	let parsed: URL;
	try {
		parsed = new URL(databaseUrl);
	} catch (error) {
		throw new Error(`${variableName} must be a valid PostgreSQL URL`, { cause: error });
	}
	if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
		throw new Error(`${variableName} must use the postgres or postgresql protocol`);
	}
	const nonCredentialParameters = [...parsed.searchParams.entries()]
		.filter(([name]) => !["password", "pass", "sslcert", "sslkey"].includes(name.toLowerCase()))
		.sort(([leftName, leftValue], [rightName, rightValue]) =>
			leftName === rightName ? leftValue.localeCompare(rightValue) : leftName.localeCompare(rightName),
		);
	const normalized = JSON.stringify({
		protocol: "postgresql:",
		hostname: target.host.toLowerCase(),
		port: target.port,
		pathname: target.database,
		username: target.user,
		parameters: nonCredentialParameters,
	});
	return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Binds recovery state and long-lived lock containers to both application and
 * session-affine connection endpoints without persisting either credential.
 */
export function databaseConnectionIdentityFingerprint(
	databaseUrl: string | undefined,
	unpooledDatabaseUrl: string | undefined,
): string {
	if (!unpooledDatabaseUrl) {
		throw new Error("DATABASE_URL_UNPOOLED is required before an Elmo upgrade can be identified safely");
	}
	return crypto
		.createHash("sha256")
		.update(databaseTargetFingerprint(databaseUrl))
		.update("\0")
		.update(databaseTargetFingerprint(unpooledDatabaseUrl, "DATABASE_URL_UNPOOLED"))
		.digest("hex");
}

export async function upgradeLockPath(configDir: string): Promise<string> {
	const canonicalConfigDir = await fs.realpath(configDir);
	return path.join(canonicalConfigDir, ".elmo-upgrade-in-progress.lock");
}

export async function upgradeRecoveryPath(
	configDir: string,
	storageRoot = defaultUpgradeStorageRoot(),
): Promise<string> {
	const canonicalConfigDir = await fs.realpath(configDir);
	const configKey = crypto.createHash("sha256").update(canonicalConfigDir).digest("hex");
	return path.join(storageRoot, `${configKey}.recovery.json`);
}

export async function deploymentUpgradeKey(configDir: string): Promise<string> {
	return (await deploymentUpgradeIdentity(configDir)).deploymentKey;
}

export async function upgradeStoragePaths(
	configDir: string,
	storageRoot = defaultUpgradeStorageRoot(),
): Promise<UpgradeStoragePaths> {
	const { canonicalConfigDir, configKey, databaseFingerprint, deploymentId, deploymentKey } =
		await deploymentUpgradeIdentity(configDir);
	return {
		configKey,
		databaseFingerprint,
		deploymentId,
		deploymentKey,
		lock: path.join(canonicalConfigDir, ".elmo-upgrade-in-progress.lock"),
		recovery: path.join(storageRoot, `${configKey}.recovery.json`),
	};
}

export async function ensurePrivateUpgradeStorage(storagePath: string): Promise<void> {
	const directory = path.dirname(storagePath);
	await fs.mkdir(directory, { recursive: true, mode: 0o700 });
	const metadata = await fs.lstat(directory);
	if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
		throw new Error(`Upgrade state directory must be a regular directory: ${directory}`);
	}
	await fs.chmod(directory, 0o700);
}
