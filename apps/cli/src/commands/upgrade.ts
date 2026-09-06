import fs from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";
import { parse as parseDotenv } from "dotenv";
import pc from "picocolors";
import semver from "semver";
import { refreshRenderedVersion, repinComposeImages } from "../compose.js";
import { buildEnvFile, readRenderedVersion, resolveConfigDir } from "../config.js";
import {
	assertDockerRunning,
	composeUsesBuild,
	runDockerCompose,
	stackHasRunningServices,
	waitForHealthy,
} from "../docker.js";
import { MIGRATIONS, type MigrationContext, planMigrations, runMigrations } from "../migrations/index.js";
import { trackCliEvent } from "../telemetry.js";
import { assertNotCancelled, log, printBanner } from "../util.js";
import { fetchLatestCliVersion } from "../version.js";

export type UpgradeOptions = {
	dir?: string;
	yes?: boolean;
};

async function confirmStaleCli(cliVersion: string, assumeYes: boolean | undefined): Promise<void> {
	const latestCli = await fetchLatestCliVersion();
	if (!latestCli || !semver.valid(cliVersion) || !semver.lt(cliVersion, latestCli)) return;

	log.warn(`Your CLI (${cliVersion}) is behind the latest published version (${latestCli}).`);
	log.info("Recommended: upgrade the CLI first, then rerun this command:");
	console.log(`  ${pc.bold("npm install -g @elmohq/cli@latest")}`);
	const proceed = assumeYes
		? true
		: await p.confirm({
				message: `Continue upgrading the stack with CLI ${cliVersion} anyway?`,
				initialValue: false,
			});
	assertNotCancelled(proceed);
	if (!proceed) {
		p.cancel("Upgrade cancelled. Upgrade the CLI and rerun `elmo upgrade`.");
		process.exit(0);
	}
}

async function pullAtCurrentVersion(configDir: string, cliVersion: string, assumeYes: boolean | undefined) {
	log.success(`Already at ${cliVersion}.`);
	const pull = assumeYes
		? true
		: await p.confirm({ message: "Pull images for this version anyway?", initialValue: false });
	assertNotCancelled(pull);

	if (pull) {
		assertDockerRunning();
		const wasRunning = await stackHasRunningServices(configDir);
		log.step("Pulling images...");
		await runDockerCompose(configDir, ["pull"]);
		if (wasRunning) {
			log.step("Restarting services...");
			await runDockerCompose(configDir, ["up", "-d"]);
		}
	}
	p.outro(pc.green("Nothing to upgrade."));
}

/**
 * With no detected version we can't tell which migrations apply, so we skip
 * them and just re-pin + pull. (planMigrations would also return [] here since
 * from === to, but it is special-cased for a clearer message.)
 */
function planUpgradeMigrations(detectedVersion: string | null, fromVersion: string, cliVersion: string) {
	const plan = detectedVersion === null ? [] : planMigrations(fromVersion, cliVersion, MIGRATIONS);
	if (detectedVersion === null) {
		log.warn(`Couldn't detect the deployment's version — re-pinning images to ${pc.cyan(cliVersion)}.`);
	} else {
		log.info(`Upgrading from ${pc.cyan(fromVersion)} → ${pc.cyan(cliVersion)}`);
	}

	if (plan.length === 0) {
		log.step("No migrations to run (docker images will be re-pinned and pulled).");
		return plan;
	}
	log.step(`Migrations to apply: ${plan.length}`);
	for (const migration of plan) {
		console.log(`  • ${pc.bold(`${migration.from} → ${migration.to}`)} ${migration.description}`);
	}
	return plan;
}

async function applyUpgradeMigrations(
	plan: Awaited<ReturnType<typeof planUpgradeMigrations>>,
	ctx: MigrationContext,
	wasRunning: boolean,
): Promise<void> {
	try {
		await runMigrations(plan, ctx);
	} catch (error) {
		log.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
		log.info("Your config version was left unchanged. Fix the issue and rerun `elmo upgrade`.");
		if (wasRunning) {
			log.info("The stack was stopped for the upgrade. Restart with `elmo compose up -d` after fixing.");
		}
		process.exit(1);
	}
}

