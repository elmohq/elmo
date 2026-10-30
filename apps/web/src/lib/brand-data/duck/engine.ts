import {
	rollupCitationPages,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupPromptRuns,
	rollupSentimentQuotes,
	rollupWebQueries,
} from "@workspace/lib/db/schema";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
	type BrandChunk,
	type ChunkManifestEntry,
	type EntitiesChunk,
	PAGE_ATTRIBUTES,
	PAGE_ID_RANGE,
	PAGE_TEXT,
	periodBounds,
	ROLLUP_TABLES,
} from "@/lib/brand-data/chunks";
import { type DuckConnection, preparePostgresDialect, toRows } from "@/lib/brand-data/duck/query";

export interface DuckEngineConnection extends DuckConnection {
	insertArrowFromIPCStream(buffer: Uint8Array, options: { name: string; create: boolean }): Promise<void> | void;
}

const MONTH_TABLES: Record<string, PgTable> = {
	rollup_prompt_runs: rollupPromptRuns,
	rollup_competitor_mentions: rollupCompetitorMentions,
	rollup_web_queries: rollupWebQueries,
	rollup_sentiment_quotes: rollupSentimentQuotes,
	rollup_citation_urls: rollupCitationUrls,
};

const PAGE_TABLE = "rollup_citation_pages";
/** Pages' attributes and text sync in separate chunks; `PAGE_TABLE` joins them once their chunks land. */
const PAGE_ATTRIBUTE_TABLE = "rollup_citation_page_attributes";
const PAGE_TEXT_TABLE = "rollup_citation_page_text";
/** Which chunk versions the tables hold, and each brand's entities and manifest, so a persisted database resumes. */
const CHUNK_TABLE = "brand_data_chunks";
const BRAND_TABLE = "brand_data_brands";
const ALL_TABLES = [
	...Object.keys(MONTH_TABLES),
	PAGE_ATTRIBUTE_TABLE,
	PAGE_TEXT_TABLE,
	PAGE_TABLE,
	CHUNK_TABLE,
	BRAND_TABLE,
];

const columns = (table: PgTable, only?: string[]) =>
	getTableConfig(table)
		.columns.filter((column) => !only || column.name === "brand_id" || only.includes(column.name))
		.map((column) => `${column.name} ${column.getSQLType()}`)
		.join(", ");

/** Creates tables shaped like the server's rollups, so the server's analytics SQL runs on them unchanged. */
export async function createRollupTables(conn: DuckEngineConnection) {
	await preparePostgresDialect(conn);
	for (const [name, table] of Object.entries(MONTH_TABLES)) {
		await conn.query(`CREATE TABLE IF NOT EXISTS ${name} (${columns(table)})`);
	}
	await conn.query(`CREATE TABLE IF NOT EXISTS ${PAGE_TABLE} (${columns(rollupCitationPages)})`);
	await conn.query(
		`CREATE TABLE IF NOT EXISTS ${PAGE_ATTRIBUTE_TABLE} (${columns(rollupCitationPages, PAGE_ATTRIBUTES)})`,
	);
	await conn.query(`CREATE TABLE IF NOT EXISTS ${PAGE_TEXT_TABLE} (${columns(rollupCitationPages, PAGE_TEXT)})`);
	await conn.query(
		`CREATE TABLE IF NOT EXISTS ${CHUNK_TABLE} (brand_id VARCHAR, chunk_id VARCHAR, version VARCHAR, PRIMARY KEY (brand_id, chunk_id))`,
	);
	await conn.query(
		`CREATE TABLE IF NOT EXISTS ${BRAND_TABLE} (brand_id VARCHAR PRIMARY KEY, entities VARCHAR, manifest VARCHAR)`,
	);
}

export interface StoredBrand {
	versions: Map<string, string>;
	entities?: EntitiesChunk;
	manifest?: ChunkManifestEntry[];
}

/** What the database already holds for the brand, from an earlier visit when it persists. */
export async function storedBrand(conn: DuckEngineConnection, brandId: string): Promise<StoredBrand> {
	const select = async <T>(text: string) => {
		const statement = await conn.prepare(text);
		try {
			return toRows<T>(await statement.query(brandId));
		} finally {
			await statement.close();
		}
	};
	const chunks = await select<{ chunk_id: string; version: string }>(
		`SELECT chunk_id, version FROM ${CHUNK_TABLE} WHERE brand_id = $1`,
	);
	const [brand] = await select<{ entities: string | null; manifest: string | null }>(
		`SELECT entities, manifest FROM ${BRAND_TABLE} WHERE brand_id = $1`,
	);
	return {
		versions: new Map(chunks.map((row) => [row.chunk_id, row.version])),
		entities: brand?.entities ? JSON.parse(brand.entities) : undefined,
		manifest: brand?.manifest ? JSON.parse(brand.manifest) : undefined,
	};
}

