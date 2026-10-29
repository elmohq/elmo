import { CONTENT_PUBLISHER_CATEGORIES } from "@workspace/lib/citations/domain-categories";
import { GOOGLE_STATIC_CATEGORY } from "@workspace/lib/citations/page-classification";
import { type SQL, sql } from "drizzle-orm";
import { type AnalyticsScope, queryPg, scopeFilter } from "@/lib/analytics-sql";
import type { CitationFlowRow } from "@/lib/citation-flow";

export type CitationOwner = "brand" | "competitor";

export interface OwnedDomains {
	brandDomains: string[];
	competitorDomains: string[];
}

export interface CitationUrlFilter {
	category?: string;
	pageType?: string;
	search?: string;
}

export interface CitationUrlListRow {
	url: string;
	domain: string;
	title: string | null;
	category: string;
	page_type: string;
	count: number;
	avg_position: number | null;
	prompt_count: number;
	is_new: boolean;
}

export interface CitationDomainStatsRow {
	domain: string;
	count: number;
	category: string | null;
	example_title: string | null;
	previous_count: number;
}

export interface CitationClassTotalRow {
	category: string;
	page_type: string;
	count: number;
}

export interface RedditPageRow {
	url: string;
	title: string | null;
	count: number;
	is_new: boolean;
}

export interface DroppedCitationPageRow {
	url: string;
	domain: string;
	static_category: string;
	page_type: string;
	previous_count: number;
	current_count: number;
}

export interface CitationSummary {
	classes: CitationClassTotalRow[];
	uniqueDomains: number;
	newUrls: CitationUrlListRow[];
	droppedUrls: DroppedCitationPageRow[];
	newDomains: CitationDomainStatsRow[];
	droppedDomains: CitationDomainStatsRow[];
	redditPages: RedditPageRow[];
}

const rollupScope = (scope: AnalyticsScope, alias?: string) => scopeFilter(scope, { time: "bucket", alias });

export const textList = (values: readonly string[]) =>
	values.length === 0
		? sql`ARRAY[]::text[]`
		: sql`ARRAY[${sql.join(
				values.map((value) => sql`${value}`),
				sql`, `,
			)}]::text[]`;

const idList = (ids: readonly number[]) =>
	sql`ARRAY[${sql.join(
		ids.map((id) => sql`${id}::bigint`),
		sql`, `,
	)}]`;

/** For ILIKE, so a search for `100%` or `my_site` matches those characters literally. */
export const containing = (search: string) => `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * The brand's or a competitor's when the domain or a parent of it is theirs, as
 * `inDomainSet` decides; brand first. Joining on the domain's own suffixes keeps
 * this a hash join rather than a comparison of every domain against every owner.
 */
export function ownersCte(owned: OwnedDomains, domains: SQL): SQL {
	return sql`
		owned AS (
			SELECT suffix, 'brand' AS owner, 1 AS precedence FROM unnest(${textList(owned.brandDomains)}) AS b(suffix)
			UNION ALL
			SELECT suffix, 'competitor', 2 FROM unnest(${textList(owned.competitorDomains)}) AS c(suffix)
		),
		owners AS (
			SELECT DISTINCT ON (d.domain) d.domain, o.owner
			FROM (${domains}) d
			CROSS JOIN LATERAL (
				SELECT array_to_string(labels[i:], '.') AS suffix
				FROM (SELECT string_to_array(d.domain, '.') AS labels) l, generate_series(1, cardinality(l.labels)) i
			) s
			JOIN owned o ON o.suffix = s.suffix
			ORDER BY d.domain, o.precedence
		)`;
}

const publisherCategories = textList([...CONTENT_PUBLISHER_CATEGORIES]);

/** Must answer what `resolveOwnedPageClass` would for the page's owner and stored class. */
const resolvedCategory = sql`coalesce(o.owner, j.static_category)`;
const resolvedPageType = sql`CASE
	WHEN j.page_type = 'other' AND ${resolvedCategory} = ANY(${publisherCategories}) THEN 'article'
	ELSE j.page_type
