/**
 * Pure aggregation for the Query Fanout page. No DB or React imports, so it can
 * be unit-tested in isolation and safely imported by both the server fn and the
 * page (for its result types).
 *
 * "Query fanout" = the sub-queries an AI engine issues to the web while
 * answering a tracked prompt (`prompt_runs.web_queries`) — the single source
 * for every figure on the page, uniformly across providers. Two kinds of
 * entries are excluded as a read-time display rule (in the SQL that reads
 * web_queries, and defensively here): a query identical to the prompt (engines
 * do sometimes search the prompt verbatim — real data, kept in the DB, but a
 * repeat says nothing about how the prompt was *rewritten*, which is what this
 * page shows), and the `"unavailable"` sentinel providers write when a search
 * happened but the real query strings aren't exposed (OpenRouter and
 * DataForSEO always; BrightData/Olostep on extraction failure). So every row
 * that reaches the aggregator is a genuine expansion, and engines that never
 * expose their searches simply contribute none.
 */
import { WEB_QUERIES_UNAVAILABLE } from "@workspace/lib/constants";

// ---------------------------------------------------------------------------
// Input rows (shapes returned by postgres-read; kept here as the single source
// of truth so the server-only read layer imports these as types).
// ---------------------------------------------------------------------------

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

/** Per-prompt run count (the denominator for avg queries per prompt run). */
export interface FanoutPromptTotalRow {
	prompt_id: string;
	runs: number;
}

// ---------------------------------------------------------------------------
// Output shapes (rendered by the page).
// ---------------------------------------------------------------------------

export interface FanoutQueryStat {
	query: string;
	count: number;
	/** % of this query's runs whose answer mentioned the brand (0..100). */
	brandMentionRate: number;
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
	/** Fan-out query instances exhibiting this change. */
	count: number;
	/** Share of all fan-out queries (0..100). */
	share: number;
	/** A stop word ("the", "for", …) — hidden by default in the UI. */
	isStop: boolean;
}

/** How prompt wording is transformed in the searches engines run. */
export interface WordChanges {
	/** Words engines add that weren't in the prompt. */
	added: WordChangeStat[];
	/** Prompt words engines leave out of the search. */
	dropped: WordChangeStat[];
	/** Prompt words engines keep in the search. */
	preserved: WordChangeStat[];
}

export interface ModelFanoutStat {
	model: string;
	runs: number;
	fanoutRuns: number;
	totalQueries: number;
	/** Mean fan-out queries per run that fanned out (1 decimal). */
	avgPerExecution: number;
	topQueries: FanoutQueryStat[];
}

export interface PromptFanoutStat {
	promptId: string;
	promptValue: string;
	/** Total fan-out query instances for this prompt. */
	totalQueries: number;
	/** Distinct fan-out queries (variations). */
	uniqueQueries: number;
	/** Total runs of this prompt in the window — the denominator for avg/run. */
	runs: number;
	/** Mean fan-out queries per prompt run (1 decimal). */
	avgPerExecution: number;
	/** The fan-out queries themselves, for the per-prompt list. */
	variations: FanoutQueryStat[];
}