export async function storeManifest(conn: DuckEngineConnection, brandId: string, manifest: ChunkManifestEntry[]) {
	await run(
		conn,
		`INSERT INTO ${BRAND_TABLE} (brand_id, manifest) VALUES ($1, $2) ON CONFLICT (brand_id) DO UPDATE SET manifest = excluded.manifest`,
		brandId,
		JSON.stringify(manifest),
	);
}

async function run(conn: DuckEngineConnection, text: string, ...params: unknown[]) {
	const statement = await conn.prepare(text);
	try {
		await statement.query(...params);
	} finally {
		await statement.close();
	}
}

const PAGE_RANGE = "page_id >= $2 AND page_id < $3";

function chunkRows(id: string): { tables: string[]; where: string; bounds: unknown[] } {
	const [kind, key] = id.split(":");
	if (kind === "pages" || kind === "urls") {
		const range = Number(key);
		return {
			tables: [kind === "pages" ? PAGE_ATTRIBUTE_TABLE : PAGE_TEXT_TABLE],
			where: PAGE_RANGE,
			bounds: [range * PAGE_ID_RANGE, (range + 1) * PAGE_ID_RANGE],
		};
	}
	const { start, end } = periodBounds(key);
	return {
		tables: [...ROLLUP_TABLES[kind as keyof typeof ROLLUP_TABLES]],
		where: "bucket >= $2::TIMESTAMPTZ AND bucket < $3::TIMESTAMPTZ",
		bounds: [start.toISOString(), end.toISOString()],
	};
}

export async function removeChunk(conn: DuckEngineConnection, brandId: string, id: string) {
	const { tables, where, bounds } = chunkRows(id);
	for (const table of tables)
		await run(conn, `DELETE FROM ${table} WHERE brand_id = $1 AND ${where}`, brandId, ...bounds);
}

/** Replaces the chunk's rows with the ones it carries. */
/** Replaces the chunk's rows with the ones it carries, and records its version. */
export async function applyChunk(conn: DuckEngineConnection, brandId: string, chunk: BrandChunk) {
	if (chunk.entities) {
		await run(
			conn,
			`INSERT INTO ${BRAND_TABLE} (brand_id, entities) VALUES ($1, $2) ON CONFLICT (brand_id) DO UPDATE SET entities = excluded.entities`,
			brandId,
			JSON.stringify(chunk.entities),
		);
	} else if (chunk.tables) {
		await removeChunk(conn, brandId, chunk.id);
		const { tables } = chunkRows(chunk.id);
		for (const [name, bytes] of Object.entries(chunk.tables)) {
			const table = name === PAGE_TABLE ? tables[0] : name;
			await conn.insertArrowFromIPCStream(bytes, { name: "incoming_rows", create: true });
			try {
				await run(conn, `INSERT INTO ${table} BY NAME SELECT $1 AS brand_id, * FROM incoming_rows`, brandId);
			} finally {
				await conn.query("DROP TABLE incoming_rows");
			}
		}
	}
	await run(
		conn,
		`INSERT INTO ${CHUNK_TABLE} VALUES ($1, $2, $3) ON CONFLICT (brand_id, chunk_id) DO UPDATE SET version = excluded.version`,
		brandId,
		chunk.id,
		chunk.version,
	);
}

/** Rewrites the rollup tables in one pass: many small inserts and deletes leave DuckDB scanning fragmented row groups. */
export async function compactRollups(conn: DuckEngineConnection) {
	for (const table of Object.keys(MONTH_TABLES)) {
		await conn.query(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM ${table} ORDER BY brand_id, bucket`);
	}
}

/** Joins the pages' attributes to their text once, rather than in every read. */
export async function joinPages(conn: DuckEngineConnection) {
	await conn.query(`
		CREATE OR REPLACE TABLE ${PAGE_TABLE} AS
		SELECT a.brand_id, a.page_id, t.url, a.domain, t.title, a.page_type, a.static_category
		FROM ${PAGE_ATTRIBUTE_TABLE} a LEFT JOIN ${PAGE_TEXT_TABLE} t USING (brand_id, page_id)
		ORDER BY a.brand_id, a.page_id
	`);
}

export async function removeBrand(conn: DuckEngineConnection, brandId: string) {
	for (const table of ALL_TABLES) await run(conn, `DELETE FROM ${table} WHERE brand_id = $1`, brandId);
}
