import { describe, expect, it } from "vitest";
import type { Migration, MigrationContext } from "./types.js";

// Template for testing a real migration: build an in-memory context, run the
// migration's `run` against it, and assert on the resulting env. Copy this when
// you add a migration to MIGRATIONS.

function inMemoryContext(initial: Record<string, string> = {}): MigrationContext & {
	env: () => Record<string, string>;
} {
	let env: Record<string, string> = { ...initial };
	return {
		configDir: "/fake",
		log: { info: () => {}, warn: () => {}, step: () => {} },
		readEnv: async () => ({ ...env }),
		writeEnv: async (next) => {
			env = { ...next };
		},
		env: () => ({ ...env }),
	};
}

describe("example: env-rename migration", () => {
	const renameMigration: Migration = {
		from: "0.3.0",
		to: "0.4.0",
		description: "Rename FOO_KEY → BAR_KEY",
		async run(ctx) {
			const env = await ctx.readEnv();
			if (env.FOO_KEY === undefined || env.BAR_KEY !== undefined) return;
			env.BAR_KEY = env.FOO_KEY;
			delete env.FOO_KEY;
			await ctx.writeEnv(env);
		},
	};

	it("renames the key when only the old one is set", async () => {
		const ctx = inMemoryContext({ FOO_KEY: "value", OTHER: "keep" });
		await renameMigration.run(ctx);
		expect(ctx.env()).toEqual({ BAR_KEY: "value", OTHER: "keep" });
	});

	it("is a no-op when the new key already exists", async () => {
		const ctx = inMemoryContext({ FOO_KEY: "old", BAR_KEY: "new" });
		await renameMigration.run(ctx);
		expect(ctx.env()).toEqual({ FOO_KEY: "old", BAR_KEY: "new" });
	});

	it("is a no-op when neither key is set", async () => {
		const ctx = inMemoryContext({ OTHER: "keep" });
		await renameMigration.run(ctx);
		expect(ctx.env()).toEqual({ OTHER: "keep" });
	});
});
