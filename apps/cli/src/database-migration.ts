import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { syncDirectory, writeNewTextFileDurably } from "./atomic-file.js";
import { databaseUtilityConnectivity } from "./database-compose-connectivity.js";
import {
	createUpgradeMigratorIdentity,
	UPGRADE_MIGRATOR_DEPLOYMENT_LABEL,
	UPGRADE_MIGRATOR_MARKER_LABEL,
	UPGRADE_MIGRATOR_TARGET_LABEL,
	type UpgradeMigratorIdentity,
} from "./database-migration-recovery.js";

export type RunCompose = (args: string[]) => Promise<void>;
export const UPGRADE_MIGRATOR_SERVICE_NAME = "elmo-upgrade-db-migrate";

type ComposeBuild = string | Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function usesDevelopmentElmoBuild(composeContents: string): boolean {
	const document: unknown = parse(composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Compose file does not define services");
	}
	const services = document.services;

	const modes = ["web", "worker", "db-migrate"].flatMap((serviceName) => {
		const service = services[serviceName];
		if (!isRecord(service)) return [];
		if (service.build !== undefined && service.image !== undefined) {
			throw new Error(`Elmo Compose service ${serviceName} cannot define both build and image`);
		}
		if (service.build !== undefined) return ["build" as const];
		if (typeof service.image === "string") return ["image" as const];
		throw new Error(`Elmo Compose service ${serviceName} defines neither build nor image`);
	});
	if (modes.includes("build") && modes.includes("image")) {
		throw new Error("Elmo Compose services cannot mix local builds and published images during upgrade");
	}
	return modes.includes("build");
}

export function developmentElmoBuildServiceNames(composeContents: string): string[] {
	const document: unknown = parse(composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Compose file does not define services");
	}
	const services = document.services;
	return ["web", "worker", "db-migrate"].filter((serviceName) => {
		const service = services[serviceName];
		return isRecord(service) && service.build !== undefined;
	});
}

export function resolveDevelopmentMigrationBuild(composeContents: string): Record<string, unknown> {
	const document: unknown = parse(composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Development compose file does not define services");
	}

	for (const serviceName of ["db-migrate", "web", "worker"]) {
		const service = document.services[serviceName];
		if (!isRecord(service)) continue;
		const build = service.build as ComposeBuild | undefined;
		if (typeof build === "string") return { context: build, target: "migrate" };
		if (isRecord(build)) return { ...build, target: "migrate" };
	}

	throw new Error("Development compose file does not contain a reusable build context");
}

async function withMigrationOverride<T>(
	input: { configDir: string; dev: boolean; version: string; migrationImage?: string },
	action: (withOverride: (args: string[]) => string[]) => Promise<T>,
): Promise<T> {
	const overridePath = path.join(input.configDir, `.elmo-upgrade-migrate-${randomUUID()}.yaml`);
	const composeContents = await fs.readFile(path.join(input.configDir, "elmo.yaml"), "utf8");
	const composeDocument: unknown = parse(composeContents);
	if (!isRecord(composeDocument) || !isRecord(composeDocument.services)) {
		throw new Error("Compose file does not define services");
	}
	const managedPostgres = isRecord(composeDocument.services.postgres);
	const connectivity = databaseUtilityConnectivity(composeContents);
	const override = input.migrationImage
		? buildUpgradeMigrationOverride({
				dev: false,
				version: input.version,
				migrationImage: input.migrationImage,
				managedPostgres,
				connectivity,
			})
		: input.dev
			? buildUpgradeMigrationOverride({
					dev: true,
					version: input.version,
					developmentBuild: resolveDevelopmentMigrationBuild(composeContents),
					managedPostgres,
					connectivity,
				})
			: buildUpgradeMigrationOverride({
					dev: false,
					version: input.version,
					migrationImage:
						input.migrationImage ??
						(() => {
							throw new Error("Image deployment upgrade requires an explicit target migrator image");
						})(),
					managedPostgres,
					connectivity,
				});
	await writeNewTextFileDurably(overridePath, override, 0o600);
	try {
		return await action((args) => ["-f", overridePath, ...args]);
	} finally {
		await fs.rm(overridePath, { force: true });
		await syncDirectory(input.configDir);
	}
}

