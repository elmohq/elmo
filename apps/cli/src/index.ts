#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { registerBrainstorm } from "./commands/brainstorm.js";
import { registerEval } from "./commands/eval.js";
import { registerPlan } from "./commands/plan.js";
import { printBanner } from "./core/ui.js";
import { getPackageVersion } from "./core/version.js";
import { registerDeployCommands } from "./deploy.js";

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

	// ── Deploy: stand up / manage a self-hosted instance ─────────────────────
	registerDeployCommands(program, version);

	// ── Lab: one-off AEO runs against your configured providers ──────────────
	// Registered in the order you'd actually run them: brainstorm → eval → plan.
	const lab = program
		.command("lab")
		.description("one-off AEO runs (brainstorm prompts, eval them, plan improvements)")
		.action(() => {
			lab.outputHelp();
		});
	registerBrainstorm(lab);
	registerEval(lab);
	registerPlan(lab);

	await program.parseAsync(process.argv);
}

main().catch((error) => {
	const msg = error instanceof Error ? error.message : String(error);
	console.error(`\n${pc.red("Error:")} ${msg}`);
	process.exit(1);
});
