/**
 * Kept free of DB imports so the page can import its result types.
 *
 * Queries identical to the prompt, and the "unavailable" sentinel written when a
 * provider doesn't expose its searches, are dropped at read time (in SQL, and
 * again here): neither says how an engine rewrote the prompt. Both stay stored.
 */
import { WEB_QUERIES_UNAVAILABLE } from "@workspace/lib/constants";

export interface FanoutBreakdownRow {
	prompt_id: string;
	model: string;
	query: string;
	count: number;
	brand_mentions: number;
}

export interface FanoutModelTotalRow {
	model: string;
	runs: number;
	fanout_runs: number;
	total_queries: number;
}

export interface FanoutPromptTotalRow {
	prompt_id: string;
	fanout_runs: number;
}

export interface FanoutQueryStat {
	query: string;
	count: number;
	brandMentionPct: number;
}

/** One prompt's contribution to a fan-out query (the Top Queries drill-down). */
interface QueryPromptRef {
	promptId: string;
	promptValue: string;
	/** Run instances of this prompt that issued the query. */
	runs: number;
}

/** A fan-out query ranked by reach: how many prompts / runs issued it. */
export interface TopQueryStat {
	query: string;
	/** Distinct prompts whose runs issued this search. */
	prompts: number;
	/** Total run instances that issued it. */
	runs: number;
	/** The prompts involved, heaviest first. */
	promptRefs: QueryPromptRef[];
}

export interface TermStat {
	term: string;
	count: number;
}

/** One word's behavior in the prompt → query transformation. */
export interface WordChangeStat {
	word: string;
	count: number;
	sharePct: number;
	/** A stop word ("the", "for", …) — hidden by default in the UI. */
	isStop: boolean;
}

/** How prompt wording is transformed in the searches engines run. */
export interface WordChanges {
	added: WordChangeStat[];
	dropped: WordChangeStat[];
	preserved: WordChangeStat[];
}

export interface ModelFanoutStat {
	model: string;
	runs: number;
	fanoutRuns: number;
	totalQueries: number;
	avgQueriesPerFanoutRun: number;
	topQueries: FanoutQueryStat[];
}

export interface PromptFanoutStat {
	promptId: string;
	promptValue: string;
	totalQueries: number;
	uniqueQueries: number;
	fanoutRuns: number;
	avgQueriesPerFanoutRun: number;
	variations: FanoutQueryStat[];
}

export interface FanoutAnalysis {
	totalQueries: number;
	uniqueQueries: number;
	fanoutRuns: number;
	totalRuns: number;
	avgQueriesPerFanoutRun: number;
	/** Share of fan-out query instances whose answer mentioned the brand. */
	coverageRate: number;
	topQueries: FanoutQueryStat[];
	terms: TermStat[];
	wordChanges: WordChanges;
	byModel: ModelFanoutStat[];
	byPrompt: PromptFanoutStat[];
	/** Queries reaching the most distinct prompts (cross-prompt searches). */
	topByPrompts: TopQueryStat[];
	/** Queries issued by the most prompt runs. */
	topByRuns: TopQueryStat[];
}

const LIMITS = {
	topQueries: 25,
	terms: 60,
	wordChanges: 60,
	perModelTop: 8,
	// Brand-wide page shows a teaser per prompt — View Details has the full list.
	variations: 10,
	breadth: 20,
};

/** Per-call overrides for the list caps (single-prompt mode raises them). */
export type FanoutLimitOverrides = Partial<typeof LIMITS>;

/**
 * Stop words for the term cloud and word-change analysis. Deliberately excludes
 * the modifiers that *are* the signal in fan-out research — "best", "top",
 * "review(s)", "vs", "comparison", year numbers — so they surface, not hide.
 */
const STOPWORDS = new Set([
	"the",
	"a",
	"an",
	"and",
	"or",
	"but",
	"of",
	"to",
	"in",
	"on",
	"for",
	"with",
	"by",
	"at",
	"from",
	"as",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"do",
	"does",
	"did",
	"has",
	"have",
	"had",
	"will",
	"would",
	"can",
	"could",
	"should",
	"may",
	"might",
	"must",
	"shall",
	"what",
	"which",
	"who",
	"whom",
	"whose",
	"how",
	"when",
	"where",
	"why",
	"that",
	"this",
	"these",
	"those",
	"it",
	"its",
	"you",
	"your",
	"yours",
	"i",
	"me",
	"my",
	"we",
	"our",
	"ours",
	"they",
	"them",
	"their",
	"he",
	"she",
	"his",
	"her",
	"about",
	"into",
	"over",
	"than",
	"then",
	"there",
	"here",
	"if",
	"so",
	"not",
	"no",
	"up",
	"out",
	"off",
	"all",
	"any",
	"some",
	"more",
	"most",
	"such",
	"own",
	"too",
	"very",
	"s",
	"t",
	"re",
	"ll",
	"ve",
	"d",
	"m",
]);

