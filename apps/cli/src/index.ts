#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { type AuditOptions, runAudit } from "./commands/audit.js";
import { registerBrainstorm } from "./commands/brainstorm.js";
import { runCompose } from "./commands/compose.js";
import { runEdit } from "./commands/edit.js";
import { registerEval } from "./commands/eval.js";
import { type InitOptions, runInit } from "./commands/init.js";
import { registerPlan } from "./commands/plan.js";
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

	const lab = program.command("lab").description("one-off AEO tools that don't need a running Elmo instance");
	registerBrainstorm(lab);
	registerEval(lab);
	registerPlan(lab);

	lab
		.command("audit")
		.description("check how well AI agents can reach, read, and understand a website")
		.argument("<url>", "the site to audit, e.g. example.com")
		.option("--domain <domain...>", "other domains the brand uses, checked as aliases or sites")
		.option("--pages <n>", "pages to sample per site, including the homepage", "10")
		.option("--delay <ms>", "minimum milliseconds between requests to a site", "1000")
		.option("--max-requests <n>", "total request budget", "75")
		.option("--format <format>", "text or json", "text")
		.option("--fail-under <score>", "exit with status 1 when the overall score is below this")
		.action(async (url: string, opts: AuditOptions) => {
			await withVersionCheck(version, () => runAudit(url, opts));
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
