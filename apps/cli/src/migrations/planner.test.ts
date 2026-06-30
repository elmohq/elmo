import { describe, expect, it, vi } from "vitest";
import { planMigrations, runMigrations } from "./planner.js";
import type { Migration, MigrationContext } from "./types.js";

function migration(from: string, to: string, run?: () => Promise<void>): Migration {
	return {
		from,
		to,
		description: `${from} → ${to}`,
		run: run ?? (async () => {}),
	};
}

function fakeContext(): MigrationContext {
	let env: Record<string, string> = {};
	return {
		configDir: "/fake",
		log: { info: () => {}, warn: () => {}, step: () => {} },
		readEnv: async () => ({ ...env }),
		writeEnv: async (next) => {
			env = { ...next };
		},
	};
}

describe("planMigrations", () => {
	it("returns an empty plan when from === to", () => {
		expect(planMigrations("0.2.9", "0.2.9", [])).toEqual([]);
	});

	it("returns an empty plan when no migrations exist in the range", () => {
		const all = [migration("0.5.0", "0.6.0")];
		expect(planMigrations("0.2.9", "0.4.0", all)).toEqual([]);
	});

	it("includes a migration whose `from` is inside the upgrade range", () => {
		const m = migration("0.3.0", "0.4.0");
		expect(planMigrations("0.2.9", "0.5.0", [m])).toEqual([m]);
	});

	it("sorts multiple applicable migrations by semver-ascending `from`", () => {
		const a = migration("0.3.0", "0.4.0");
		const b = migration("0.2.10", "0.3.0");
		const c = migration("0.4.0", "0.5.0");
		expect(planMigrations("0.2.0", "0.6.0", [a, b, c])).toEqual([b, a, c]);
	});

	it("skips migrations whose `from` is before the upgrade start", () => {
		const stale = migration("0.1.0", "0.2.0");
		const active = migration("0.3.0", "0.4.0");
		expect(planMigrations("0.2.9", "0.5.0", [stale, active])).toEqual([active]);
	});

	it("skips migrations whose `from` equals the upgrade target (exclusive upper bound)", () => {
		const m = migration("0.5.0", "0.6.0");
		expect(planMigrations("0.2.0", "0.5.0", [m])).toEqual([]);
	});

	it("throws on a downgrade", () => {
		expect(() => planMigrations("0.4.0", "0.3.0", [])).toThrow(/Downgrade/);
	});

	it("throws on invalid versions", () => {
		expect(() => planMigrations("bad", "0.3.0", [])).toThrow(/Invalid from/);
		expect(() => planMigrations("0.3.0", "bad", [])).toThrow(/Invalid to/);
	});

	it("throws when a migration has invalid versions", () => {
		expect(() => planMigrations("0.2.0", "0.5.0", [migration("bad", "0.3.0")])).toThrow(/invalid from/);
		expect(() => planMigrations("0.2.0", "0.5.0", [migration("0.3.0", "bad")])).toThrow(/invalid to/);
	});

	it("throws when a migration's `to` is not greater than `from`", () => {
		expect(() => planMigrations("0.2.0", "0.5.0", [migration("0.3.0", "0.3.0")])).toThrow(/must be greater/);
	});

	it("throws when two migrations share the same `from`", () => {
		const all = [migration("0.3.0", "0.4.0"), migration("0.3.0", "0.4.1")];
		expect(() => planMigrations("0.2.0", "0.5.0", all)).toThrow(/Multiple migrations/);
	});
});

describe("runMigrations", () => {
	it("runs migrations in the provided order with the given context", async () => {
		const calls: string[] = [];
		const a = migration("0.3.0", "0.4.0", async () => {
			calls.push("a");
		});
		const b = migration("0.4.0", "0.5.0", async () => {
			calls.push("b");
		});

		await runMigrations([a, b], fakeContext());

		expect(calls).toEqual(["a", "b"]);
	});

	it("stops on the first failing migration", async () => {
		const ran: string[] = [];
		const a = migration("0.3.0", "0.4.0", async () => {
			ran.push("a");
		});
		const b = migration("0.4.0", "0.5.0", async () => {
			throw new Error("boom");
		});
		const c = migration("0.5.0", "0.6.0", async () => {
			ran.push("c");
		});

		await expect(runMigrations([a, b, c], fakeContext())).rejects.toThrow(/boom/);
		expect(ran).toEqual(["a"]);
	});

	it("logs a step for each migration before running it", async () => {
		const step = vi.fn();
		const ctx: MigrationContext = {
			configDir: "/fake",
			log: { info: () => {}, warn: () => {}, step },
			readEnv: async () => ({}),
			writeEnv: async () => {},
		};

		await runMigrations([migration("0.3.0", "0.4.0")], ctx);

		expect(step).toHaveBeenCalledTimes(1);
		expect(step.mock.calls[0][0]).toContain("0.3.0 → 0.4.0");
	});
});
