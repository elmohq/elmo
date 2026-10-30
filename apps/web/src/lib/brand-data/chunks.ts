/**
 * A brand's data is split into chunks the browser syncs one at a time: its entities, each UTC month of rollups,
 * and each range of cited pages. A refresh rewrites recent buckets, so a sync usually refetches only this month.
 */
import type { BrandBundle, BundleBrand, BundleCompetitor, BundlePrompt } from "@/lib/brand-data/bundle";

/** Bump when a chunk's shape changes; browsers drop copies in any other format. */
export const BRAND_DATA_FORMAT = 2;

export const BRAND_DATA_DB_PREFIX = "elmo-brand-data";

export const MONTH_TABLES = {
	runs: ["promptRuns", "competitorMentions", "webQueries", "sentimentQuotes"],
	citations: ["citations"],
} as const;
export type ChunkGroup = keyof typeof MONTH_TABLES;
export type RunTable = (typeof MONTH_TABLES)[ChunkGroup][number];

export interface ChunkManifestEntry {
	id: string;
	version: string;
}

export interface ChunkManifest {
	format: number;
	chunks: ChunkManifestEntry[];
	/** When new data is likely, from the brand's upcoming and running prompt evaluations. */
	nextSyncInSeconds: number;
}

export interface EntitiesChunk {
	kind: "entities";
	brand: BundleBrand;
	competitors: BundleCompetitor[];
	prompts: BundlePrompt[];
	apiProviderIds: string[];
}

type Columns = Record<string, (number | string | null)[]>;

export interface MonthChunk {
	kind: "month";
	dicts: Record<string, string[]>;
	tables: Partial<Record<RunTable, Columns>>;
}

export interface PagesChunk {
	kind: "pages";
	dicts: Record<string, string[]>;
	columns: Columns;
}

export interface BrandChunk {
	id: string;
	version: string;
	data: EntitiesChunk | MonthChunk | PagesChunk;
}

export const ENTITIES_CHUNK = "entities";
export const monthChunkId = (group: ChunkGroup, month: string) => `${group}:${month}`;
export const isPagesChunk = (id: string) => id.startsWith("pages:");

/** The `YYYY-MM` UTC months that overlap `[start, end)`, in minutes since the epoch. */
export function monthsOverlapping(months: Iterable<string>, start: number, end: number): string[] {
	return [...months].filter((month) => {
		const [y, m] = month.split("-").map(Number);
		return Date.UTC(y, m - 1, 1) / 60_000 < end && Date.UTC(y, m, 1) / 60_000 > start;
	});
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
	table: RunTable,
	chunk: MonthChunk,
	indexes: { prompts: Map<string, number>; pages: Map<number, number> },
) {
	const columns = chunk.tables[table];
	if (!columns) return;
	const local = chunk.dicts;
	const target = bundle[table] as unknown as Columns;
	const n = columns.bucket.length;
	const prompts = columns.prompt.map((value) => indexes.prompts.get(local.promptIds[value as number]));
	const pages = table === "citations" ? columns.page.map((value) => indexes.pages.get(value as number)) : null;
	const keep = (i: number) => prompts[i] !== undefined && (!pages || pages[i] !== undefined);
	for (const [name, values] of Object.entries(columns)) {
		const out = target[name];
		if (!out) continue;
		const map = columnMapper(name, values, { dicts, local, prompts, pages });
		for (let i = 0; i < n; i++) if (keep(i)) out.push(map(i));
	}
}

function emptyBundle(brandId: string, entities: EntitiesChunk, dicts: Dictionaries): BrandBundle {
	return {
		brandId,
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
}

/** Merges whichever chunks have synced into one bundle, months in order; null until the entities have. */
export function assembleBundle(brandId: string, chunks: Iterable<BrandChunk>): BrandBundle | null {
	const all = [...chunks];
	const entities = all.find((chunk) => chunk.data.kind === "entities")?.data as EntitiesChunk | undefined;
	if (!entities) return null;
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
	const bundle = emptyBundle(brandId, entities, dicts);
	const indexes = {
		prompts: new Map(entities.prompts.map((prompt, i) => [prompt.id, i])),
		pages: appendPages(bundle, dicts, all),
	};
	const months = all
		.filter((chunk): chunk is BrandChunk & { data: MonthChunk } => chunk.data.kind === "month")
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	for (const chunk of months) {
		for (const table of Object.keys(chunk.data.tables) as RunTable[]) {
			appendRuns(bundle, dicts, table, chunk.data, indexes);
		}
	}
	return bundle;
}
