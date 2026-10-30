import { createRequire } from "node:module";
import { createDuckDB, NODE_RUNTIME, VoidLogger } from "@duckdb/duckdb-wasm/blocking";
import { createRollupTables } from "@/lib/brand-data/duck/engine";

const require = createRequire(import.meta.url);

/** DuckDB as the browser's worker runs it, in Node's blocking build. */
export async function openTestDuck() {
	const wasm = (name: string) => require.resolve(`@duckdb/duckdb-wasm/dist/${name}`);
	const db = await createDuckDB(
		{
			mvp: { mainModule: wasm("duckdb-mvp.wasm"), mainWorker: "" },
			eh: { mainModule: wasm("duckdb-eh.wasm"), mainWorker: "" },
		},
		new VoidLogger(),
		NODE_RUNTIME,
	);
	await db.instantiate(() => {});
	await createRollupTables(db.connect());
	return db;
}
