import { describe, expect, it, vi } from "vitest";
import { type RuntimeGenerationTransitionClient, transitionDatabaseRuntimeGeneration } from "./runtime-generation";

function clientWithGeneration(currentGeneration: string): {
	client: RuntimeGenerationTransitionClient;
	query: ReturnType<typeof vi.fn>;
} {
	const query = vi.fn(async (sql: string, values?: unknown[]) => {
		if (sql === "begin" || sql === "commit" || sql === "rollback") return { rows: [] };
		if (sql.startsWith("select generation")) return { rows: [{ generation: currentGeneration }] };
		if (sql.startsWith("update elmo_runtime_generation")) return { rows: [{ generation: values?.[0] }] };
		throw new Error(`Unexpected query: ${sql}`);
	});
	return { client: { query }, query };
}

describe("database runtime generation compare-and-set", () => {
	it("changes exactly the expected epoch and verifies the persisted row", async () => {
		const { client, query } = clientWithGeneration("pre-0020");

		await expect(
			transitionDatabaseRuntimeGeneration(client, {
				expectedGeneration: "pre-0020",
				generation: "0020",
			}),
		).resolves.toBe("changed");
		expect(query.mock.calls.map(([sql]) => sql)).toEqual([
			"begin",
			"select generation from elmo_runtime_generation where singleton = true for update",
			"update elmo_runtime_generation set generation = $1, updated_at = now() where singleton = true returning generation",
			"commit",
		]);
	});

	it("is idempotent when the requested epoch is already active", async () => {
		const { client, query } = clientWithGeneration("0020");

		await expect(
			transitionDatabaseRuntimeGeneration(client, {
				expectedGeneration: "pre-0020",
				generation: "0020",
			}),
		).resolves.toBe("unchanged");
		expect(query.mock.calls.map(([sql]) => sql)).toEqual([
			"begin",
			"select generation from elmo_runtime_generation where singleton = true for update",
			"commit",
		]);
	});

	it("rolls back instead of crossing an unexpected epoch", async () => {
		const { client, query } = clientWithGeneration("0021");

		await expect(
			transitionDatabaseRuntimeGeneration(client, {
				expectedGeneration: "pre-0020",
				generation: "0020",
			}),
		).rejects.toThrow(/unexpected generation 0021/);
		expect(query.mock.calls.map(([sql]) => sql)).toEqual([
			"begin",
			"select generation from elmo_runtime_generation where singleton = true for update",
			"rollback",
		]);
	});

	it("fails closed when the singleton row is absent", async () => {
		const query = vi.fn(async (sql: string) => (sql.startsWith("select generation") ? { rows: [] } : { rows: [] }));

		await expect(
			transitionDatabaseRuntimeGeneration({ query }, { expectedGeneration: "pre-0020", generation: "0020" }),
		).rejects.toThrow(/singleton row is missing or duplicated/);
		expect(query.mock.calls.at(-1)?.[0]).toBe("rollback");
	});
});
