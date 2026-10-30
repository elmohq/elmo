import { createHash } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { getAllProviders } from "@workspace/lib/providers";
import { type SQL, sql } from "drizzle-orm";
import {
	type BrandChunk,
	type ChunkGroup,
	type ChunkManifestEntry,
	ENTITIES_CHUNK,
	type EntitiesChunk,
	MONTH_TABLES,
	type MonthChunk,
	monthChunkId,
	type PagesChunk,
	type RunTable,
	type UrlsChunk,
} from "@/lib/brand-data/chunks";

const rows = async <T>(query: SQL) => (await db.execute(query)).rows as T[];

const PAGE_ID_RANGE = 200_000;

const TABLES: Record<RunTable, string> = {
	promptRuns: "rollup_prompt_runs",
	competitorMentions: "rollup_competitor_mentions",
	webQueries: "rollup_web_queries",
	sentimentQuotes: "rollup_sentiment_quotes",
	citations: "rollup_citation_urls",
};

function dictionaries() {
	const store = new Map<string, { index: Map<string, number>; values: string[] }>();
	const id = (dict: string, value: string) => {
		let d = store.get(dict);
		if (!d) {
			d = { index: new Map(), values: [] };
			store.set(dict, d);
		}
		let i = d.index.get(value);
		if (i === undefined) {
			i = d.values.length;
			d.index.set(value, i);
			d.values.push(value);
		}
		return i;
	};
	const values = () => Object.fromEntries([...store].map(([name, d]) => [name, d.values]));
	return { id, values };
}

