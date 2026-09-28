import { normalizeTag } from "@workspace/lib/tag-utils";
import { z } from "zod";

/** Rows per catalog page. 10 000 prompts are 200 pages, which plain OFFSET paging handles. */
export const PROMPT_CATALOG_PAGE_SIZE = 50;

/** Most tag suggestions the catalog hands the browser, for the filter and the row inputs alike. */
export const PROMPT_CATALOG_TAG_LIMIT = 50;

export const PROMPT_STATUS_FILTERS = ["all", "enabled", "disabled"] as const;
export type PromptStatusFilter = (typeof PROMPT_STATUS_FILTERS)[number];

/**
 * The catalog's resolved query: what the loader asks the server for. Defaults
 * are the unfiltered first page.
 */
export const promptCatalogQuerySchema = z.object({
	page: z.coerce.number().int().min(1).catch(1),
	q: z.string().trim().max(200).catch(""),
	tag: z.string().trim().max(100).transform(normalizeTag).catch(""),
	status: z.enum(PROMPT_STATUS_FILTERS).catch("all"),
});
export type PromptCatalogQuery = z.infer<typeof promptCatalogQuerySchema>;

/**
 * The catalog's URL state: the query with its defaults left out, so every key
 * is optional, the plain settings URL keeps working, links to the page need no
 * search, and a filtered page is still a shareable link.
 */
export type PromptCatalogSearch = Partial<PromptCatalogQuery>;

export function validatePromptCatalogSearch(raw: Record<string, unknown>): PromptCatalogSearch {
	const query = promptCatalogQuerySchema.parse(raw);
	return {
		...(query.page > 1 ? { page: query.page } : {}),
		...(query.q ? { q: query.q } : {}),
		...(query.tag ? { tag: query.tag } : {}),
		...(query.status !== "all" ? { status: query.status } : {}),
	};
}

export function resolvePromptCatalogQuery(search: PromptCatalogSearch): PromptCatalogQuery {
	return { page: search.page ?? 1, q: search.q ?? "", tag: search.tag ?? "", status: search.status ?? "all" };
}