export async function prepareTargetDevelopmentMigrationImage(input: {
	configDir: string;
	version: string;
	captureCompose: (args: string[]) => Promise<string>;
	runCompose: RunCompose;
}): Promise<string> {
	return withMigrationOverride({ ...input, dev: true }, async (withOverride) => {
		await input.runCompose(
			withOverride(["build", "--build-arg", `ELMO_RELEASE_VERSION=${input.version}`, UPGRADE_MIGRATOR_SERVICE_NAME]),
		);
		return input.captureCompose(withOverride(["config", "--images", UPGRADE_MIGRATOR_SERVICE_NAME]));
	});
}

export function buildUpgradeMigrationOverride(
	input:
		| {
				dev: false;
				version: string;
				migrationImage: string;
				managedPostgres?: boolean;
				connectivity?: Record<string, unknown>;
		  }
		| {
				dev: true;
				version: string;
				developmentBuild: Record<string, unknown>;
				managedPostgres?: boolean;
				connectivity?: Record<string, unknown>;
		  },
): string {
	const service: Record<string, unknown> = {
		...input.connectivity,
		...(input.dev ? { build: input.developmentBuild } : { image: input.migrationImage }),
	};
	service.restart = "no";
	if (input.dev) service.pull_policy = "never";
	service.environment = {
		DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}`,
		DATABASE_URL_UNPOOLED: `\${DATABASE_URL_UNPOOLED:?DATABASE_URL_UNPOOLED is required}`,
	};
	if (input.managedPostgres) {
		service.depends_on = {
			...(isRecord(service.depends_on) ? service.depends_on : {}),
			postgres: { condition: "service_healthy" },
		};
	}
	return stringify({ services: { [UPGRADE_MIGRATOR_SERVICE_NAME]: service } });
}

/** Runs the target release's migrations without changing the persisted compose file. */
export async function runTargetDatabaseMigration(input: {
	configDir: string;
	dev: boolean;
	version: string;
	migrationImage?: string;
	wasRunning: boolean;
	preserveDependencies?: boolean;
	imagePrepared?: boolean;
	recoverExistingMigration?: (identity: UpgradeMigratorIdentity) => Promise<boolean>;
	runCompose: RunCompose;
}): Promise<void> {
	const identity = await createUpgradeMigratorIdentity(input.configDir);
	if (input.dev && input.imagePrepared && !input.migrationImage) {
		throw new Error("Prepared development migration requires its attested image ID");
	}
	await withMigrationOverride(input, async (withOverride) => {
		try {
			const recovered = (await input.recoverExistingMigration?.(identity)) ?? false;
			if (!recovered) {
				if (input.dev && !input.imagePrepared) {
					await input.runCompose(withOverride(["build", UPGRADE_MIGRATOR_SERVICE_NAME]));
				}
				await input.runCompose(
					withOverride([
						"run",
						"--name",
						identity.containerName,
						"--label",
						`${UPGRADE_MIGRATOR_MARKER_LABEL}=true`,
						"--label",
						`${UPGRADE_MIGRATOR_DEPLOYMENT_LABEL}=${identity.deploymentKey}`,
						"--label",
						`${UPGRADE_MIGRATOR_TARGET_LABEL}=${input.version}`,
						"--rm",
						"--pull",
						input.dev ? "never" : input.imagePrepared ? "never" : "always",
						"--no-TTY",
						UPGRADE_MIGRATOR_SERVICE_NAME,
					]),
				);
			}
		} catch (error) {
			if (!input.wasRunning && !input.preserveDependencies) {
				await input.runCompose(withOverride(["stop", "--timeout", "3900"])).catch(() => undefined);
			}
			throw error;
		}
	});

	if (!input.wasRunning && !input.preserveDependencies) {
		await input.runCompose(["stop", "--timeout", "3900"]);
	}
}
