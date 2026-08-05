import fs from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";

export type RunCompose = (args: string[]) => Promise<void>;

type ComposeBuild = string | Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveDevelopmentMigrationBuild(composeContents: string): Record<string, unknown> {
	const document: unknown = parse(composeContents);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error("Development compose file does not define services");
	}

	for (const serviceName of ["web", "worker", "db-migrate"]) {
		const service = document.services[serviceName];
		if (!isRecord(service)) continue;
		const build = service.build as ComposeBuild | undefined;
		if (typeof build === "string") return { context: build, target: "migrate" };
		if (isRecord(build)) return { ...build, target: "migrate" };
	}

	throw new Error("Development compose file does not contain a reusable build context");
}

export function buildUpgradeMigrationOverride(
	input: { dev: false; version: string } | { dev: true; version: string; developmentBuild: Record<string, unknown> },
): string {
	const service: Record<string, unknown> = input.dev
		? { build: input.developmentBuild }
		: { image: `elmohq/elmo-db-migrate:${input.version}` };
	service.restart = "no";
	service.environment = { DATABASE_URL: `\${DATABASE_URL:?DATABASE_URL is required}` };
	return stringify({ services: { "db-migrate": service } });
}

/** Runs the target release's migrations without changing the persisted compose file. */
export async function runTargetDatabaseMigration(input: {
	configDir: string;
	dev: boolean;
	version: string;
	wasRunning: boolean;
	imagePrepared?: boolean;
	runCompose: RunCompose;
}): Promise<void> {
	const overridePath = path.join(input.configDir, ".elmo-upgrade-migrate.yaml");
	const override = input.dev
		? buildUpgradeMigrationOverride({
				dev: true,
				version: input.version,
				developmentBuild: resolveDevelopmentMigrationBuild(
					await fs.readFile(path.join(input.configDir, "elmo.yaml"), "utf8"),
				),
			})
		: buildUpgradeMigrationOverride({ dev: false, version: input.version });
	await fs.writeFile(overridePath, override, {
		encoding: "utf8",
		mode: 0o600,
	});
	const withOverride = (args: string[]) => ["-f", overridePath, ...args];

	try {
		if (input.dev) await input.runCompose(withOverride(["build", "db-migrate"]));
		await input.runCompose(
			withOverride([
				"run",
				"--rm",
				...(input.dev ? [] : ["--pull", input.imagePrepared ? "never" : "always"]),
				"--no-TTY",
				"db-migrate",
			]),
		);
	} catch (error) {
		if (!input.wasRunning) {
			await input.runCompose(withOverride(["down"])).catch(() => undefined);
		}
		throw error;
	} finally {
		await fs.rm(overridePath, { force: true });
	}

	if (!input.wasRunning) await input.runCompose(["down"]);
}
