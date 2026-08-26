/**
 * Google AI Mode module builder.
 *
 * Shopping product cards and search links Google AI Mode surfaces aren't external
 * citations in the traditional sense (they point back into Google's own results),
 * so they're pulled OUT of the citation source mix and surfaced here instead —
 * products attributed brand-vs-competitor by name, and searches, each tied to the
 * prompts that triggered them. Shared by the brand-wide citations view and the
 * per-prompt detail view so both render the same Google Shopping section.
 */
import {
	type ProductAttribution,
	isGoogleShoppingUrl,
	isGoogleSearchUrl,
	parseGoogleProductName,
	parseGoogleSearchQuery,
	attributeProduct,
} from "@/lib/domain-categories";

/** Minimal per-prompt cited-page row this builder needs (a structural subset of
 *  `PerPromptCitationPageRow`). */
export interface GoogleModulePageRow {
	prompt_id: string;
	url: string | null;
	domain: string;
	title: string | null;
	count: number;
}

export type GooglePromptRef = { id: string; value: string; count: number };
export type GoogleProduct = {
	name: string;
	count: number;
	attribution: ProductAttribution["kind"];
	competitorName?: string;
	prompts: GooglePromptRef[];
	urls: { url: string; count: number }[];
};
export type GoogleQuery = { query: string; count: number; prompts: GooglePromptRef[] };
export type GoogleModule = {
	shopping: { totalCitations: number; brandCount: number; competitorCount: number; products: GoogleProduct[] };
	search: { totalCitations: number; queries: GoogleQuery[] };
};

export const emptyGoogleModule = (): GoogleModule => ({
	shopping: { totalCitations: 0, brandCount: 0, competitorCount: 0, products: [] },
	search: { totalCitations: 0, queries: [] },
});

type ProductAgg = {
	name: string;
	count: number;
	attribution: ProductAttribution;
	prompts: Map<string, number>;
	urls: Map<string, number>;
};
type QueryAgg = { query: string; count: number; prompts: Map<string, number> };

/** Add `count` to `key`'s entry in a per-prompt tally. */
function addPromptCount(byPrompt: Map<string, number>, promptId: string, count: number): void {
	byPrompt.set(promptId, (byPrompt.get(promptId) ?? 0) + count);
}

/**
 * Fold cited Google URLs onto the product or the search query they represent,
 * keyed case-insensitively so the same product cited two ways is one row.
 */
function tallyGooglePages(
	pages: GoogleModulePageRow[],
	brandName: string,
	competitors: { id: string; name: string }[],
): { productByKey: Map<string, ProductAgg>; queryByKey: Map<string, QueryAgg> } {
	const productByKey = new Map<string, ProductAgg>();
	const queryByKey = new Map<string, QueryAgg>();

	for (const row of pages) {
		if (!row.url) continue;
		const count = Number(row.count);

		if (isGoogleShoppingUrl(row.url)) {
			const name = parseGoogleProductName(row.url, row.title);
			if (!name) continue;
			const product = productByKey.get(name.toLowerCase()) ?? {
				name,
				count: 0,
				attribution: attributeProduct(name, brandName, competitors),
				prompts: new Map(),
				urls: new Map(),
			};
			product.count += count;
			addPromptCount(product.prompts, row.prompt_id, count);
			product.urls.set(row.url, (product.urls.get(row.url) ?? 0) + count);
			productByKey.set(name.toLowerCase(), product);
			continue;
		}

		if (!isGoogleSearchUrl(row.url)) continue;
		const query = parseGoogleSearchQuery(row.url);
		if (!query) continue;
		const entry = queryByKey.get(query.toLowerCase()) ?? { query, count: 0, prompts: new Map() };
		entry.count += count;
		addPromptCount(entry.prompts, row.prompt_id, count);
		queryByKey.set(query.toLowerCase(), entry);
	}

	return { productByKey, queryByKey };
}

/**
 * Build the Google AI Mode module from per-prompt cited pages: Shopping products
 * (attributed brand/competitor/other by name) and search queries, each tied to
 * the prompts that triggered them.
 */
export function buildGoogleModule(
	pages: GoogleModulePageRow[],
	brandName: string,
	competitors: { id: string; name: string }[],
	promptValue: (id: string) => string | undefined,
): GoogleModule {
	const { productByKey, queryByKey } = tallyGooglePages(pages, brandName, competitors);

	const promptRefs = (m: Map<string, number>): GooglePromptRef[] =>
		[...m.entries()]
			.map(([id, count]) => {
				const value = promptValue(id);
				return value ? { id, value, count } : null;
			})
			.filter((p): p is GooglePromptRef => p !== null)
			.sort((a, b) => b.count - a.count);

	const products: GoogleProduct[] = [...productByKey.values()]
		.map((e) => ({
			name: e.name,
			count: e.count,
			attribution: e.attribution.kind,
			competitorName: e.attribution.kind === "competitor" ? e.attribution.competitorName : undefined,
			prompts: promptRefs(e.prompts),
			urls: [...e.urls.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count),
		}))
		.sort((a, b) => b.count - a.count);

	const queries: GoogleQuery[] = [...queryByKey.values()]
		.map((e) => ({ query: e.query, count: e.count, prompts: promptRefs(e.prompts) }))
		.sort((a, b) => b.count - a.count);

	const brandCount = products.filter((p) => p.attribution === "brand").reduce((s, p) => s + p.count, 0);
	const competitorCount = products.filter((p) => p.attribution === "competitor").reduce((s, p) => s + p.count, 0);

	return {
		shopping: {
			totalCitations: products.reduce((s, p) => s + p.count, 0),
			brandCount,
			competitorCount,
			products,
		},
		search: {
			totalCitations: queries.reduce((s, q) => s + q.count, 0),
			queries,
		},
	};
}