const minutes = (value: Date | string) => Math.round(new Date(value).getTime() / 60_000);
const millis = (value: Date | string | null) => (value === null ? 0 : new Date(value).getTime());

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
		kind: "entities",
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
		apiProviderIds: getAllProviders()
			.filter((provider) => provider.access === "api")
			.map((provider) => provider.id),
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
	const [[pipeline], months, ranges] = await Promise.all([
		rows<{ rollup_version: number }>(sql`SELECT rollup_version FROM pipeline_state WHERE id = 1`),
		rows<{ month: string; version: string }>(sql`
			SELECT to_char(bucket AT TIME ZONE 'UTC', 'YYYY-MM') AS month, count(*) || '.' || max(xmin::text::bigint) AS version
			FROM rollup_prompt_runs WHERE brand_id = ${brandId} GROUP BY 1 ORDER BY 1
		`),
		rows<{ range: number; version: string }>(sql`
			SELECT (page_id / ${PAGE_ID_RANGE})::int AS range, count(*) || '.' || max(xmin::text::bigint) AS version
			FROM rollup_citation_pages WHERE brand_id = ${brandId} GROUP BY 1 ORDER BY 1
		`),
	]);
	const rollupVersion = pipeline?.rollup_version ?? 0;
	const entities = await entitiesChunk(brandId, months.map((m) => m.version).join(","));
	return {
		entities,
		chunks: [
			{ id: ENTITIES_CHUNK, version: contentVersion(entities) },
			...months.flatMap(({ month, version }) =>
				(Object.keys(MONTH_TABLES) as ChunkGroup[]).map((group) => ({
					id: monthChunkId(group, month),
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

const RUN_COLUMNS: Record<RunTable, Record<string, (row: Record<string, unknown>) => number | string | null>> = {
	promptRuns: {
		runs: (r) => r.runs as number,
		brandMentioned: (r) => r.brand_mentioned_runs as number,
		competitorRuns: (r) => r.competitor_runs as number,
		competitorMentions: (r) => r.competitor_mentions as number,
		noMention: (r) => r.no_mention_runs as number,
		fanoutRuns: (r) => r.fanout_runs as number,
		fanoutQueries: (r) => r.fanout_queries as number,
		firstRunAt: (r) => millis(r.first_run_at as Date),
		lastRunAt: (r) => millis(r.last_run_at as Date),
		positive: (r) => r.positive_runs as number,
		neutral: (r) => r.neutral_runs as number,
		negative: (r) => r.negative_runs as number,
		mixed: (r) => r.mixed_runs as number,
		positionSum: (r) => r.position_sum as number,
		positioned: (r) => r.positioned_runs as number,
	},
	competitorMentions: {
		competitor: (r) => r.competitor_name as string,
		runs: (r) => r.runs as number,
		positive: (r) => r.positive_runs as number,
		neutral: (r) => r.neutral_runs as number,
		negative: (r) => r.negative_runs as number,
		mixed: (r) => r.mixed_runs as number,
		positionSum: (r) => r.position_sum as number,
		positioned: (r) => r.positioned_runs as number,
	},
	webQueries: {
		query: (r) => r.query as string,
		runs: (r) => r.runs as number,
		brandMentioned: (r) => r.brand_mentioned_runs as number,
	},
	sentimentQuotes: {
		sentiment: (r) => r.sentiment as string,
		runId: (r) => r.run_id as string,
		confidence: (r) => r.confidence as number,
		createdAt: (r) => millis(r.created_at as Date),
	},
	citations: {
		page: (r) => Number(r.page_id),
		citations: (r) => r.citations as number,
		positionSum: (r) => r.position_sum as number,
	},
};

const DICT_FOR: Record<string, string> = {
	model: "models",
	provider: "providers",
	competitor: "competitors",
	query: "queries",
	sentiment: "sentiments",
};

interface KeyRow {
	bucket: Date | string;
	prompt_id: string;
	model: string;
	provider: string;
	web_search_enabled: boolean;
}

async function monthChunk(brandId: string, group: ChunkGroup, month: string): Promise<MonthChunk> {
	const [y, m] = month.split("-").map(Number);
	const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
	const end = new Date(Date.UTC(y, m, 1)).toISOString();
	const dicts = dictionaries();
	const tables: MonthChunk["tables"] = {};
	const results = await Promise.all(
		MONTH_TABLES[group].map((table) =>
			rows<KeyRow & Record<string, unknown>>(sql`
				SELECT * FROM ${sql.raw(TABLES[table])}
				WHERE brand_id = ${brandId} AND bucket >= ${start}::timestamptz AND bucket < ${end}::timestamptz
				ORDER BY bucket
			`),
		),
	);
	MONTH_TABLES[group].forEach((table, t) => {
		const spec = RUN_COLUMNS[table];
		const columns: Record<string, (number | string | null)[]> = {
			bucket: [],
			prompt: [],
			model: [],
			provider: [],
			web: [],
			...Object.fromEntries(Object.keys(spec).map((name) => [name, []])),
		};
		for (const row of results[t]) {
			columns.bucket.push(minutes(row.bucket));
			columns.prompt.push(dicts.id("promptIds", row.prompt_id));
			columns.model.push(dicts.id("models", row.model));
			columns.provider.push(dicts.id("providers", row.provider));
			columns.web.push(row.web_search_enabled ? 1 : 0);
			for (const [name, read] of Object.entries(spec)) {
				const value = read(row);
				columns[name].push(DICT_FOR[name] ? dicts.id(DICT_FOR[name], value as string) : value);
			}
		}
		tables[table] = columns;
	});
	return { kind: "month", dicts: dicts.values(), tables };
}

async function pagesChunk(brandId: string, range: number): Promise<PagesChunk> {
	const result = await rows<{ page_id: string; domain: string; page_type: string; static_category: string }>(sql`
		SELECT page_id, domain, page_type, static_category FROM rollup_citation_pages
		WHERE brand_id = ${brandId} AND page_id >= ${range * PAGE_ID_RANGE} AND page_id < ${(range + 1) * PAGE_ID_RANGE}
		ORDER BY page_id
	`);
	const dicts = dictionaries();
	const columns: Record<string, (number | string | null)[]> = { id: [], domain: [], pageType: [], category: [] };
	for (const row of result) {
		columns.id.push(Number(row.page_id));
		columns.domain.push(dicts.id("domains", row.domain));
		columns.pageType.push(dicts.id("pageTypes", row.page_type));
		columns.category.push(dicts.id("categories", row.static_category));
	}
	return { kind: "pages", dicts: dicts.values(), columns };
}

async function urlsChunk(brandId: string, range: number): Promise<UrlsChunk> {
	const result = await rows<{ page_id: string; url: string; title: string | null }>(sql`
		SELECT page_id, url, title FROM rollup_citation_pages
		WHERE brand_id = ${brandId} AND page_id >= ${range * PAGE_ID_RANGE} AND page_id < ${(range + 1) * PAGE_ID_RANGE}
		ORDER BY page_id
	`);
	return {
		kind: "urls",
		columns: {
			id: result.map((row) => Number(row.page_id)),
			url: result.map((row) => row.url),
			title: result.map((row) => row.title),
		},
	};
}

export function buildChunk(brandId: string, entry: ChunkManifestEntry, entities: EntitiesChunk): Promise<BrandChunk> {
	const [kind, key] = entry.id.split(":");
	const data: Promise<BrandChunk["data"]> =
		entry.id === ENTITIES_CHUNK
			? Promise.resolve(entities)
			: kind === "pages"
				? pagesChunk(brandId, Number(key))
				: kind === "urls"
					? urlsChunk(brandId, Number(key))
					: monthChunk(brandId, kind as ChunkGroup, key);
	return data.then((value) => ({ ...entry, data: value }));
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