async function restartAfterUpgrade(configDir: string, wasRunning: boolean): Promise<void> {
	if (!wasRunning) {
		log.info("Stack was stopped before upgrade — leaving it stopped. Start with `elmo compose up -d`.");
		return;
	}
	log.step("Starting services...");
	await runDockerCompose(configDir, ["up", "-d"]);
	const spinner = p.spinner();
	spinner.start("Waiting for services to become healthy...");
	if (await waitForHealthy(configDir, 180_000)) {
		spinner.stop("All services healthy!");
		return;
	}
	spinner.stop("Health check timed out.");
	log.warn("Some services did not report healthy status.");
}
export async function runUpgrade(options: UpgradeOptions, cliVersion: string): Promise<void> {
	printBanner();
	p.intro(pc.bold("Upgrading Elmo"));

	await confirmStaleCli(cliVersion, options.yes);

	// ── Resolve config + the version it was last rendered with ───────────
	const configDir = await resolveConfigDir(options.dir);
	const composePath = path.join(configDir, "elmo.yaml");
	const detectedVersion = await readRenderedVersion(composePath);
	const fromVersion = detectedVersion ?? cliVersion;
	if (!semver.valid(fromVersion)) {
		throw new Error(`Could not determine the installed version from ${composePath}.`);
	}

	if (semver.gt(fromVersion, cliVersion)) {
		log.warn(`Your deployment (${fromVersion}) is newer than this CLI (${cliVersion}).`);
		log.info("Upgrade the CLI to match, then rerun:");
		console.log(`  ${pc.bold("npm install -g @elmohq/cli@latest")}`);
		process.exit(1);
	}

	// Only a *detected* matching version is "nothing to do". A legacy install
	// with no version header (detectedVersion === null) still needs its image
	// tags re-pinned, so it falls through to the upgrade path below.
	if (detectedVersion !== null && semver.eq(detectedVersion, cliVersion)) {
		await pullAtCurrentVersion(configDir, cliVersion, options.yes);
		return;
	}

	const plan = planUpgradeMigrations(detectedVersion, fromVersion, cliVersion);

	const confirm = options.yes ? true : await p.confirm({ message: "Proceed with upgrade?", initialValue: true });
	assertNotCancelled(confirm);
	if (!confirm) {
		p.cancel("Upgrade cancelled.");
		process.exit(0);
	}

	// ── Stop the stack so migrations + image swap run on a quiet deployment ─
	assertDockerRunning();
	const wasRunning = await stackHasRunningServices(configDir);
	if (wasRunning) {
		log.step("Stopping services...");
		await runDockerCompose(configDir, ["down"]);
	}

	// ── Run migrations ───────────────────────────────────────────────────
	await applyUpgradeMigrations(plan, buildMigrationContext(configDir, cliVersion), wasRunning);

	// ── Re-pin image tags + refresh the version recorded in the config ───
	const isDev = await composeUsesBuild(composePath);
	await repinComposeImages(composePath, cliVersion);
	await refreshRenderedVersion(path.join(configDir, ".env"), cliVersion);
	log.success(`Pinned config to ${cliVersion}.`);

	// ── Pull new images (dev builds from source, so nothing to pull) ─────
	if (isDev) {
		log.info("Dev mode detected — rebuild with `elmo compose build` to apply the new version.");
	} else {
		log.step("Pulling images...");
		await runDockerCompose(configDir, ["pull"]);
	}

	// ── Restart only if the stack was running before the upgrade ─────────
	await restartAfterUpgrade(configDir, wasRunning);

	await trackCliEvent(configDir, "cli_upgrade", {
		from_version: fromVersion,
		to_version: cliVersion,
		migrations_run: plan.length,
		was_running: wasRunning,
		dev_mode: isDev,
	});

	p.outro(pc.green(`Upgraded to ${cliVersion}.`));
}

function buildMigrationContext(configDir: string, version: string): MigrationContext {
	const envPath = path.join(configDir, ".env");
	return {
		configDir,
		log: {
			info: (msg) => log.info(msg),
			warn: (msg) => log.warn(msg),
			step: (msg) => log.step(msg),
		},
		readEnv: async () => {
			try {
				return parseDotenv(await fs.readFile(envPath, "utf8"));
			} catch {
				return {};
			}
		},
		writeEnv: async (env) => {
			await fs.writeFile(envPath, buildEnvFile(env, version), "utf8");
		},
	};
}
