import type { BrandBundle, RunKeyColumns } from "@/lib/brand-data/bundle";
import { type ChunkGroup, isPagesChunk, isUrlsChunk, monthChunkId, monthsOverlapping } from "@/lib/brand-data/chunks";

const ints = (values: number[]) => Int32Array.from(values);
const floats = (values: number[]) => Float64Array.from(values);

interface RunKeys {
	bucket: Int32Array;
	prompt: Int32Array;
	model: Int32Array;
	provider: Int32Array;
	web: Int32Array;
	length: number;
	group: ChunkGroup;
}

function keys(columns: RunKeyColumns, group: ChunkGroup = "runs"): RunKeys {
	return {
		group,
		bucket: ints(columns.bucket),
		prompt: ints(columns.prompt),
		model: ints(columns.model),
		provider: ints(columns.provider),
		web: ints(columns.web),
		length: columns.bucket.length,
	};
}

/** Which of the brand's chunks exist, and which of those the store was assembled from. */
export interface Coverage {
	available: ReadonlySet<string>;
	loaded: ReadonlySet<string>;
}

/** Makes the pages' URLs and titles wait for their chunks while any are still syncing. */
function withPageText<T extends { url: string[]; title: (string | null)[] }>(
	pages: T,
	{ available, loaded }: Coverage,
): T {
	const missing = [...available].filter((id) => isUrlsChunk(id) && !loaded.has(id));
	if (missing.length === 0) return pages;
	const wait = (): never => {
		throw new MissingChunksError(missing);
	};
	return Object.defineProperties(pages, { url: { get: wait }, title: { get: wait } });
}

export function decodeBrandBundle(bundle: BrandBundle, coverage: Coverage) {
	const r = bundle.promptRuns;
	const c = bundle.competitorMentions;
	const w = bundle.webQueries;
	const u = bundle.citations;
	const p = bundle.citationPages;
	const q = bundle.sentimentQuotes;
	return {
		bundle,
		coverage,
		promptIndex: new Map(bundle.prompts.map((prompt, i) => [prompt.id, i])),
		apiProviders: new Set(bundle.dicts.providers.flatMap((id, i) => (bundle.apiProviderIds.includes(id) ? [i] : []))),
		promptRuns: {
			...keys(r),
			runs: ints(r.runs),
			brandMentioned: ints(r.brandMentioned),
			competitorRuns: ints(r.competitorRuns),
			competitorMentions: ints(r.competitorMentions),
			noMention: ints(r.noMention),
			fanoutRuns: ints(r.fanoutRuns),
			fanoutQueries: ints(r.fanoutQueries),
			firstRunAt: floats(r.firstRunAt),
			lastRunAt: floats(r.lastRunAt),
			positive: ints(r.positive),
			neutral: ints(r.neutral),
			negative: ints(r.negative),
			mixed: ints(r.mixed),
			positionSum: ints(r.positionSum),
			positioned: ints(r.positioned),
		},
		competitorMentions: {
			...keys(c),
			competitor: ints(c.competitor),
			runs: ints(c.runs),
			positive: ints(c.positive),
			neutral: ints(c.neutral),
			negative: ints(c.negative),
			mixed: ints(c.mixed),
			positionSum: ints(c.positionSum),
			positioned: ints(c.positioned),
		},
		webQueries: { ...keys(w), query: ints(w.query), runs: ints(w.runs), brandMentioned: ints(w.brandMentioned) },
		citations: {
			...keys(u, "citations"),
			page: ints(u.page),
			citations: ints(u.citations),
			positionSum: ints(u.positionSum),
		},
		citationPages: withPageText(
			{
				id: p.id,
				url: p.url,
				domain: ints(p.domain),
				title: p.title,
				pageType: ints(p.pageType),
				category: ints(p.category),
				length: p.id.length,
			},
			coverage,
		),
		sentimentQuotes: {
			...keys(q),
			sentiment: ints(q.sentiment),
			runId: q.runId,
			confidence: floats(q.confidence),
			createdAt: floats(q.createdAt),
		},
	};
}

export type BrandStore = ReturnType<typeof decodeBrandBundle>;
export type StoreRunKeys = RunKeys;

const MAX_STORES = 3;
const stores = new Map<string, BrandStore>();

/** Returns the brands evicted to stay within `MAX_STORES`, least recently used first. */
export function setBrandStore(store: BrandStore): string[] {
	stores.delete(store.bundle.brandId);
	stores.set(store.bundle.brandId, store);
	const evicted = [...stores.keys()].slice(0, Math.max(0, stores.size - MAX_STORES));
	for (const brandId of evicted) stores.delete(brandId);
	return evicted;
}

export function forgetBrandStore(brandId: string) {
	stores.delete(brandId);
}

export function getBrandStore(brandId: string): BrandStore | undefined {
	const store = stores.get(brandId);
	if (store) {
		stores.delete(brandId);
		stores.set(brandId, store);
	}
	return store;
}

export class MissingChunksError extends Error {
	constructor(readonly chunkIds: string[]) {
		super(`Brand data still syncing: ${chunkIds.join(", ")}`);
	}
}

/** Throws unless every chunk with rows of `group` in `[start, end)` minutes has synced. */
export function requireChunks(store: BrandStore, group: ChunkGroup, start: number, end: number) {
	const { available, loaded } = store.coverage;
	const prefix = `${group}:`;
	const months = [...available].filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
	const needed = monthsOverlapping(months, start, end).map((month) => monthChunkId(group, month));
	if (group === "citations" && needed.length > 0) needed.push(...[...available].filter(isPagesChunk));
	const missing = needed.filter((id) => !loaded.has(id));
	if (missing.length > 0) throw new MissingChunksError(missing);
}
