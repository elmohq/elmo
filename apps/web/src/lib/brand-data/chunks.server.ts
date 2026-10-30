import { createHash } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import {
	rollupCitationPages,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupPromptRuns,
	rollupSentimentQuotes,
	rollupWebQueries,
} from "@workspace/lib/db/schema";
import {
	Bool,
	type DataType,
	Float64,
	Int32,
	Table,
	TimestampMillisecond,
	tableToIPC,
	Utf8,
	type Vector,
	vectorFromArray,
} from "apache-arrow";
import { type SQL, sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
	type BrandChunk,
	type ChunkGroup,
	type ChunkManifestEntry,
	ENTITIES_CHUNK,
	type EntitiesChunk,
	PAGE_ATTRIBUTES,
	PAGE_ID_RANGE,
	PAGE_TEXT,
	periodBounds,
	periodChunkId,
	ROLLUP_TABLES,
} from "@/lib/brand-data/chunks";

const rows = async <T>(query: SQL) => (await db.execute(query)).rows as T[];

const MAX_FIRST_EVALUATED = 500;
const firstEvaluated = new Map<string, { key: string; value: Promise<Map<string, string>> }>();

/** Scans every rollup row of the brand, so it is reused until one of the brand's months changes. */
function promptFirstEvaluated(brandId: string, monthVersions: string): Promise<Map<string, string>> {
	const cached = firstEvaluated.get(brandId);
	if (cached?.key === monthVersions) return cached.value;
	const value = rows<{ prompt_id: string; first: Date }>(sql`
		SELECT prompt_id, min(first_run_at) AS first FROM rollup_prompt_runs
		WHERE brand_id = ${brandId} GROUP BY prompt_id
	`).then((result) => new Map(result.map((row) => [row.prompt_id, new Date(row.first).toISOString()])));
	value.catch(() => firstEvaluated.delete(brandId));
	firstEvaluated.delete(brandId);
	if (firstEvaluated.size >= MAX_FIRST_EVALUATED) firstEvaluated.delete(firstEvaluated.keys().next().value as string);
	firstEvaluated.set(brandId, { key: monthVersions, value });
	return value;
}

async function entitiesChunk(brandId: string, monthVersions: string): Promise<EntitiesChunk> {
	const [brandRows, competitorRows, promptRows, first] = await Promise.all([
		rows<{
			id: string;
			name: string;
			website: string;
			additional_domains: string[] | null;
			delay_override_hours: number | null;
		}>(sql`SELECT id, name, website, additional_domains, delay_override_hours FROM brands WHERE id = ${brandId}`),
		rows<{ id: string; name: string; domains: string[] }>(
			sql`SELECT id, name, domains FROM competitors WHERE brand_id = ${brandId} ORDER BY created_at, id`,
		),
		rows<{
			id: string;
			value: string;
			tags: string[] | null;
			system_tags: string[] | null;
			enabled: boolean;
			created_at: Date;
		}>(
			sql`SELECT id, value, tags, system_tags, enabled, created_at FROM prompts WHERE brand_id = ${brandId} ORDER BY created_at DESC, id`,
		),
		promptFirstEvaluated(brandId, monthVersions),
	]);
	const brand = brandRows[0];
	if (!brand) throw new Error("Brand not found");
	return {
		brand: {
			id: brand.id,
			name: brand.name,
			website: brand.website,
			additionalDomains: brand.additional_domains ?? [],
			delayOverrideHours: brand.delay_override_hours,
		},
		competitors: competitorRows.map((row) => ({ id: row.id, name: row.name, domains: row.domains })),
		prompts: promptRows.map((row) => ({
			id: row.id,
			value: row.value,
			tags: row.tags ?? [],
			systemTags: row.system_tags ?? [],
			enabled: row.enabled,
			createdAt: new Date(row.created_at).toISOString(),
			firstEvaluatedAt: first.get(row.id) ?? null,
		})),
	};
}

const contentVersion = (data: unknown) =>
	createHash("sha256").update(JSON.stringify(data)).digest("base64url").slice(0, 22);

interface BrandVersions {
	chunks: ChunkManifestEntry[];
	entities: EntitiesChunk;
}

/**
 * Every chunk the brand has, with the version the browser compares against its copy. A rollup refresh rewrites
 * every table of the range it rebuilds in one transaction, and page copies are only written when they change, so
 * the rows' count and newest writing transaction (`xmin`) move exactly when a month's or page range's data may have.
 */
export async function brandVersions(brandId: string): Promise<BrandVersions> {
	const [[pipeline], periods, ranges] = await Promise.all([
		rows<{ rollup_version: number }>(sql`SELECT rollup_version FROM pipeline_state WHERE id = 1`),
		rows<{ period: string; version: string }>(sql`
			SELECT
				to_char(
					bucket AT TIME ZONE 'UTC',
					CASE WHEN bucket >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' THEN 'YYYY-MM-DD' ELSE 'YYYY-MM' END
				) AS period,
				count(*) || '.' || max(xmin::text::bigint) AS version
			FROM rollup_prompt_runs WHERE brand_id = ${brandId} GROUP BY 1 ORDER BY 1
		`),
		rows<{ range: number; version: string }>(sql`
			SELECT (page_id / ${PAGE_ID_RANGE})::int AS range, count(*) || '.' || max(xmin::text::bigint) AS version
			FROM rollup_citation_pages WHERE brand_id = ${brandId} GROUP BY 1 ORDER BY 1
		`),
	]);
	const rollupVersion = pipeline?.rollup_version ?? 0;
	const entities = await entitiesChunk(brandId, periods.map((p) => p.version).join(","));
	return {
		entities,
		chunks: [
			{ id: ENTITIES_CHUNK, version: contentVersion(entities) },
			...periods.flatMap(({ period, version }) =>
				(Object.keys(ROLLUP_TABLES) as ChunkGroup[]).map((group) => ({
					id: periodChunkId(group, period),
					version: `${rollupVersion}:${version}`,
				})),
			),
			...ranges.flatMap(({ range, version }) => [
				{ id: `pages:${range}`, version: `${rollupVersion}:${version}` },
				{ id: `urls:${range}`, version: `${rollupVersion}:${version}` },
			]),
		],
	};
}

