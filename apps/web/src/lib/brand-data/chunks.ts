/**
 * A brand's data as independently versioned chunks: its entities, every rollup
 * table by UTC month, and its cited pages by id range. A rollup refresh rewrites
 * recent buckets, so a sync usually fetches only the current month's chunks.
 * Each chunk carries its own dictionaries; `assembleBundle` merges them.
 */
import {
	BRAND_BUNDLE_FORMAT,
	type BrandBundle,
	type BundleBrand,
	type BundleCompetitor,
	type BundlePrompt,
} from "@/lib/brand-data/bundle";

export const RUN_TABLES = ["promptRuns", "competitorMentions", "webQueries", "sentimentQuotes", "citations"] as const;
export type RunTable = (typeof RUN_TABLES)[number];

export interface ChunkManifestEntry {
	id: string;
	hash: string;
}

export interface EntitiesChunk {
	kind: "entities";
	brand: BundleBrand;
	competitors: BundleCompetitor[];
	prompts: BundlePrompt[];
	apiProviderIds: string[];
}

/** Columns keyed by name; string-valued keys are indexes into `dicts`. */
export interface RunChunk {
	kind: "run";
	table: RunTable;
	dicts: Record<string, string[]>;
	columns: Record<string, (number | string | null)[]>;
}

export interface PagesChunk {
	kind: "pages";
	dicts: Record<string, string[]>;
	columns: Record<string, (number | string | null)[]>;
}

export interface BrandChunk {
	id: string;
	hash: string;
	data: EntitiesChunk | RunChunk | PagesChunk;
}

/** Which dictionary each dictionary-encoded column draws from. */
export const DICTIONARY_COLUMNS: Record<string, string> = {
	prompt: "promptIds",
	model: "models",
	provider: "providers",
	competitor: "competitors",
	query: "queries",
	sentiment: "sentiments",
	domain: "domains",
	pageType: "pageTypes",
	category: "categories",
};

export const isCitationChunk = (id: string) => id.startsWith("citations:") || id.startsWith("pages:");

