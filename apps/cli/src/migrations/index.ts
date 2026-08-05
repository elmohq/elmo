import { randomBytes } from "node:crypto";
import type { Migration, MigrationContext } from "./types.js";

export * from "./planner.js";
export * from "./types.js";

export async function reconcileCurrentConfig(ctx: MigrationContext): Promise<void> {
	const env = await ctx.readEnv();
	if (env.DEPLOYMENT_MODE !== "local" || env.ELMO_ENCRYPTION_KEY?.trim()) return;

	await ctx.setEnv("ELMO_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
	ctx.log.info("Added ELMO_ENCRYPTION_KEY — lets you store provider credentials encrypted in the app.");
}

// Register migrations here when a release needs to change config/env on disk.
// Most releases need NO entry — docker images roll automatically on `elmo upgrade`.
//
// Each entry runs once when a user upgrades through its `from` version. Keep the
// `run` function pure over the passed-in context so it stays unit-testable.
//
// Example:
// {
//   from: "0.3.0",
//   to: "0.4.0",
//   description: "Rename FOO_KEY → BAR_KEY",
//   async run(ctx) {
//     const env = await ctx.readEnv();
//     if (env.FOO_KEY && !env.BAR_KEY) await ctx.setEnv("BAR_KEY", env.FOO_KEY);
//   },
// }
export const MIGRATIONS: readonly Migration[] = [
	{
		// Keyed to the last published version without the key (0.2.17) so every
		// existing install picks it up on its next upgrade; the planner fires a
		// `from` entry when the deployment's version is at or below it.
		from: "0.2.17",
		to: "0.2.18",
		description: "add ELMO_ENCRYPTION_KEY for encrypted in-app provider credentials",
		requiresMaintenance: true,
		run: reconcileCurrentConfig,
	},
];
