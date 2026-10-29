import { db } from "@workspace/lib/db/db";
import { getAllProviders } from "@workspace/lib/providers";
import { sql } from "drizzle-orm";
import { BRAND_BUNDLE_FORMAT, type BrandBundle, type RunKeyColumns } from "@/lib/brand-data/bundle";

const rows = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];

function dictionary() {
	const index = new Map<string, number>();
	const values: string[] = [];
	return {
		values,
		id(value: string) {
			let id = index.get(value);
			if (id === undefined) {
				id = values.length;
				index.set(value, id);
				values.push(value);
			}
			return id;
		},
	};
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

/**
 * Cheap enough to ask on every poll: it changes whenever a refresh rewrites a
 * rollup row the brand reads, or the brand's prompts or competitors change.
 */
export async function brandDataVersion(brandId: string): Promise<string> {
	const [row] = await rows<{ version: string }>(sql`
		SELECT md5(concat_ws('|',
			(SELECT concat(count(*), max(bucket), max(last_run_at), sum(runs)) FROM rollup_prompt_runs WHERE brand_id = ${brandId}),
			(SELECT concat(count(*), max(bucket), sum(runs)) FROM rollup_competitor_mentions WHERE brand_id = ${brandId}),
			(SELECT concat(count(*), max(bucket), sum(runs)) FROM rollup_web_queries WHERE brand_id = ${brandId}),
			(SELECT concat(count(*), max(bucket), sum(citations)) FROM rollup_citation_urls WHERE brand_id = ${brandId}),
			(SELECT concat(count(*), max(bucket)) FROM rollup_sentiment_quotes WHERE brand_id = ${brandId}),
			(SELECT count(*) FROM rollup_citation_pages WHERE brand_id = ${brandId}),
			(SELECT concat(updated_at, name, website, additional_domains, delay_override_hours) FROM brands WHERE id = ${brandId}),
			(SELECT string_agg(concat(id, value, enabled, tags, system_tags), ',' ORDER BY id) FROM prompts WHERE brand_id = ${brandId}),
			(SELECT string_agg(concat(id, name, domains), ',' ORDER BY id) FROM competitors WHERE brand_id = ${brandId})
		)) AS version
	`);
	return row.version;
}

export async function buildBrandBundle(brandId: string): Promise<BrandBundle> {
	const version = await brandDataVersion(brandId);
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

	const promptIndex = new Map(promptRows.map((prompt, i) => [prompt.id, i]));
	const models = dictionary();
	const providers = dictionary();
	const competitorNames = dictionary();
	const queries = dictionary();
	const domains = dictionary();
	const pageTypes = dictionary();
	const categories = dictionary();
	const sentiments = dictionary();

	const keyColumns = (): RunKeyColumns => ({ bucket: [], prompt: [], model: [], provider: [], web: [] });
	const pushKey = (columns: RunKeyColumns, row: KeyRow) => {
		const prompt = promptIndex.get(row.prompt_id);
		if (prompt === undefined) return false;
		columns.bucket.push(minutes(row.bucket));
		columns.prompt.push(prompt);
		columns.model.push(models.id(row.model));
		columns.provider.push(providers.id(row.provider));
		columns.web.push(row.web_search_enabled ? 1 : 0);
		return true;
	};

	const [promptRunRows, competitorMentionRows, webQueryRows, citationRows, pageRows, quoteRows] = await Promise.all([
		rows<KeyRow & Record<string, number> & { first_run_at: Date; last_run_at: Date }>(
			sql`SELECT * FROM rollup_prompt_runs WHERE brand_id = ${brandId} ORDER BY bucket`,
		),
		rows<KeyRow & Record<string, number> & { competitor_name: string }>(
			sql`SELECT * FROM rollup_competitor_mentions WHERE brand_id = ${brandId} ORDER BY bucket`,
		),
		rows<KeyRow & { query: string; runs: number; brand_mentioned_runs: number }>(
			sql`SELECT * FROM rollup_web_queries WHERE brand_id = ${brandId} ORDER BY bucket`,
		),
		rows<KeyRow & { page_id: string; citations: number; position_sum: number }>(
			sql`SELECT bucket, prompt_id, model, provider, web_search_enabled, page_id, citations, position_sum
				FROM rollup_citation_urls WHERE brand_id = ${brandId} ORDER BY bucket`,
		),
		rows<{
			page_id: string;
			url: string;
			domain: string;
			title: string | null;
			page_type: string;
			static_category: string;
		}>(
			sql`SELECT page_id, url, domain, title, page_type, static_category FROM rollup_citation_pages WHERE brand_id = ${brandId}`,
		),
		rows<KeyRow & { sentiment: string; run_id: string; confidence: number; created_at: Date }>(
			sql`SELECT * FROM rollup_sentiment_quotes WHERE brand_id = ${brandId} ORDER BY bucket`,
		),
	]);

	const promptRuns = {
		...keyColumns(),
		runs: [] as number[],
		brandMentioned: [] as number[],
		competitorRuns: [] as number[],
		competitorMentions: [] as number[],
		noMention: [] as number[],
		fanoutRuns: [] as number[],
		fanoutQueries: [] as number[],
		firstRunAt: [] as number[],
		lastRunAt: [] as number[],
		positive: [] as number[],
		neutral: [] as number[],
		negative: [] as number[],
		mixed: [] as number[],
		positionSum: [] as number[],
		positioned: [] as number[],
	};
	for (const row of promptRunRows) {
		if (!pushKey(promptRuns, row)) continue;
		promptRuns.runs.push(row.runs);
		promptRuns.brandMentioned.push(row.brand_mentioned_runs);
		promptRuns.competitorRuns.push(row.competitor_runs);
		promptRuns.competitorMentions.push(row.competitor_mentions);
		promptRuns.noMention.push(row.no_mention_runs);
		promptRuns.fanoutRuns.push(row.fanout_runs);
		promptRuns.fanoutQueries.push(row.fanout_queries);
		promptRuns.firstRunAt.push(millis(row.first_run_at));
		promptRuns.lastRunAt.push(millis(row.last_run_at));
		promptRuns.positive.push(row.positive_runs);
		promptRuns.neutral.push(row.neutral_runs);
		promptRuns.negative.push(row.negative_runs);
		promptRuns.mixed.push(row.mixed_runs);
		promptRuns.positionSum.push(row.position_sum);
		promptRuns.positioned.push(row.positioned_runs);
	}

	const competitorMentions = {
		...keyColumns(),
		competitor: [] as number[],
		runs: [] as number[],
		positive: [] as number[],
		neutral: [] as number[],
		negative: [] as number[],
		mixed: [] as number[],
		positionSum: [] as number[],
		positioned: [] as number[],
	};
	for (const row of competitorMentionRows) {
		if (!pushKey(competitorMentions, row)) continue;
		competitorMentions.competitor.push(competitorNames.id(row.competitor_name));
		competitorMentions.runs.push(row.runs);
		competitorMentions.positive.push(row.positive_runs);
		competitorMentions.neutral.push(row.neutral_runs);
		competitorMentions.negative.push(row.negative_runs);
		competitorMentions.mixed.push(row.mixed_runs);
		competitorMentions.positionSum.push(row.position_sum);
		competitorMentions.positioned.push(row.positioned_runs);
	}

	const webQueries = { ...keyColumns(), query: [] as number[], runs: [] as number[], brandMentioned: [] as number[] };
	for (const row of webQueryRows) {
		if (!pushKey(webQueries, row)) continue;
		webQueries.query.push(queries.id(row.query));
		webQueries.runs.push(row.runs);
		webQueries.brandMentioned.push(row.brand_mentioned_runs);
	}

	const pageIndex = new Map<string, number>();
	const citationPages = {
		id: [] as number[],
		url: [] as string[],
		domain: [] as number[],
		title: [] as (string | null)[],
		pageType: [] as number[],
		category: [] as number[],
	};
	for (const row of pageRows) {
		pageIndex.set(String(row.page_id), citationPages.id.length);
		citationPages.id.push(Number(row.page_id));
		citationPages.url.push(row.url);
		citationPages.domain.push(domains.id(row.domain));
		citationPages.title.push(row.title);
		citationPages.pageType.push(pageTypes.id(row.page_type));
		citationPages.category.push(categories.id(row.static_category));
	}

	const citations = { ...keyColumns(), page: [] as number[], citations: [] as number[], positionSum: [] as number[] };
	for (const row of citationRows) {
		const page = pageIndex.get(String(row.page_id));
		if (page === undefined || !pushKey(citations, row)) continue;
		citations.page.push(page);
		citations.citations.push(row.citations);
		citations.positionSum.push(row.position_sum);
	}

	const sentimentQuotes = {
		...keyColumns(),
		sentiment: [] as number[],
		runId: [] as string[],
		confidence: [] as number[],
		createdAt: [] as number[],
	};
	for (const row of quoteRows) {
		if (!pushKey(sentimentQuotes, row)) continue;
		sentimentQuotes.sentiment.push(sentiments.id(row.sentiment));
		sentimentQuotes.runId.push(row.run_id);
		sentimentQuotes.confidence.push(row.confidence);
		sentimentQuotes.createdAt.push(millis(row.created_at));
	}

	return {
		format: BRAND_BUNDLE_FORMAT,
		brandId,
		version,
		apiProviderIds: getAllProviders()
			.filter((provider) => provider.access === "api")
			.map((provider) => provider.id),
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
		dicts: {
			models: models.values,
			providers: providers.values,
			competitors: competitorNames.values,
			queries: queries.values,
			domains: domains.values,
			pageTypes: pageTypes.values,
			categories: categories.values,
			sentiments: sentiments.values,
		},
		promptRuns,
		competitorMentions,
		webQueries,
		citations,
		citationPages,
		sentimentQuotes,
	};
}