function isStopword(word: string): boolean {
	return STOPWORDS.has(word.toLowerCase());
}

/** Normalize a display word for keyword matching: lowercase, alphanumerics only. */
export const normTok = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A possessive yields its base form too ("Acme's" → "acme"), since engines search for the bare name. */
export function promptKeywords(promptValue: string): Set<string> {
	const out = new Set<string>();
	for (const raw of promptValue.split(/\s+/)) {
		for (const form of [raw, raw.replace(/['’]s$/i, "")]) {
			const tok = normTok(form);
			if (tok.length > 0 && !isStopword(tok)) out.add(tok);
		}
	}
	return out;
}

const norm = (s: string) => s.trim().toLowerCase();
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

/** Compared against `norm`-ed queries. */
export const UNAVAILABLE_SENTINEL = WEB_QUERIES_UNAVAILABLE;

/** Lowercase word tokens; keeps alphanumerics (so "2026", "vs", "g2" survive), drops 1-char noise. */
function tokenize(s: string): string[] {
	return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2);
}

type Tally = { count: number; brand: number };
function bump(map: Map<string, Tally>, key: string, count: number, brand: number) {
	const t = map.get(key);
	if (t) {
		t.count += count;
		t.brand += brand;
	} else {
		map.set(key, { count, brand });
	}
}

function toQueryStats(map: Map<string, Tally>, limit: number): FanoutQueryStat[] {
	return [...map.entries()]
		.map(([query, t]) => ({ query, count: t.count, brandMentionPct: pct(t.brand, t.count) }))
		.sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
		.slice(0, limit);
}

interface FanoutTallies {
	overall: Map<string, Tally>;
	/** query → prompt id → run instances (feeds the Top Queries drill-down). */
	promptsPerQuery: Map<string, Map<string, number>>;
	perModel: Map<string, Map<string, Tally>>;
	perPrompt: Map<string, { value: string; total: number; queries: Map<string, Tally> }>;
	terms: Map<string, number>;
	added: Map<string, number>;
	dropped: Map<string, number>;
	preserved: Map<string, number>;
	totalQueries: number;
	totalBrand: number;
}

function tallyTerms(tallies: FanoutTallies, query: string, count: number): void {
	for (const token of tokenize(query)) {
		if (STOPWORDS.has(token)) continue;
		tallies.terms.set(token, (tallies.terms.get(token) ?? 0) + count);
	}
}

/** Each query votes once per distinct token, weighted by how often it ran. */
function tallyWordChanges(tallies: FanoutTallies, query: string, promptTokens: Set<string>, count: number): void {
	const queryTokens = new Set(tokenize(query));
	for (const token of queryTokens) {
		if (!promptTokens.has(token)) tallies.added.set(token, (tallies.added.get(token) ?? 0) + count);
	}
	for (const token of promptTokens) {
		const target = queryTokens.has(token) ? tallies.preserved : tallies.dropped;
		target.set(token, (target.get(token) ?? 0) + count);
	}
}

function tallyBreakdown(breakdown: FanoutBreakdownRow[], promptValueMap: Map<string, string>): FanoutTallies {
	const tallies: FanoutTallies = {
		overall: new Map(),
		promptsPerQuery: new Map(),
		perModel: new Map(),
		perPrompt: new Map(),
		terms: new Map(),
		added: new Map(),
		dropped: new Map(),
		preserved: new Map(),
		totalQueries: 0,
		totalBrand: 0,
	};

	// A prompt's token set is identical for every one of its breakdown rows.
	const promptTokensByPrompt = new Map<string, Set<string>>();

	for (const row of breakdown) {
		const query = norm(row.query);
		if (!query || query === UNAVAILABLE_SENTINEL) continue;
		tallies.totalQueries += row.count;
		tallies.totalBrand += row.brand_mentions;

		bump(tallies.overall, query, row.count, row.brand_mentions);

		const queryPrompts = tallies.promptsPerQuery.get(query) ?? new Map<string, number>();
		queryPrompts.set(row.prompt_id, (queryPrompts.get(row.prompt_id) ?? 0) + row.count);
		tallies.promptsPerQuery.set(query, queryPrompts);

		const modelQueries = tallies.perModel.get(row.model) ?? new Map<string, Tally>();
		bump(modelQueries, query, row.count, row.brand_mentions);
		tallies.perModel.set(row.model, modelQueries);

		const promptValue = promptValueMap.get(row.prompt_id) ?? "";
		const promptEntry = tallies.perPrompt.get(row.prompt_id) ?? { value: promptValue, total: 0, queries: new Map() };
		promptEntry.total += row.count;
		bump(promptEntry.queries, query, row.count, row.brand_mentions);
		tallies.perPrompt.set(row.prompt_id, promptEntry);

		let promptTokens = promptTokensByPrompt.get(row.prompt_id);
		if (!promptTokens) {
			promptTokens = new Set(tokenize(promptValue));
			promptTokensByPrompt.set(row.prompt_id, promptTokens);
		}
		tallyTerms(tallies, query, row.count);
		tallyWordChanges(tallies, query, promptTokens, row.count);
	}

	return tallies;
}

export function computeFanoutAnalysis(
	breakdown: FanoutBreakdownRow[],
	modelTotals: FanoutModelTotalRow[],
	promptValueMap: Map<string, string>,
	opts: {
		promptFanoutRuns?: Map<string, number>;
		/** Raise/lower the list caps (e.g. effectively uncapped for a single prompt). */
		limits?: FanoutLimitOverrides;
	} = {},
): FanoutAnalysis {
	const { promptFanoutRuns } = opts;
	const L = { ...LIMITS, ...opts.limits };

	const { overall, promptsPerQuery, perModel, perPrompt, terms, added, dropped, preserved, totalQueries, totalBrand } =
		tallyBreakdown(breakdown, promptValueMap);

	const coverageRate = totalQueries > 0 ? totalBrand / totalQueries : 0;
	const allQueryStats = toQueryStats(overall, overall.size);
	const topQueries = allQueryStats.slice(0, L.topQueries);

	const termStats: TermStat[] = [...terms.entries()]
		.map(([term, count]) => ({ term, count }))
		.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
		.slice(0, L.terms);

	const toWordChanges = (map: Map<string, number>): WordChangeStat[] =>
		[...map.entries()]
			.map(([word, count]) => ({ word, count, sharePct: pct(count, totalQueries), isStop: STOPWORDS.has(word) }))
			.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
			.slice(0, L.wordChanges);
	const wordChanges: WordChanges = {
		added: toWordChanges(added),
		dropped: toWordChanges(dropped),
		preserved: toWordChanges(preserved),
	};

	const byModel: ModelFanoutStat[] = modelTotals
		.filter((m) => m.runs > 0)
		.map((m) => ({
			model: m.model,
			runs: m.runs,
			fanoutRuns: m.fanout_runs,
			totalQueries: m.total_queries,
			avgQueriesPerFanoutRun: m.fanout_runs > 0 ? Math.round((m.total_queries / m.fanout_runs) * 10) / 10 : 0,
			topQueries: perModel.has(m.model) ? toQueryStats(perModel.get(m.model)!, L.perModelTop) : [],
		}))
		.sort((a, b) => b.totalQueries - a.totalQueries || b.runs - a.runs || a.model.localeCompare(b.model));

	// Uncapped: the Prompts tab searches and sorts the full set client-side.
	const byPrompt: PromptFanoutStat[] = [...perPrompt.entries()]
		.map(([promptId, pp]) => {
			const fanoutRuns = promptFanoutRuns?.get(promptId) ?? 0;
			return {
				promptId,
				promptValue: pp.value,
				totalQueries: pp.total,
				uniqueQueries: pp.queries.size,
				fanoutRuns,
				avgQueriesPerFanoutRun: fanoutRuns > 0 ? Math.round((pp.total / fanoutRuns) * 10) / 10 : 0,
				variations: toQueryStats(pp.queries, L.variations),
			};
		})
		.sort((a, b) => b.totalQueries - a.totalQueries || a.promptValue.localeCompare(b.promptValue));

	const breadthStats: TopQueryStat[] = [...overall.entries()].map(([query, t]) => {
		const per = promptsPerQuery.get(query) ?? new Map<string, number>();
		const promptRefs: QueryPromptRef[] = [...per.entries()]
			.map(([promptId, runs]) => ({ promptId, promptValue: promptValueMap.get(promptId) ?? "", runs }))
			.sort((a, b) => b.runs - a.runs || a.promptValue.localeCompare(b.promptValue));
		return { query, prompts: per.size, runs: t.count, promptRefs };
	});
	const topByPrompts = [...breadthStats]
		.sort((a, b) => b.prompts - a.prompts || b.runs - a.runs || a.query.localeCompare(b.query))
		.slice(0, L.breadth);
	const topByRuns = [...breadthStats]
		.sort((a, b) => b.runs - a.runs || b.prompts - a.prompts || a.query.localeCompare(b.query))
		.slice(0, L.breadth);

	const totalRuns = modelTotals.reduce((s, m) => s + m.runs, 0);
	const fanoutRuns = modelTotals.reduce((s, m) => s + m.fanout_runs, 0);

	return {
		totalQueries,
		uniqueQueries: overall.size,
		fanoutRuns,
		totalRuns,
		avgQueriesPerFanoutRun: fanoutRuns > 0 ? Math.round((totalQueries / fanoutRuns) * 10) / 10 : 0,
		coverageRate,
		topQueries,
		terms: termStats,
		wordChanges,
		byModel,
		byPrompt,
		topByPrompts,
		topByRuns,
	};
}
