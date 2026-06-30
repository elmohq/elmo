import type { Migration } from "./types.js";

export * from "./planner.js";
export * from "./types.js";

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
//     if (env.FOO_KEY && !env.BAR_KEY) {
//       env.BAR_KEY = env.FOO_KEY;
//       delete env.FOO_KEY;
//       await ctx.writeEnv(env);
//     }
//   },
// }
export const MIGRATIONS: readonly Migration[] = [];