function dictionary(initial: string[] = []) {
	const index = new Map(initial.map((value, i) => [value, i]));
	const values = [...initial];
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

const emptyKeys = () => ({
	bucket: [] as number[],
	prompt: [] as number[],
	model: [] as number[],
	provider: [] as number[],
	web: [] as number[],
});

/** Merges chunks into the single bundle the in-memory reads expect. */
export function assembleBundle(brandId: string, version: string, chunks: Iterable<BrandChunk>): BrandBundle | null {
	const all = [...chunks];
	const entities = all.find((chunk) => chunk.data.kind === "entities")?.data as EntitiesChunk | undefined;
	if (!entities) return null;
	const promptIndex = new Map(entities.prompts.map((prompt, i) => [prompt.id, i]));
	const dicts = {
		models: dictionary(),
		providers: dictionary(),
		competitors: dictionary(),
		queries: dictionary(),
		domains: dictionary(),
		pageTypes: dictionary(),
		categories: dictionary(),
		sentiments: dictionary(),
	};
	const bundle: BrandBundle = {
		format: BRAND_BUNDLE_FORMAT,
		brandId,
		version,
		apiProviderIds: entities.apiProviderIds,
		brand: entities.brand,
		competitors: entities.competitors,
		prompts: entities.prompts,
		dicts: {
			models: dicts.models.values,
			providers: dicts.providers.values,
			competitors: dicts.competitors.values,
			queries: dicts.queries.values,
			domains: dicts.domains.values,
			pageTypes: dicts.pageTypes.values,
			categories: dicts.categories.values,
			sentiments: dicts.sentiments.values,
		},
		promptRuns: {
			...emptyKeys(),
			runs: [],
			brandMentioned: [],
			competitorRuns: [],
			competitorMentions: [],
			noMention: [],
			fanoutRuns: [],
			fanoutQueries: [],
			firstRunAt: [],
			lastRunAt: [],
			positive: [],
			neutral: [],
			negative: [],
			mixed: [],
			positionSum: [],
			positioned: [],
		},
		competitorMentions: {
			...emptyKeys(),
			competitor: [],
			runs: [],
			positive: [],
			neutral: [],
			negative: [],
			mixed: [],
			positionSum: [],
			positioned: [],
		},
		webQueries: { ...emptyKeys(), query: [], runs: [], brandMentioned: [] },
		citations: { ...emptyKeys(), page: [], citations: [], positionSum: [] },
		citationPages: { id: [], url: [], domain: [], title: [], pageType: [], category: [] },
		sentimentQuotes: { ...emptyKeys(), sentiment: [], runId: [], confidence: [], createdAt: [] },
	};

	// Pages first, ordered by URL so URL-ordered reads need no sort.
	const pageRows: {
		id: number;
		url: string;
		domain: string;
		title: string | null;
		pageType: string;
		category: string;
	}[] = [];
	for (const chunk of all) {
		if (chunk.data.kind !== "pages") continue;
		const { columns, dicts: local } = chunk.data;
		for (let i = 0; i < columns.id.length; i++) {
			pageRows.push({
				id: columns.id[i] as number,
				url: columns.url[i] as string,
				domain: local.domains[columns.domain[i] as number],
				title: columns.title[i] as string | null,
				pageType: local.pageTypes[columns.pageType[i] as number],
				category: local.categories[columns.category[i] as number],
			});
		}
	}
	pageRows.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : a.id - b.id));
	const pageIndex = new Map<number, number>();
	for (const page of pageRows) {
		pageIndex.set(page.id, bundle.citationPages.id.length);
		bundle.citationPages.id.push(page.id);
		bundle.citationPages.url.push(page.url);
		bundle.citationPages.domain.push(dicts.domains.id(page.domain));
		bundle.citationPages.title.push(page.title);
		bundle.citationPages.pageType.push(dicts.pageTypes.id(page.pageType));
		bundle.citationPages.category.push(dicts.categories.id(page.category));
	}

	// Months in order keep every table sorted by bucket.
	const runChunks = all
		.filter((chunk): chunk is BrandChunk & { data: RunChunk } => chunk.data.kind === "run")
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	for (const chunk of runChunks) {
		const { table, columns, dicts: local } = chunk.data;
		if (table === "citations" && pageIndex.size === 0) continue;
		const target = bundle[table] as unknown as Record<string, (number | string | null)[]>;
		const n = (columns.bucket ?? []).length;
		const keep: boolean[] = new Array(n);
		for (let i = 0; i < n; i++) {
			const prompt = promptIndex.get(local.promptIds[columns.prompt[i] as number]);
			const page = table === "citations" ? pageIndex.get(columns.page[i] as number) : 0;
			keep[i] = prompt !== undefined && page !== undefined;
		}
		for (const [name, values] of Object.entries(columns)) {
			const out = target[name];
			if (!out) continue;
			const dictName = DICTIONARY_COLUMNS[name];
			for (let i = 0; i < n; i++) {
				if (!keep[i]) continue;
				const value = values[i];
				if (name === "prompt") out.push(promptIndex.get(local.promptIds[value as number]) as number);
				else if (name === "page" && table === "citations") out.push(pageIndex.get(value as number) as number);
				else if (dictName) out.push(dicts[dictName as keyof typeof dicts].id(local[dictName][value as number]));
				else out.push(value);
			}
		}
	}
	return bundle;
}

/** The version of everything the chunks hold, so a status check needs only the manifest. */
export function manifestVersion(manifest: ChunkManifestEntry[]): string {
	let hash = 0;
	for (const { id, hash: chunkHash } of [...manifest].sort((a, b) => (a.id < b.id ? -1 : 1))) {
		for (const char of `${id}=${chunkHash};`) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
	}
	return (hash >>> 0).toString(36);
}
