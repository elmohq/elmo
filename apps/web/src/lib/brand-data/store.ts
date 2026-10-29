import type { BrandBundle, RunKeyColumns } from "@/lib/brand-data/bundle";

const ints = (values: number[]) => Int32Array.from(values);
const floats = (values: number[]) => Float64Array.from(values);

interface RunKeys {
	bucket: Int32Array;
	prompt: Int32Array;
	model: Int32Array;
	provider: Int32Array;
	web: Int32Array;
	length: number;
}

function keys(columns: RunKeyColumns): RunKeys {
	return {
		bucket: ints(columns.bucket),
		prompt: ints(columns.prompt),
		model: ints(columns.model),
		provider: ints(columns.provider),
		web: ints(columns.web),
		length: columns.bucket.length,
	};
}

export function decodeBrandBundle(bundle: BrandBundle) {
	const r = bundle.promptRuns;
	const c = bundle.competitorMentions;
	const w = bundle.webQueries;
	const u = bundle.citations;
	const p = bundle.citationPages;
	const q = bundle.sentimentQuotes;
	return {
		bundle,
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
		citations: { ...keys(u), page: ints(u.page), citations: ints(u.citations), positionSum: ints(u.positionSum) },
		citationPages: {
			id: p.id,
			url: p.url,
			domain: ints(p.domain),
			title: p.title,
			pageType: ints(p.pageType),
			category: ints(p.category),
			length: p.id.length,
		},
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

export function getBrandStore(brandId: string): BrandStore | undefined {
	const store = stores.get(brandId);
	if (store) {
		stores.delete(brandId);
		stores.set(brandId, store);
	}
	return store;
}
