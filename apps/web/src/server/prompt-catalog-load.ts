import { db } from "@workspace/lib/db/db";
import { type Prompt, prompts } from "@workspace/lib/db/schema";
import { and, asc, count, desc, eq, ilike, type SQL, sql } from "drizzle-orm";
import { PROMPT_CATALOG_PAGE_SIZE, PROMPT_CATALOG_TAG_LIMIT, type PromptCatalogQuery } from "@/lib/prompt-catalog";

export interface PromptCatalogPage {
	rows: Prompt[];
	/** Rows matching the current filter, across every page. */
	total: number;
	/** The page actually served: the requested one, clamped to the last page that exists. */
	page: number;
	pageSize: number;
	totalPages: number;
	/** Whole-brand figures, independent of the filter. */
	brand: { total: number; enabled: number };
	/** Distinct user tags of the brand, alphabetical, capped at PROMPT_CATALOG_TAG_LIMIT. */
	tagOptions: string[];
}

/** `%` and `_` are wildcards inside LIKE; a search for them has to mean the characters. */
function escapeLike(term: string): string {
	return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function promptCatalogWhere(brandId: string, search: Pick<PromptCatalogQuery, "q" | "tag" | "status">): SQL {
	const conditions: SQL[] = [eq(prompts.brandId, brandId)];
	if (search.q) conditions.push(ilike(prompts.value, `%${escapeLike(search.q)}%`));
	if (search.tag) conditions.push(sql`${prompts.tags} @> ARRAY[${search.tag}]::text[]`);
	if (search.status === "enabled") conditions.push(eq(prompts.enabled, true));
	if (search.status === "disabled") conditions.push(eq(prompts.enabled, false));
	return and(...conditions) as SQL;
}

/**
 * One page of a brand's catalog with the counts that page needs. Three
 * queries — the filtered count with the brand totals, the page, the tag
 * list — and nothing sized by the catalog crosses to the caller.
 *
 * The order is the one the editor has always shown (text, then enabled first,
 * then id), and the id makes it total: two prompts with the same text and
 * state cannot swap pages between requests.
 */
export async function loadPromptCatalogPage(brandId: string, search: PromptCatalogQuery): Promise<PromptCatalogPage> {
	const where = promptCatalogWhere(brandId, search);

	const [counts] = await db
		.select({
			total: count(),
			brandTotal: sql<number>`(select count(*) from ${prompts} where ${prompts.brandId} = ${brandId})`.mapWith(Number),
			brandEnabled:
				sql<number>`(select count(*) from ${prompts} where ${prompts.brandId} = ${brandId} and ${prompts.enabled})`.mapWith(
					Number,
				),
		})
		.from(prompts)
		.where(where);

	const total = counts?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PROMPT_CATALOG_PAGE_SIZE));
	const page = Math.min(search.page, totalPages);

	const [rows, tagRows] = await Promise.all([
		db
			.select()
			.from(prompts)
			.where(where)
			.orderBy(asc(prompts.value), desc(prompts.enabled), asc(prompts.id))
			.limit(PROMPT_CATALOG_PAGE_SIZE)
			.offset((page - 1) * PROMPT_CATALOG_PAGE_SIZE),
		db.execute<{ tag: string }>(
			sql`select distinct t.tag from ${prompts}, unnest(${prompts.tags}) as t(tag) where ${prompts.brandId} = ${brandId} order by t.tag limit ${PROMPT_CATALOG_TAG_LIMIT}`,
		),
	]);

	return {
		rows,
		total,
		page,
		pageSize: PROMPT_CATALOG_PAGE_SIZE,
		totalPages,
		brand: { total: counts?.brandTotal ?? 0, enabled: counts?.brandEnabled ?? 0 },
		tagOptions: tagRows.rows.map((row) => row.tag),
	};
}
