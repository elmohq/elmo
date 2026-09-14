#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { runCompose } from "./commands/compose.js";
import { runEdit } from "./commands/edit.js";
import { type InitOptions, runInit } from "./commands/init.js";
import { runUpgrade, type UpgradeOptions } from "./commands/upgrade.js";
import type { DirOption } from "./config.js";
import { printBanner } from "./util.js";
import { getPackageVersion, maybeNotifyNewVersion } from "./version.js";

async function main() {
	const version = await getPackageVersion();
	const program = new Command();

	program
		.name("elmo")
		.version(version)
		.option("--dir <path>", "Config directory")
		.configureHelp({ showGlobalOptions: true })
		.action(() => {
			printBanner();
			program.outputHelp();
		});

	program
		.command("init")
		.description("set up local Elmo instance")
		.option("--dev", "Use local build context (repo only)")
		.option("--docker-dir <path>", "Path to Docker build context (dev mode)")
		.action(async (_opts: object, cmd: Command) => {
			await withVersionCheck(version, () => runInit(cmd.optsWithGlobals<InitOptions>(), version));
		});

	program
		.command("compose")
		.description("run Docker Compose commands using your Elmo config")
		.allowUnknownOption(true)
		.argument("[args...]", "Arguments passed to Docker Compose")
		.action(async (args: string[], _opts: object, cmd: Command) => {
			await withVersionCheck(version, () => runCompose(args, cmd.optsWithGlobals<DirOption>()));
		});

	program
		.command("edit")
		.description("change API keys, scrape targets, or the Docker Compose YAML")
		.argument("<env|compose>", "which config file to edit")
		.action(async (target: string, _opts: object, cmd: Command) => {
			await runEdit(target, cmd.optsWithGlobals<DirOption>());
		});

	program
		.command("upgrade")
		.description("upgrade your Elmo deployment to this CLI's version")
		.option("--yes", "skip confirmation prompts")
		.action(async (_opts: object, cmd: Command) => {
			await runUpgrade(cmd.optsWithGlobals<UpgradeOptions>(), version);
		});

	await program.parseAsync(process.argv);
}

async function withVersionCheck(version: string, fn: () => Promise<void>): Promise<void> {
	const notifyPromise = maybeNotifyNewVersion(version);
	await fn();
	await notifyPromise.catch(() => undefined);
}

main().catch((error) => {
	const msg = error instanceof Error ? error.message : String(error);
	console.error(`\n${pc.red("Error:")} ${msg}`);
	process.exit(1);
});