const TABLES: Record<string, PgTable> = {
	rollup_prompt_runs: rollupPromptRuns,
	rollup_competitor_mentions: rollupCompetitorMentions,
	rollup_web_queries: rollupWebQueries,
	rollup_sentiment_quotes: rollupSentimentQuotes,
	rollup_citation_urls: rollupCitationUrls,
};

const ARROW_TYPES: Record<string, () => DataType> = {
	text: () => new Utf8(),
	uuid: () => new Utf8(),
	boolean: () => new Bool(),
	integer: () => new Int32(),
	bigint: () => new Float64(),
	"double precision": () => new Float64(),
	"timestamp with time zone": () => new TimestampMillisecond("UTC"),
};

/** node-postgres, as drizzle configures it, returns timestamps as Postgres's text and bigints as strings. */
function arrowValue(value: unknown, sqlType: string): unknown {
	if (value === null || value === undefined) return null;
	if (sqlType === "timestamp with time zone")
		return new Date(String(value).replace(" ", "T").replace(/\+00$/, "Z")).getTime();
	if (sqlType === "bigint") return Number(value);
	return value;
}

/** The rows as an Arrow stream with the table's own column types; `brand_id` is left out, as every row shares it. */
function toArrow(table: PgTable, rows: Record<string, unknown>[], only?: string[]): Uint8Array {
	const vectors: Record<string, Vector> = {};
	for (const column of getTableConfig(table).columns) {
		if (column.name === "brand_id" || (only && !only.includes(column.name))) continue;
		const sqlType = column.getSQLType();
		const type = ARROW_TYPES[sqlType];
		if (!type) throw new Error(`No Arrow type for ${sqlType}`);
		vectors[column.name] = vectorFromArray(
			rows.map((row) => arrowValue(row[column.name], sqlType)),
			type(),
		);
	}
	return tableToIPC(new Table(vectors), "stream");
}

async function periodTables(brandId: string, group: ChunkGroup, period: string): Promise<Record<string, Uint8Array>> {
	const { start, end } = periodBounds(period);
	const entries = await Promise.all(
		ROLLUP_TABLES[group].map(async (name) => {
			const result = await rows<Record<string, unknown>>(sql`
				SELECT * FROM ${sql.raw(name)}
				WHERE brand_id = ${brandId} AND bucket >= ${start.toISOString()}::timestamptz AND bucket < ${end.toISOString()}::timestamptz
				ORDER BY bucket
			`);
			return [name, toArrow(TABLES[name], result)] as const;
		}),
	);
	return Object.fromEntries(entries);
}

async function pageTable(brandId: string, range: number, columns: string[]): Promise<Uint8Array> {
	const result = await rows<Record<string, unknown>>(sql`
		SELECT ${sql.raw(columns.join(", "))} FROM rollup_citation_pages
		WHERE brand_id = ${brandId} AND page_id >= ${range * PAGE_ID_RANGE} AND page_id < ${(range + 1) * PAGE_ID_RANGE}
		ORDER BY page_id
	`);
	return toArrow(rollupCitationPages, result, columns);
}

export async function buildChunk(
	brandId: string,
	entry: ChunkManifestEntry,
	entities: EntitiesChunk,
): Promise<BrandChunk> {
	const [kind, key] = entry.id.split(":");
	if (entry.id === ENTITIES_CHUNK) return { ...entry, entities };
	if (kind === "pages")
		return { ...entry, tables: { rollup_citation_pages: await pageTable(brandId, Number(key), PAGE_ATTRIBUTES) } };
	if (kind === "urls")
		return { ...entry, tables: { rollup_citation_pages: await pageTable(brandId, Number(key), PAGE_TEXT) } };
	return { ...entry, tables: await periodTables(brandId, kind as ChunkGroup, key) };
}

const SECOND = 1;
const MINUTE = 60 * SECOND;

/**
 * How long until the brand's data is likely to change: soon while its prompts are being evaluated or
 * their results are waiting to be rolled up, else shortly after the next evaluation is due.
 */
export async function nextSyncInSeconds(brandId: string): Promise<number> {
	try {
		const [row] = await rows<{ busy: boolean; next_due: Date | null }>(sql`
			SELECT
				EXISTS (SELECT 1 FROM rollup_dirty WHERE brand_id = ${brandId})
					OR coalesce(bool_or(j.state = 'active' OR j.start_after <= now()), false) AS busy,
				min(j.start_after) FILTER (WHERE j.start_after > now()) AS next_due
			FROM pgboss.job j
			WHERE j.name = 'process-prompt'
				AND j.state IN ('created', 'retry', 'active')
				AND j.data->>'promptId' IN (SELECT id::text FROM prompts WHERE brand_id = ${brandId} AND enabled)
		`);
		if (row?.busy) return 20 * SECOND;
		if (!row?.next_due) return 15 * MINUTE;
		const untilDue = (new Date(row.next_due).getTime() - Date.now()) / 1000;
		return Math.round(Math.min(15 * MINUTE, Math.max(20 * SECOND, untilDue + 90 * SECOND)));
	} catch {
		return 5 * MINUTE;
	}
}
