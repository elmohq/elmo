import fs from "node:fs/promises";
import path from "node:path";

export type RunCompose = (args: string[]) => Promise<void>;

export function buildUpgradeMigrationOverride(input: { dev: boolean; version: string }): string {
	const lines = ["services:", "  db-migrate:"];
	if (!input.dev) lines.push(`    image: elmohq/elmo-db-migrate:${input.version}`);
	lines.push(
		'    restart: "no"',
		"    environment:",
		'      DATABASE_URL: "${DATABASE_URL:?DATABASE_URL is required}"',
	);
	return `${lines.join("\n")}\n`;
}

/** Runs the target release's migrations without changing the persisted compose file. */
export async function runTargetDatabaseMigration(input: {
	configDir: string;
	dev: boolean;
	version: string;
	wasRunning: boolean;
	runCompose: RunCompose;
}): Promise<void> {
	const overridePath = path.join(input.configDir, ".elmo-upgrade-migrate.yaml");
	await fs.writeFile(overridePath, buildUpgradeMigrationOverride(input), { encoding: "utf8", mode: 0o600 });
	const withOverride = (args: string[]) => ["-f", overridePath, ...args];

	try {
		if (input.dev) await input.runCompose(withOverride(["build", "db-migrate"]));
		await input.runCompose(
			withOverride([
				"run",
				"--rm",
				...(input.dev ? [] : ["--pull", "always"]),
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
