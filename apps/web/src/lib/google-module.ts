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
	attributeProduct,
	isGoogleSearchUrl,
	isGoogleShoppingUrl,
	type ProductAttribution,
	parseGoogleProductName,
	parseGoogleSearchQuery,
} from "@workspace/lib/citations/domain-categories";

/** Minimal per-prompt cited-page row this builder needs (a structural subset of
 *  `PerPromptCitationPageRow`). */
export interface GoogleModulePageRow {
	prompt_id: string;
	url: string | null;
	domain: string;
	title: string | null;
	count: number;
}

type GooglePromptRef = { id: string; count: number };
type GoogleProduct = {
	name: string;
	count: number;
	attribution: ProductAttribution["kind"];
	competitorName?: string;
	prompts: GooglePromptRef[];
};
type GoogleQuery = { query: string; count: number; prompts: GooglePromptRef[] };
export type GoogleModule = {
	shopping: {
		totalCitations: number;
		brandCount: number;
		competitorCount: number;
		productCounts: { all: number; brand: number; competitor: number };
		products: GoogleProduct[];
	};
	search: { totalCitations: number; queryCount: number; queries: GoogleQuery[] };
	promptValues: Record<string, string>;
};

export const emptyGoogleModule = (): GoogleModule => ({
	shopping: {
		totalCitations: 0,
		brandCount: 0,
		competitorCount: 0,
		productCounts: { all: 0, brand: 0, competitor: 0 },
		products: [],
	},
	search: { totalCitations: 0, queryCount: 0, queries: [] },
	promptValues: {},
});

type ProductAgg = {
	name: string;
	count: number;
	attribution: ProductAttribution;
	prompts: Map<string, number>;
};
type QueryAgg = { query: string; count: number; prompts: Map<string, number> };

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
			};
			product.count += count;
			addPromptCount(product.prompts, row.prompt_id, count);
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

	const promptValues: Record<string, string> = {};
	const promptRefs = (m: Map<string, number>): GooglePromptRef[] =>
		[...m.entries()]
			.flatMap(([id, count]) => {
				const value = promptValue(id);
				if (!value) return [];
				promptValues[id] = value;
				return [{ id, count }];
			})
			.sort((a, b) => b.count - a.count);

	const allProducts = [...productByKey.values()].sort((a, b) => b.count - a.count);
	const allQueries = [...queryByKey.values()].sort((a, b) => b.count - a.count);
	const attributed = (kind: ProductAttribution["kind"]) => allProducts.filter((p) => p.attribution.kind === kind);
	const total = (rows: { count: number }[]) => rows.reduce((sum, row) => sum + row.count, 0);

	const products: GoogleProduct[] = allProducts.map((e) => ({
		name: e.name,
		count: e.count,
		attribution: e.attribution.kind,
		competitorName: e.attribution.kind === "competitor" ? e.attribution.competitorName : undefined,
		prompts: promptRefs(e.prompts),
	}));

	const queries: GoogleQuery[] = allQueries.map((e) => ({
		query: e.query,
		count: e.count,
		prompts: promptRefs(e.prompts),
	}));

	return {
		shopping: {
			totalCitations: total(allProducts),
			brandCount: total(attributed("brand")),
			competitorCount: total(attributed("competitor")),
			productCounts: {
				all: allProducts.length,
				brand: attributed("brand").length,
				competitor: attributed("competitor").length,
			},
			products,
		},
		search: {
			totalCitations: total(allQueries),
			queryCount: allQueries.length,
			queries,
		},
		promptValues,
	};
}

export function googleModuleTotals(module: GoogleModule): GoogleModule {
	return {
		shopping: { ...module.shopping, products: [] },
		search: { ...module.search, queries: [] },
		promptValues: {},
	};
}

export type GoogleProductFilter = "all" | ProductAttribution["kind"];

export function pageGoogleList(
	module: GoogleModule,
	list: { kind: "products"; filter: GoogleProductFilter } | { kind: "queries" },
	offset: number,
	limit: number,
) {
	const rows: (GoogleProduct | GoogleQuery)[] =
		list.kind === "queries"
			? module.search.queries
			: module.shopping.products.filter((product) => list.filter === "all" || product.attribution === list.filter);
	const items = rows.slice(offset, offset + limit);
	const promptValues: Record<string, string> = {};
	for (const item of items) {
		for (const prompt of item.prompts) promptValues[prompt.id] = module.promptValues[prompt.id];
	}
	return { items, total: rows.length, promptValues };
}
