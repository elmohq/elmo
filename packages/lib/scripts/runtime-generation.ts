export interface RuntimeGenerationTransitionClient {
	query(query: string, values?: unknown[]): Promise<unknown>;
}

export type RuntimeGenerationTransitionResult = "changed" | "unchanged";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readGeneration(result: unknown, operation: string): string {
	if (!isRecord(result) || !Array.isArray(result.rows) || result.rows.length !== 1 || !isRecord(result.rows[0])) {
		throw new Error(`The runtime generation singleton row is missing or duplicated while ${operation}`);
	}
	const generation = result.rows[0].generation;
	if (typeof generation !== "string" || !generation) {
		throw new Error(`The runtime generation singleton row is invalid while ${operation}`);
	}
	return generation;
}

export async function transitionDatabaseRuntimeGeneration(
	client: RuntimeGenerationTransitionClient,
	input: { expectedGeneration: string; generation: string },
): Promise<RuntimeGenerationTransitionResult> {
	await client.query("begin");
	try {
		const currentGeneration = readGeneration(
			await client.query("select generation from elmo_runtime_generation where singleton = true for update"),
			"locking it",
		);
		if (currentGeneration !== input.generation && currentGeneration !== input.expectedGeneration) {
			throw new Error(`Refusing runtime generation transition from unexpected generation ${currentGeneration}`);
		}
		if (currentGeneration === input.generation) {
			await client.query("commit");
			return "unchanged";
		}

		const updatedGeneration = readGeneration(
			await client.query(
				"update elmo_runtime_generation set generation = $1, updated_at = now() where singleton = true returning generation",
				[input.generation],
			),
			"updating it",
		);
		if (updatedGeneration !== input.generation) {
			throw new Error("PostgreSQL did not persist the requested runtime generation");
		}
		await client.query("commit");
		return "changed";
	} catch (error) {
		await client.query("rollback").catch(() => undefined);
		throw error;
	}
}
