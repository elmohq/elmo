import { AsyncDuckDB, DuckDBAccessMode, selectBundle, VoidLogger } from "@duckdb/duckdb-wasm";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehModule from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpModule from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import { BRAND_DATA_DB_PREFIX, BRAND_DATA_FORMAT } from "@/lib/brand-data/chunks";
import { createRollupTables } from "@/lib/brand-data/duck/engine";

const DB_FILE = `${BRAND_DATA_DB_PREFIX}-v${BRAND_DATA_FORMAT}.duckdb`;
/** A reloading page's previous worker can hold the file for a moment after it goes. */
const OPEN_ATTEMPTS = 10;
const OPEN_RETRY_MS = 100;

interface DirectoryKeys {
	keys(): AsyncIterable<string>;
}

/** Deletes the browser's brand data files: every format's, or only those an older or newer format left behind. */
export async function removeBrandDataFiles(keepCurrent: boolean) {
	const root = await navigator.storage.getDirectory();
	for await (const name of (root as unknown as DirectoryKeys).keys()) {
		if (!name.startsWith(BRAND_DATA_DB_PREFIX) || (keepCurrent && name.startsWith(DB_FILE))) continue;
		await root.removeEntry(name).catch(() => {});
	}
}

/**
 * Opens DuckDB with its database in the origin private file system, so a reload resumes where the last visit
 * left off. Only one tab can hold the file; any other keeps its copy in memory.
 */
export async function openDuck(): Promise<AsyncDuckDB> {
	const bundle = await selectBundle({
		mvp: { mainModule: mvpModule, mainWorker: mvpWorker },
		eh: { mainModule: ehModule, mainWorker: ehWorker },
	});
	const db = new AsyncDuckDB(new VoidLogger(), new Worker(bundle.mainWorker as string));
	await db.instantiate(bundle.mainModule);
	for (let attempt = 0; ; attempt++) {
		try {
			await db.open({ path: `opfs://${DB_FILE}`, accessMode: DuckDBAccessMode.READ_WRITE });
			break;
		} catch (error) {
			if (attempt >= OPEN_ATTEMPTS) {
				console.warn("Brand data is kept in memory:", error);
				await db.open({});
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, OPEN_RETRY_MS));
		}
	}
	await createRollupTables(await db.connect());
	return db;
}