END`;

/**
 * `pages`: each page the scope cites, Google surfaces aside, with its citations
 * and its class for this brand. `where` narrows the brand's pages (`j`).
 */
function classifiedPages(scope: AnalyticsScope, owned: OwnedDomains, where: SQL = sql`TRUE`): SQL {
	return sql`
		cited AS (
			SELECT page_id, sum(citations)::int AS count, sum(position_sum)::int AS position_sum
			FROM rollup_citation_urls
			WHERE ${rollupScope(scope)}
			GROUP BY page_id
		),
		${ownersCte(owned, sql`SELECT DISTINCT domain FROM rollup_citation_pages WHERE brand_id = ${scope.brandId}`)},
		pages AS (
			SELECT
				c.page_id, c.count, c.position_sum, j.url, j.domain, j.title,
				${resolvedCategory} AS category,
				${resolvedPageType} AS page_type
			FROM cited c
			JOIN rollup_citation_pages j ON j.brand_id = ${scope.brandId} AND j.page_id = c.page_id
			LEFT JOIN owners o ON o.domain = j.domain
			WHERE j.static_category <> ${GOOGLE_STATIC_CATEGORY} AND ${where}
		)`;
}

function urlFilter(filter: CitationUrlFilter): { pages: SQL; classes: SQL } {
	const search = filter.search?.trim();
	const pages = search
		? sql`(j.url ILIKE ${containing(search)} OR j.title ILIKE ${containing(search)} OR j.domain ILIKE ${containing(search)})`
		: sql`TRUE`;
	const category = filter.category ? sql`AND category = ${filter.category}` : sql``;
	const pageType = filter.pageType ? sql`AND page_type = ${filter.pageType}` : sql``;
	return { pages, classes: sql`TRUE ${category} ${pageType}` };
}

async function pageDetails(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	pageIds: number[],
): Promise<Map<number, { promptCount: number; isNew: boolean }>> {
	if (pageIds.length === 0) return new Map();
	const rows = await queryPg<{ page_id: number; prompt_count: number; cited_before: boolean }>(sql`
		WITH
			current AS (
				SELECT page_id, count(DISTINCT prompt_id)::int AS prompt_count
				FROM rollup_citation_urls
				WHERE ${rollupScope(scope)} AND page_id = ANY(${idList(pageIds)})
				GROUP BY page_id
			),
			earlier AS (
				SELECT DISTINCT page_id
				FROM rollup_citation_urls
				WHERE ${rollupScope(previous)} AND page_id = ANY(${idList(pageIds)})
			)
		SELECT c.page_id, c.prompt_count, e.page_id IS NOT NULL AS cited_before
		FROM current c
		LEFT JOIN earlier e ON e.page_id = c.page_id
	`);
	return new Map(rows.map((row) => [Number(row.page_id), { promptCount: row.prompt_count, isNew: !row.cited_before }]));
}

async function withPageDetails(
	rows: (Omit<CitationUrlListRow, "prompt_count" | "is_new"> & { page_id: number })[],
	scope: AnalyticsScope,
	previous: AnalyticsScope,
): Promise<CitationUrlListRow[]> {
	const details = await pageDetails(
		scope,
		previous,
		rows.map((row) => Number(row.page_id)),
	);
	return rows.map(({ page_id, ...row }) => ({
		...row,
		prompt_count: details.get(Number(page_id))?.promptCount ?? 0,
		is_new: details.get(Number(page_id))?.isNew ?? true,
	}));
}

/** The total is counted apart from the page, so a page past the end still reports it. */
export async function pageOf<T>(ctes: SQL, matched: SQL, order: SQL, limit: number, offset: number) {
	const [row] = await queryPg<{ total: number; rows: T[] }>(sql`
		WITH ${ctes}, matched AS (${matched})
		SELECT
			(SELECT count(*) FROM matched)::int AS total,
			coalesce(
				(SELECT json_agg(m ORDER BY ${order}) FROM (SELECT * FROM matched ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}) m),
				'[]'
			) AS rows
	`);
	return { rows: row?.rows ?? [], total: Number(row?.total ?? 0) };
}

export async function getCitationUrlPage(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	owned: OwnedDomains,
	filter: CitationUrlFilter,
	limit: number,
	offset: number,
): Promise<{ rows: CitationUrlListRow[]; total: number }> {
	const { pages, classes } = urlFilter(filter);
	const { rows, total } = await pageOf<Omit<CitationUrlListRow, "prompt_count" | "is_new"> & { page_id: number }>(
		classifiedPages(scope, owned, pages),
		sql`
			SELECT
				page_id, url, domain, title, category, page_type, count,
				round(position_sum::numeric / NULLIF(count, 0), 1)::float AS avg_position
			FROM pages
			WHERE ${classes}`,
		sql`count DESC, url`,
		limit,
		offset,
	);
	return { rows: await withPageDetails(rows, scope, previous), total };
}

/**
 * `domains`: every domain cited in either window, Google surfaces aside. A domain
 * takes its category and example title from its most cited page, so one that is
 * mostly review articles reads as editorial rather than falling to "other".
 */
function domainStats(previous: AnalyticsScope): SQL {
	return sql`
		domain_totals AS (SELECT domain, sum(count)::int AS count FROM pages GROUP BY domain),
		domain_tops AS (
			SELECT DISTINCT ON (domain) domain, category, title, count AS top_count, url AS top_url
			FROM pages
			ORDER BY domain, count DESC, url
		),
		domain_earlier AS (
			SELECT p.domain, sum(r.citations)::int AS count
			FROM rollup_citation_urls r
			JOIN rollup_citation_pages p ON p.brand_id = r.brand_id AND p.page_id = r.page_id
			WHERE ${rollupScope(previous, "r")} AND p.static_category <> ${GOOGLE_STATIC_CATEGORY}
			GROUP BY p.domain
		),
		domains AS (
			SELECT
				coalesce(t.domain, e.domain) AS domain,
				coalesce(t.count, 0)::int AS count,
				tops.category,
				tops.title AS example_title,
				coalesce(e.count, 0)::int AS previous_count,
				tops.top_count,
				tops.top_url
			FROM domain_totals t
			JOIN domain_tops tops ON tops.domain = t.domain
			FULL JOIN domain_earlier e ON e.domain = t.domain
		)`;
}

const domainOrder = sql`count DESC, top_count DESC, top_url, domain`;

const isReddit = (domain: SQL) => sql`(${domain} = 'reddit.com' OR ${domain} LIKE '%.reddit.com')`;

export async function getCitationSummary(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	owned: OwnedDomains,
	options: { minCount: number; limit: number },
): Promise<CitationSummary> {
	const { minCount, limit } = options;
	const [row] = await queryPg<{
		classes: CitationClassTotalRow[] | null;
		unique_domains: number;
		new_urls: (Omit<CitationUrlListRow, "prompt_count" | "is_new"> & { page_id: number })[] | null;
		dropped_urls: DroppedCitationPageRow[] | null;
		new_domains: CitationDomainStatsRow[] | null;
		dropped_domains: CitationDomainStatsRow[] | null;
		reddit_pages: RedditPageRow[] | null;
	}>(sql`
		WITH
			${classifiedPages(scope, owned)},
			earlier AS (
				SELECT page_id, sum(citations)::int AS count
				FROM rollup_citation_urls
				WHERE ${rollupScope(previous)}
				GROUP BY page_id
			),
			${domainStats(previous)}
		SELECT
			(
				SELECT json_agg(t) FROM (
					SELECT category, page_type, sum(count)::int AS count FROM pages GROUP BY category, page_type
				) t
			) AS classes,
			(SELECT count(*) FROM domain_totals)::int AS unique_domains,
			(
				SELECT json_agg(n) FROM (
					SELECT
						p.page_id, p.url, p.domain, p.title, p.category, p.page_type, p.count,
						round(p.position_sum::numeric / NULLIF(p.count, 0), 1)::float AS avg_position
					FROM pages p
					WHERE p.count >= ${minCount} AND NOT EXISTS (SELECT 1 FROM earlier e WHERE e.page_id = p.page_id)
					ORDER BY p.count DESC, p.url
					LIMIT ${limit}
				) n
			) AS new_urls,
			(
				SELECT json_agg(d) FROM (
					SELECT
						rp.url, rp.domain, rp.static_category, rp.page_type,
						e.count AS previous_count, coalesce(c.count, 0)::int AS current_count
					FROM earlier e
					LEFT JOIN cited c ON c.page_id = e.page_id
					JOIN rollup_citation_pages rp ON rp.brand_id = ${scope.brandId} AND rp.page_id = e.page_id
					WHERE e.count >= ${minCount}
						AND coalesce(c.count, 0) * 2 <= e.count
						AND rp.static_category <> ${GOOGLE_STATIC_CATEGORY}
					ORDER BY e.count DESC, rp.url
					LIMIT ${limit}
				) d
			) AS dropped_urls,
			(
				SELECT json_agg(d) FROM (
					SELECT domain, count, category, example_title, previous_count FROM domains
					WHERE previous_count = 0 AND count >= ${minCount}
					ORDER BY ${domainOrder}
					LIMIT ${limit}
				) d
			) AS new_domains,
			(
				SELECT json_agg(d) FROM (
					SELECT domain, count, category, example_title, previous_count FROM domains
					WHERE count = 0 AND previous_count >= ${minCount}
					ORDER BY previous_count DESC, domain
					LIMIT ${limit}
				) d
			) AS dropped_domains,
			(
				SELECT json_agg(r) FROM (
					SELECT p.url, p.title, p.count, NOT EXISTS (SELECT 1 FROM earlier e WHERE e.page_id = p.page_id) AS is_new
					FROM pages p
					WHERE ${isReddit(sql`p.domain`)}
					ORDER BY p.count DESC, p.url
				) r
			) AS reddit_pages
	`);
	return {
		classes: row?.classes ?? [],
		uniqueDomains: Number(row?.unique_domains ?? 0),
		newUrls: await withPageDetails(row?.new_urls ?? [], scope, previous),
		droppedUrls: row?.dropped_urls ?? [],
		newDomains: row?.new_domains ?? [],
		droppedDomains: row?.dropped_domains ?? [],
		redditPages: row?.reddit_pages ?? [],
	};
}

export async function getCitationDomainPage(
	scope: AnalyticsScope,
	previous: AnalyticsScope,
	owned: OwnedDomains,
	filter: { category?: string; search?: string },
	limit: number,
	offset: number,
): Promise<{ rows: CitationDomainStatsRow[]; total: number }> {
	const search = filter.search?.trim();
	const ctes = sql`
		${classifiedPages(scope, owned, search ? sql`j.domain ILIKE ${containing(search)}` : sql`TRUE`)},
		${domainStats(previous)}`;
	return pageOf<CitationDomainStatsRow & { top_count: number; top_url: string }>(
		ctes,
		sql`
			SELECT domain, count, category, example_title, previous_count, top_count, top_url
			FROM domains
			WHERE count > 0 ${filter.category ? sql`AND category = ${filter.category}` : sql``}`,
		domainOrder,
		limit,
		offset,
	).then(({ rows, total }) => ({
		rows: rows.map(({ top_count: _count, top_url: _url, ...row }) => row),
		total,
	}));
}

export async function getCitationTotals(
	scope: AnalyticsScope,
): Promise<{ citations: number; uniqueDomains: number; uniqueUrls: number }> {
	const [row] = await queryPg<{ citations: number; unique_domains: number; unique_urls: number }>(sql`
		WITH cited AS (
			SELECT page_id, sum(citations)::int AS count
			FROM rollup_citation_urls
			WHERE ${rollupScope(scope)}
			GROUP BY page_id
		)
		SELECT
			coalesce(sum(c.count), 0)::int AS citations,
			count(DISTINCT p.domain)::int AS unique_domains,
			count(*)::int AS unique_urls
		FROM cited c
		JOIN rollup_citation_pages p ON p.brand_id = ${scope.brandId} AND p.page_id = c.page_id
		WHERE p.static_category <> ${GOOGLE_STATIC_CATEGORY}
	`);
	return {
		citations: Number(row?.citations ?? 0),
		uniqueDomains: Number(row?.unique_domains ?? 0),
		uniqueUrls: Number(row?.unique_urls ?? 0),
	};
}

export async function getDomainPromptCounts(scope: AnalyticsScope, domains: string[]): Promise<Map<string, number>> {
	if (domains.length === 0) return new Map();
	const rows = await queryPg<{ domain: string; prompt_count: number }>(sql`
		SELECT p.domain, count(DISTINCT r.prompt_id)::int AS prompt_count
		FROM rollup_citation_urls r
		JOIN rollup_citation_pages p ON p.brand_id = r.brand_id AND p.page_id = r.page_id
		WHERE ${rollupScope(scope, "r")} AND p.domain = ANY(${textList(domains)})
		GROUP BY p.domain
	`);
	return new Map(rows.map((row) => [row.domain, Number(row.prompt_count)]));
}

// Subdomains match by suffix as `inDomainSet` does; Google surfaces are left out as everywhere else on the Citations page.
export async function getCitationFlowRows(scope: AnalyticsScope, domain: string): Promise<CitationFlowRow[]> {
	return queryPg<CitationFlowRow>(sql`
		SELECT r.model, p.url, p.title, sum(r.citations)::int AS count
		FROM rollup_citation_urls r
		JOIN rollup_citation_pages p ON p.brand_id = r.brand_id AND p.page_id = r.page_id
		WHERE ${rollupScope(scope, "r")}
			AND (r.domain = ${domain} OR right(r.domain, ${domain.length + 1}) = ${`.${domain}`})
			AND p.static_category <> ${GOOGLE_STATIC_CATEGORY}
		GROUP BY r.model, r.page_id, p.url, p.title
		ORDER BY count DESC
	`);
}
