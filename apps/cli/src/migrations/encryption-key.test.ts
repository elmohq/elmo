import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "./index.js";
import type { Migration, MigrationContext } from "./types.js";

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

const encryptionKeyMigration = MIGRATIONS.find((m) => m.from === "0.2.17") as Migration;

describe("ELMO_ENCRYPTION_KEY migration", () => {
	it("is registered as the 0.2.17 → 0.2.18 entry", () => {
		expect(encryptionKeyMigration).toBeDefined();
		expect(encryptionKeyMigration.to).toBe("0.2.18");
	});

	it("adds a 32-byte base64 key when absent, leaving other vars untouched", async () => {
		const ctx = inMemoryContext({ DATABASE_URL: "postgres://x", OTHER: "keep" });
		await encryptionKeyMigration.run(ctx);
		const { ELMO_ENCRYPTION_KEY, ...rest } = ctx.env();
		expect(rest).toEqual({ DATABASE_URL: "postgres://x", OTHER: "keep" });
		expect(Buffer.from(ELMO_ENCRYPTION_KEY, "base64").length).toBe(32);
	});

	it("is a no-op when the key already exists (never clobbers an operator's value)", async () => {
		const ctx = inMemoryContext({ ELMO_ENCRYPTION_KEY: "existing", OTHER: "keep" });
		await encryptionKeyMigration.run(ctx);
		expect(ctx.env()).toEqual({ ELMO_ENCRYPTION_KEY: "existing", OTHER: "keep" });
	});

	it("leaves an explicitly-emptied key alone", async () => {
		const ctx = inMemoryContext({ ELMO_ENCRYPTION_KEY: "" });
		await encryptionKeyMigration.run(ctx);
		expect(ctx.env()).toEqual({ ELMO_ENCRYPTION_KEY: "" });
	});
});