export interface FanoutAnalysis {
	totalQueries: number;
	uniqueQueries: number;
	fanoutRuns: number;
	totalRuns: number;
	/** Mean fan-out queries per run that fanned out (1 decimal). */
	avgPerExecution: number;
	/** Baseline brand-mention rate across all fan-out query instances. Ratio 0..1. */
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

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

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

/** True for stop words; the Word changes view hides these by default. */
function isStopword(word: string): boolean {
	return STOPWORDS.has(word.toLowerCase());
}

/** Normalize a display word for keyword matching: lowercase, alphanumerics only. */
export const normTok = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Non-stop-word tokens from the prompt — the page bolds these in each fan-out
 * query. A possessive contributes its base form too ("Acme's" yields "acmes"
 * AND "acme"), since engines search for the bare name, which would otherwise
 * not match the prompt's possessive token.
 */
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

/**
 * Sentinel some providers store in `web_queries` when a web search happened but
 * the actual query strings aren't exposed (OpenRouter always; BrightData/Olostep
 * on extraction failure). It's not a real fan-out query — the SQL filters it, and
 * this guards the pure aggregator against any that slip through. Compare against
 * `norm`-ed (trimmed + lowercased) queries. Aliases the shared constant the
 * provider implementations write, so the two sides can't drift.
 */
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
		.map(([query, t]) => ({ query, count: t.count, brandMentionRate: pct(t.brand, t.count) }))
		.sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
		.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

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

function tallyWordChanges(tallies: FanoutTallies, query: string, promptTokens: Set<string>, count: number): void {
	// Term cloud — unigram frequency across fan-out queries, weighted by count.
	for (const token of tokenize(query)) {
		if (STOPWORDS.has(token)) continue;
		tallies.terms.set(token, (tallies.terms.get(token) ?? 0) + count);
	}

	// Word transformations — how the prompt's wording changes in this query.
	// Each fan-out query votes once per distinct token (weighted by count).
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
		tallyWordChanges(tallies, query, promptTokens, row.count);
	}

	return tallies;
}

export function computeFanoutAnalysis(
	breakdown: FanoutBreakdownRow[],
	modelTotals: FanoutModelTotalRow[],
	promptValueMap: Map<string, string>,
	opts: {
		/** prompt id → runs that produced ≥1 web query, for per-prompt avg fan-out per run. */
		promptRuns?: Map<string, number>;
		/** Raise/lower the list caps (e.g. effectively uncapped for a single prompt). */
		limits?: FanoutLimitOverrides;
	} = {},
): FanoutAnalysis {
	const { promptRuns } = opts;
	const L = { ...LIMITS, ...opts.limits };

	const { overall, promptsPerQuery, perModel, perPrompt, terms, added, dropped, preserved, totalQueries, totalBrand } =
		tallyBreakdown(breakdown, promptValueMap);

	// A ratio, not a percentage: this one is published over the API, and every
	// rate there is 0..1. The percentages below stay as they are — nothing
	// outside the dashboard reads them.
	const coverageRate = totalQueries > 0 ? totalBrand / totalQueries : 0;
	const allQueryStats = toQueryStats(overall, overall.size);
	const topQueries = allQueryStats.slice(0, L.topQueries);

	const termStats: TermStat[] = [...terms.entries()]
		.map(([term, count]) => ({ term, count }))
		.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
		.slice(0, L.terms);

	const toWordChanges = (map: Map<string, number>): WordChangeStat[] =>
		[...map.entries()]
			.map(([word, count]) => ({ word, count, share: pct(count, totalQueries), isStop: STOPWORDS.has(word) }))
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
			avgPerExecution: m.fanout_runs > 0 ? Math.round((m.total_queries / m.fanout_runs) * 10) / 10 : 0,
			topQueries: perModel.has(m.model) ? toQueryStats(perModel.get(m.model)!, L.perModelTop) : [],
		}))
		.sort((a, b) => b.totalQueries - a.totalQueries || b.runs - a.runs);

	// Every prompt that produced fan-out (no cap) — the Prompts tab searches and
	// sorts the full set client-side; `variations` per prompt is still bounded.
	const byPrompt: PromptFanoutStat[] = [...perPrompt.entries()]
		.map(([promptId, pp]) => {
			const runs = promptRuns?.get(promptId) ?? 0;
			return {
				promptId,
				promptValue: pp.value,
				totalQueries: pp.total,
				uniqueQueries: pp.queries.size,
				runs,
				avgPerExecution: runs > 0 ? Math.round((pp.total / runs) * 10) / 10 : 0,
				variations: toQueryStats(pp.queries, L.variations),
			};
		})
		.sort((a, b) => b.totalQueries - a.totalQueries);

	// Breadth framing — the searches that matter beyond a single prompt, with
	// the prompts behind each one so the list can drill down like the
	// Prompt Fan-Out accordion (just inverted: query → prompts).
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
		avgPerExecution: fanoutRuns > 0 ? Math.round((totalQueries / fanoutRuns) * 10) / 10 : 0,
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
