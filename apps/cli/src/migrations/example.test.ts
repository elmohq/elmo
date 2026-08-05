import { describe, expect, it } from "vitest";
import type { Migration, MigrationContext } from "./types.js";

// Template for testing a real migration: build an in-memory context, run the
// migration's `run` against it, and assert on the resulting env. Copy this when
// you add a migration to MIGRATIONS.

function inMemoryContext(initial: Record<string, string> = {}): MigrationContext & {
	env: () => Record<string, string>;
} {
	const env: Record<string, string> = { ...initial };
	return {
		configDir: "/fake",
		log: { info: () => {}, warn: () => {}, step: () => {} },
		readEnv: async () => ({ ...env }),
		setEnv: async (name, value) => {
			env[name] = value;
		},
		env: () => ({ ...env }),
	};
}

describe("example: additive env migration", () => {
	const copyMigration: Migration = {
		from: "0.3.0",
		to: "0.4.0",
		description: "Rename FOO_KEY → BAR_KEY",
		async run(ctx) {
			const env = await ctx.readEnv();
			if (env.FOO_KEY === undefined || env.BAR_KEY !== undefined) return;
			await ctx.setEnv("BAR_KEY", env.FOO_KEY);
		},
	};

	it("copies the key when only the old one is set", async () => {
		const ctx = inMemoryContext({ FOO_KEY: "value", OTHER: "keep" });
		await copyMigration.run(ctx);
		expect(ctx.env()).toEqual({ FOO_KEY: "value", BAR_KEY: "value", OTHER: "keep" });
	});

	it("is a no-op when the new key already exists", async () => {
		const ctx = inMemoryContext({ FOO_KEY: "old", BAR_KEY: "new" });
		await copyMigration.run(ctx);
		expect(ctx.env()).toEqual({ FOO_KEY: "old", BAR_KEY: "new" });
	});

	it("is a no-op when neither key is set", async () => {
		const ctx = inMemoryContext({ OTHER: "keep" });
		await copyMigration.run(ctx);
		expect(ctx.env()).toEqual({ OTHER: "keep" });
	});
});
