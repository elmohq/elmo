/** Rollup tables are chunked by UTC month because a refresh rewrites recent buckets, so a sync usually refetches only the current month. */
import type { BrandBundle, BundleBrand, BundleCompetitor, BundlePrompt } from "@/lib/brand-data/bundle";

/** Bump when a chunk's shape changes; browsers drop copies in any other format. */
export const BRAND_DATA_FORMAT = 1;

export const RUN_TABLES = ["promptRuns", "competitorMentions", "webQueries", "sentimentQuotes", "citations"] as const;
export type RunTable = (typeof RUN_TABLES)[number];

export interface ChunkManifestEntry {
	id: string;
	hash: string;
}

export interface ChunkManifest {
	format: number;
	chunks: ChunkManifestEntry[];
}

export interface EntitiesChunk {
	kind: "entities";
	brand: BundleBrand;
	competitors: BundleCompetitor[];
	prompts: BundlePrompt[];
	apiProviderIds: string[];
}

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

type Dictionaries = Record<keyof BrandBundle["dicts"], ReturnType<typeof dictionary>>;

function appendPages(bundle: BrandBundle, dicts: Dictionaries, chunks: BrandChunk[]): Map<number, number> {
	const pageRows: {
		id: number;
		url: string;
		domain: string;
		title: string | null;
		pageType: string;
		category: string;
	}[] = [];
	for (const chunk of chunks) {
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
	const pages = bundle.citationPages;
	for (const page of pageRows) {
		pageIndex.set(page.id, pages.id.length);
		pages.id.push(page.id);
		pages.url.push(page.url);
		pages.domain.push(dicts.domains.id(page.domain));
		pages.title.push(page.title);
		pages.pageType.push(dicts.pageTypes.id(page.pageType));
		pages.category.push(dicts.categories.id(page.category));
	}
	return pageIndex;
}

function columnMapper(
	name: string,
	values: (number | string | null)[],
	context: {
		dicts: Dictionaries;
		local: Record<string, string[]>;
		prompts: (number | undefined)[];
		pages: (number | undefined)[] | null;
	},
): (i: number) => number | string | null {
	const { dicts, local, prompts, pages } = context;
	if (name === "prompt") return (i) => prompts[i] as number;
	if (name === "page" && pages) return (i) => pages[i] as number;
	const dictName = DICTIONARY_COLUMNS[name] as keyof Dictionaries | "promptIds" | undefined;
	if (!dictName || dictName === "promptIds") return (i) => values[i];
	return (i) => dicts[dictName].id(local[dictName][values[i] as number]);
}

function appendRuns(
	bundle: BrandBundle,
	dicts: Dictionaries,
	chunk: RunChunk,
	promptIndex: Map<string, number>,
	pageIndex: Map<number, number>,
) {
	const { table, columns, dicts: local } = chunk;
	const target = bundle[table] as unknown as Record<string, (number | string | null)[]>;
	const n = (columns.bucket ?? []).length;
	const prompts = (columns.prompt ?? []).map((value) => promptIndex.get(local.promptIds[value as number]));
	const pages = table === "citations" ? columns.page.map((value) => pageIndex.get(value as number)) : null;
	const keep = (i: number) => prompts[i] !== undefined && (!pages || pages[i] !== undefined);
	for (const [name, values] of Object.entries(columns)) {
		const out = target[name];
		if (!out) continue;
		const map = columnMapper(name, values, { dicts, local, prompts, pages });
		for (let i = 0; i < n; i++) if (keep(i)) out.push(map(i));
	}
}

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

	const pageIndex = appendPages(bundle, dicts, all);
	const runChunks = all
		.filter((chunk): chunk is BrandChunk & { data: RunChunk } => chunk.data.kind === "run")
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	for (const chunk of runChunks) {
		if (chunk.data.table === "citations" && pageIndex.size === 0) continue;
		appendRuns(bundle, dicts, chunk.data, promptIndex, pageIndex);
	}
	return bundle;
}

export function manifestVersion(manifest: ChunkManifestEntry[]): string {
	let hash = 0;
	for (const { id, hash: chunkHash } of [...manifest].sort((a, b) => (a.id < b.id ? -1 : 1))) {
		for (const char of `${id}=${chunkHash};`) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
	}
	return (hash >>> 0).toString(36);
}
