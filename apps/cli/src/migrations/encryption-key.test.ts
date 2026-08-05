import { describe, expect, it } from "vitest";
import { MIGRATIONS, reconcileCurrentConfig } from "./index.js";
import type { Migration, MigrationContext } from "./types.js";

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

const encryptionKeyMigration = MIGRATIONS.find((m) => m.from === "0.2.17") as Migration;

describe("ELMO_ENCRYPTION_KEY migration", () => {
	it("is registered as the 0.2.17 → 0.2.18 entry", () => {
		expect(encryptionKeyMigration).toBeDefined();
		expect(encryptionKeyMigration.to).toBe("0.2.18");
	});

	it("adds a 32-byte base64 key to local deployments when absent", async () => {
		const ctx = inMemoryContext({ DEPLOYMENT_MODE: "local", DATABASE_URL: "postgres://x", OTHER: "keep" });
		await encryptionKeyMigration.run(ctx);
		const { ELMO_ENCRYPTION_KEY, ...rest } = ctx.env();
		expect(rest).toEqual({ DEPLOYMENT_MODE: "local", DATABASE_URL: "postgres://x", OTHER: "keep" });
		expect(Buffer.from(ELMO_ENCRYPTION_KEY, "base64").length).toBe(32);
	});

	it("is a no-op when the key already exists (never clobbers an operator's value)", async () => {
		const ctx = inMemoryContext({ DEPLOYMENT_MODE: "local", ELMO_ENCRYPTION_KEY: "existing", OTHER: "keep" });
		await encryptionKeyMigration.run(ctx);
		expect(ctx.env()).toEqual({ DEPLOYMENT_MODE: "local", ELMO_ENCRYPTION_KEY: "existing", OTHER: "keep" });
	});

	it("preserves the generated key when an interrupted upgrade replays the migration", async () => {
		const ctx = inMemoryContext({ DEPLOYMENT_MODE: "local" });
		await encryptionKeyMigration.run(ctx);
		const firstKey = ctx.env().ELMO_ENCRYPTION_KEY;

		await encryptionKeyMigration.run(ctx);

		expect(ctx.env().ELMO_ENCRYPTION_KEY).toBe(firstKey);
	});

	it("repairs a blank required key even when version history is unavailable", async () => {
		const ctx = inMemoryContext({ DEPLOYMENT_MODE: "local", ELMO_ENCRYPTION_KEY: "  " });
		await reconcileCurrentConfig(ctx);
		expect(Buffer.from(ctx.env().ELMO_ENCRYPTION_KEY, "base64").length).toBe(32);
	});

	it("does not provision hosted deployment modes", async () => {
		const ctx = inMemoryContext({ DEPLOYMENT_MODE: "whitelabel", OTHER: "keep" });
		await reconcileCurrentConfig(ctx);
		expect(ctx.env()).toEqual({ DEPLOYMENT_MODE: "whitelabel", OTHER: "keep" });
	});
});
