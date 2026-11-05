import { randomBytes } from "node:crypto";
import type { Migration } from "./types.js";

export * from "./planner.js";
export * from "./types.js";

// Only releases that change config or env on disk need an entry; images roll on
// `elmo upgrade` regardless. Each runs once, for upgrades through its `from` version.
export const MIGRATIONS: readonly Migration[] = [
	{
		// The last version without the key, so every existing install picks it up.
		from: "0.2.17",
		to: "0.2.18",
		description: "add ELMO_ENCRYPTION_KEY for encrypted in-app provider credentials",
		async run(ctx) {
			const env = await ctx.readEnv();
			if (env.ELMO_ENCRYPTION_KEY !== undefined) return;
			// Standard base64, not base64url: the app decodes exactly 32 bytes with Buffer.from(key, "base64").
			env.ELMO_ENCRYPTION_KEY = randomBytes(32).toString("base64");
			await ctx.writeEnv(env);
			ctx.log.info("Added ELMO_ENCRYPTION_KEY — lets you store provider credentials encrypted in the app.");
		},
	},
];
