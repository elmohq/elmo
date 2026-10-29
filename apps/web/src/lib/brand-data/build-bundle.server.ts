import { db } from "@workspace/lib/db/db";
import { getAllProviders } from "@workspace/lib/providers";
import { type SQL, sql } from "drizzle-orm";
import type { BrandBundle } from "@/lib/brand-data/bundle";
import {
	assembleBundle,
	type BrandChunk,
	type ChunkManifestEntry,
	type EntitiesChunk,
	manifestVersion,
	type RunTable,
} from "@/lib/brand-data/chunks";

const rows = async <T>(query: SQL) => (await db.execute(query)).rows as T[];

/** Cited pages are chunked by id; new pages get new ids, so older ranges stay put. */
const PAGE_ID_RANGE = 200_000;

const TABLES: Record<RunTable, { table: string; fingerprint: SQL }> = {
	promptRuns: {
		table: "rollup_prompt_runs",
		fingerprint: sql`concat(count(*), '|', sum(runs), '|', sum(brand_mentioned_runs), '|', sum(competitor_mentions), '|', sum(positive_runs), '|', sum(fanout_queries), '|', max(last_run_at))`,
	},
	competitorMentions: {
		table: "rollup_competitor_mentions",
		fingerprint: sql`concat(count(*), '|', sum(runs), '|', sum(positive_runs), '|', sum(position_sum), '|', sum(hashtext(competitor_name)))`,
	},
	webQueries: {
		table: "rollup_web_queries",
		fingerprint: sql`concat(count(*), '|', sum(runs), '|', sum(brand_mentioned_runs), '|', sum(hashtext(query)))`,
	},
	sentimentQuotes: {
		table: "rollup_sentiment_quotes",
		fingerprint: sql`concat(count(*), '|', sum(hashtext(run_id::text)), '|', sum(confidence))`,
	},
	citations: {
		table: "rollup_citation_urls",
		fingerprint: sql`concat(count(*), '|', sum(citations), '|', sum(position_sum), '|', sum(page_id))`,
	},
};

/** Cheap enough for every poll: per-month fingerprints from the rollups' own index. */
export async function chunkManifest(brandId: string): Promise<ChunkManifestEntry[]> {
	const months = (name: RunTable) =>
		sql`SELECT ${name}::text || ':' || to_char(bucket AT TIME ZONE 'UTC', 'YYYY-MM') AS id, md5(${TABLES[name].fingerprint}) AS hash
			FROM ${sql.raw(TABLES[name].table)} WHERE brand_id = ${brandId} GROUP BY 1`;
	const result = await rows<ChunkManifestEntry>(sql`
		${months("promptRuns")}
		UNION ALL ${months("competitorMentions")}
		UNION ALL ${months("webQueries")}
		UNION ALL ${months("sentimentQuotes")}
		UNION ALL ${months("citations")}
		UNION ALL
		SELECT 'pages:' || (page_id / ${sql.raw(String(PAGE_ID_RANGE))})::text, md5(concat(count(*), '|', sum(page_id), '|', sum(hashtext(concat(url, title, domain, page_type, static_category)))))
		FROM rollup_citation_pages WHERE brand_id = ${brandId} GROUP BY page_id / ${sql.raw(String(PAGE_ID_RANGE))}
		UNION ALL
		SELECT 'entities', md5(concat_ws('|',
			(SELECT concat(name, website, additional_domains, delay_override_hours) FROM brands WHERE id = ${brandId}),
			(SELECT string_agg(concat(id, value, enabled, tags, system_tags, created_at), ',' ORDER BY id) FROM prompts WHERE brand_id = ${brandId}),
			(SELECT string_agg(concat(id, name, domains), ',' ORDER BY id) FROM competitors WHERE brand_id = ${brandId})
		))
	`);
	return result;
}

export async function brandDataVersion(brandId: string): Promise<string> {
	return manifestVersion(await chunkManifest(brandId));
}

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

interface KeyRow {
	bucket: Date | string;
	prompt_id: string;
	model: string;
	provider: string;
	web_search_enabled: boolean;
}

const minutes = (value: Date | string) => Math.round(new Date(value).getTime() / 60_000);
const millis = (value: Date | string | null) => (value === null ? 0 : new Date(value).getTime());

async function entitiesChunk(brandId: string): Promise<EntitiesChunk> {
	const [brandRows, competitorRows, promptRows] = await Promise.all([
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
		})),
		apiProviderIds: getAllProviders()
			.filter((provider) => provider.access === "api")
			.map((provider) => provider.id),
	};
}

/** The columns each table's chunk carries, and how to read each from a row. */
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

async function runChunk(brandId: string, table: RunTable, month: string): Promise<BrandChunk["data"]> {
	const start = `${month}-01T00:00:00Z`;
	const result = await rows<KeyRow & Record<string, unknown>>(sql`
		SELECT * FROM ${sql.raw(TABLES[table].table)}
		WHERE brand_id = ${brandId}
			AND bucket >= ${start}::timestamptz AND bucket < (${start}::timestamptz + interval '1 month')
		ORDER BY bucket
	`);
	const dicts = dictionaries();
	const spec = RUN_COLUMNS[table];
	const columns: Record<string, (number | string | null)[]> = {
		bucket: [],
		prompt: [],
		model: [],
		provider: [],
		web: [],
		...Object.fromEntries(Object.keys(spec).map((name) => [name, []])),
	};
	for (const row of result) {
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
	return { kind: "run", table, dicts: dicts.values(), columns };
}

async function pagesChunk(brandId: string, range: number): Promise<BrandChunk["data"]> {
	const result = await rows<{
		page_id: string;
		url: string;
		domain: string;
		title: string | null;
		page_type: string;
		static_category: string;
	}>(sql`
		SELECT page_id, url, domain, title, page_type, static_category FROM rollup_citation_pages
		WHERE brand_id = ${brandId} AND page_id >= ${range * PAGE_ID_RANGE} AND page_id < ${(range + 1) * PAGE_ID_RANGE}
		ORDER BY url COLLATE "C"
	`);
	const dicts = dictionaries();
	const columns: Record<string, (number | string | null)[]> = {
		id: [],
		url: [],
		domain: [],
		title: [],
		pageType: [],
		category: [],
	};
	for (const row of result) {
		columns.id.push(Number(row.page_id));
		columns.url.push(row.url);
		columns.domain.push(dicts.id("domains", row.domain));
		columns.title.push(row.title);
		columns.pageType.push(dicts.id("pageTypes", row.page_type));
		columns.category.push(dicts.id("categories", row.static_category));
	}
	return { kind: "pages", dicts: dicts.values(), columns };
}

export async function buildChunks(brandId: string, manifest: ChunkManifestEntry[]): Promise<BrandChunk[]> {
	return Promise.all(
		manifest.map(async ({ id, hash }) => {
			const [kind, key] = id.split(":");
			const data =
				kind === "entities"
					? await entitiesChunk(brandId)
					: kind === "pages"
						? await pagesChunk(brandId, Number(key))
						: await runChunk(brandId, kind as RunTable, key);
			return { id, hash, data };
		}),
	);
}

/** Every chunk merged, as the browser would assemble them. */
export async function buildBrandBundle(brandId: string): Promise<BrandBundle> {
	const manifest = await chunkManifest(brandId);
	const bundle = assembleBundle(brandId, manifestVersion(manifest), await buildChunks(brandId, manifest));
	if (!bundle) throw new Error("Brand not found");
	return bundle;
}
