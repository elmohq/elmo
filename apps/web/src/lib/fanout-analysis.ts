/**
 * Pure aggregation for the Query Fanout page. No DB or React imports, so it can
 * be unit-tested in isolation and safely imported by both the server fn and the
 * page (for its result types).
 *
 * "Query fanout" = the sub-queries an AI engine issues to the web while
 * answering a tracked prompt (`prompt_runs.web_queries`). A fanout query that is
 * identical to the original prompt is the engine echoing the prompt, not a
 * fan-out — those are dropped (in the SQL for web_queries, and here for the
 * citation-derived Google rows), so every row that reaches the aggregator is a
 * genuine expansion.
 *
 * Most engines populate `web_queries` directly. Google AI Mode (via DataForSEO)
 * does not expose its fan-out there, but it *cites* `google.com/search?q=…`
 * links — the searches it actually ran. `deriveGoogleFanout` reconstructs Google
 * fan-out from those citations so Google AI Mode isn't a blank on the page.
 */

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

/** One `google.com/search?…` citation emitted by a Google AI Mode run. */
export interface GoogleFanoutCitationRow {
	prompt_id: string;
	prompt_run_id: string;
	model: string;
	url: string;
	brand_mentioned: boolean;
	/** The run's date (YYYY-MM-DD) in the viewer's timezone; unused here. */
	created_date?: string;
	/** Competitors mentioned in the run's answer; only competitor attribution uses it. */
	competitors_mentioned?: string[];
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
	/** Baseline brand-mention rate across all fan-out query instances (0..100). */
	coverageRate: number;
	topQueries: FanoutQueryStat[];
	terms: TermStat[];
	wordChanges: WordChanges;
	byModel: ModelFanoutStat[];
	byPrompt: PromptFanoutStat[];
	/** Top fan-out queries the brand never appeared in (opportunities). */
	invisibleQueries: FanoutQueryStat[];
	/** Top fan-out queries the brand reliably appears in. */
	wonQueries: FanoutQueryStat[];
	/** Models that ran but exposed no fan-out (e.g. OpenRouter, or Google with no linked searches). */
	modelsWithoutFanout: string[];
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const LIMITS = {
	topQueries: 25,
	terms: 60,
	wordChanges: 60,
	perModelTop: 8,
	byPrompt: 100,
	variations: 25,
	opportunities: 20,
} as const;

/** A query is "won" if the brand is mentioned in more than this % of its runs. */
export const WON_MENTION_THRESHOLD = 50;

/**
 * Stop words for the term cloud and word-change analysis. Deliberately excludes
 * the modifiers that *are* the signal in fan-out research — "best", "top",
 * "review(s)", "vs", "comparison", year numbers — so they surface, not hide.
 */
const STOPWORDS = new Set([
	"the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "by", "at", "from",
	"as", "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "has", "have", "had",
	"will", "would", "can", "could", "should", "may", "might", "must", "shall",
	"what", "which", "who", "whom", "whose", "how", "when", "where", "why", "that", "this", "these", "those",
	"it", "its", "you", "your", "yours", "i", "me", "my", "we", "our", "ours", "they", "them", "their",
	"he", "she", "his", "her", "about", "into", "over", "than", "then", "there", "here", "if", "so",
	"not", "no", "up", "out", "off", "all", "any", "some", "more", "most", "such", "own", "too", "very",
	"s", "t", "re", "ll", "ve", "d", "m",
]);

/** True for stop words; the Word changes view hides these by default. */
export function isStopword(word: string): boolean {
	return STOPWORDS.has(word.toLowerCase());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

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
// Google AI Mode: reconstruct fan-out from cited google.com/search?q= links.
// ---------------------------------------------------------------------------

/**
 * If `url` is a plain Google web-search link, return its decoded query; else
 * null. Shopping / vertical links (`prds`, `tbm`, `udm`) are product or
 * image/news surfaces, not query fan-out, so they're rejected.
 */
export function parseGoogleSearchQuery(url: string): string | null {
	try {
		const u = new URL(url);
		if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname)) return null;
		if (!u.pathname.startsWith("/search")) return null;
		if (u.searchParams.has("prds") || u.searchParams.has("tbm") || u.searchParams.has("udm")) return null;
		const q = u.searchParams.get("q");
		if (!q) return null;
		const trimmed = q.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
}

type RunTotals = { fanoutRuns: number; totalQueries: number };

export interface GoogleFanoutDerived {
	rows: FanoutBreakdownRow[];
	/** Per-model run/query counts to patch into the model totals. */
	totalsByModel: Map<string, RunTotals>;
	/** Per-prompt run/query counts to fold into the per-prompt totals. */
	totalsByPrompt: Map<string, RunTotals>;
}

/**
 * Fold Google AI Mode `google.com/search?q=` citations into breakdown rows that
 * look exactly like web_queries-derived ones, plus per-model and per-prompt
 * run/query totals so "fan-outs per execution" reflects the reconstructed
 * searches.
 */
export function deriveGoogleFanout(
	citations: GoogleFanoutCitationRow[],
	promptValueMap: Map<string, string>,
): GoogleFanoutDerived {
	const rowMap = new Map<string, FanoutBreakdownRow>();
	const runsByModel = new Map<string, Set<string>>();
	const queriesByModel = new Map<string, number>();
	const runsByPrompt = new Map<string, Set<string>>();
	const queriesByPrompt = new Map<string, number>();

	for (const c of citations) {
		const q = parseGoogleSearchQuery(c.url);
		if (!q) continue;
		const query = norm(q);
		if (!query) continue;
		if (query === norm(promptValueMap.get(c.prompt_id) ?? "")) continue; // prompt echo, not a fan-out

		const key = `${c.prompt_id} ${c.model} ${query}`;
		const row = rowMap.get(key);
		if (row) {
			row.count += 1;
			if (c.brand_mentioned) row.brand_mentions += 1;
		} else {
			rowMap.set(key, {
				prompt_id: c.prompt_id,
				model: c.model,
				query,
				count: 1,
				brand_mentions: c.brand_mentioned ? 1 : 0,
			});
		}

		if (!runsByModel.has(c.model)) runsByModel.set(c.model, new Set());
		runsByModel.get(c.model)!.add(c.prompt_run_id);
		queriesByModel.set(c.model, (queriesByModel.get(c.model) ?? 0) + 1);

		if (!runsByPrompt.has(c.prompt_id)) runsByPrompt.set(c.prompt_id, new Set());
		runsByPrompt.get(c.prompt_id)!.add(c.prompt_run_id);
		queriesByPrompt.set(c.prompt_id, (queriesByPrompt.get(c.prompt_id) ?? 0) + 1);
	}

	const totalsByModel = new Map<string, RunTotals>();
	for (const [model, total] of queriesByModel) {
		totalsByModel.set(model, { fanoutRuns: runsByModel.get(model)?.size ?? 0, totalQueries: total });
	}
	const totalsByPrompt = new Map<string, RunTotals>();
	for (const [promptId, total] of queriesByPrompt) {
		totalsByPrompt.set(promptId, { fanoutRuns: runsByPrompt.get(promptId)?.size ?? 0, totalQueries: total });
	}
	return { rows: [...rowMap.values()], totalsByModel, totalsByPrompt };
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

export function computeFanoutAnalysis(
	breakdown: FanoutBreakdownRow[],
	modelTotals: FanoutModelTotalRow[],
	promptValueMap: Map<string, string>,
	opts: {
		/** prompt id → runs that produced ≥1 web query, for per-prompt avg fan-out per run. */
		promptRuns?: Map<string, number>;
	} = {},
): FanoutAnalysis {
	const { promptRuns } = opts;

	const overall = new Map<string, Tally>();
	const perModel = new Map<string, Map<string, Tally>>();
	const perPrompt = new Map<string, { value: string; total: number; queries: Map<string, Tally> }>();
	const terms = new Map<string, number>();
	const added = new Map<string, number>();
	const dropped = new Map<string, number>();
	const preserved = new Map<string, number>();

	let totalQueries = 0;
	let totalBrand = 0;

	for (const row of breakdown) {
		const query = norm(row.query);
		if (!query) continue;
		totalQueries += row.count;
		totalBrand += row.brand_mentions;

		bump(overall, query, row.count, row.brand_mentions);

		if (!perModel.has(row.model)) perModel.set(row.model, new Map());
		bump(perModel.get(row.model)!, query, row.count, row.brand_mentions);

		const promptValue = promptValueMap.get(row.prompt_id) ?? "";
		let pp = perPrompt.get(row.prompt_id);
		if (!pp) {
			pp = { value: promptValue, total: 0, queries: new Map() };
			perPrompt.set(row.prompt_id, pp);
		}
		pp.total += row.count;
		bump(pp.queries, query, row.count, row.brand_mentions);

		// Term cloud — unigram frequency across fan-out queries, weighted by count.
		for (const tok of tokenize(query)) {
			if (STOPWORDS.has(tok)) continue;
			terms.set(tok, (terms.get(tok) ?? 0) + row.count);
		}

		// Word transformations — how the prompt's wording changes in this query.
		// Each fan-out query votes once per distinct token (weighted by count).
		const promptTokens = new Set(tokenize(promptValue));
		const queryTokens = new Set(tokenize(query));
		for (const tok of queryTokens) {
			if (!promptTokens.has(tok)) added.set(tok, (added.get(tok) ?? 0) + row.count);
		}
		for (const tok of promptTokens) {
			const target = queryTokens.has(tok) ? preserved : dropped;
			target.set(tok, (target.get(tok) ?? 0) + row.count);
		}
	}

	const coverageRate = pct(totalBrand, totalQueries);
	const topQueries = toQueryStats(overall, LIMITS.topQueries);

	const termStats: TermStat[] = [...terms.entries()]
		.map(([term, count]) => ({ term, count }))
		.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
		.slice(0, LIMITS.terms);

	const toWordChanges = (map: Map<string, number>): WordChangeStat[] =>
		[...map.entries()]
			.map(([word, count]) => ({ word, count, share: pct(count, totalQueries), isStop: STOPWORDS.has(word) }))
			.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
			.slice(0, LIMITS.wordChanges);
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
			topQueries: perModel.has(m.model) ? toQueryStats(perModel.get(m.model)!, LIMITS.perModelTop) : [],
		}))
		.sort((a, b) => b.totalQueries - a.totalQueries || b.runs - a.runs);

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
				variations: toQueryStats(pp.queries, LIMITS.variations),
			};
		})
		.sort((a, b) => b.totalQueries - a.totalQueries)
		.slice(0, LIMITS.byPrompt);

	// Opportunity framing — queries engines run often where the brand is absent,
	// and the queries it reliably wins. Require count >= 2 so one-off queries
	// don't dominate the lists.
	const allQueryStats = toQueryStats(overall, overall.size);
	const invisibleQueries = allQueryStats
		.filter((q) => q.count >= 2 && q.brandMentionRate === 0)
		.slice(0, LIMITS.opportunities);
	const wonQueries = allQueryStats
		.filter((q) => q.count >= 2 && q.brandMentionRate > WON_MENTION_THRESHOLD)
		.sort((a, b) => b.count - a.count || b.brandMentionRate - a.brandMentionRate)
		.slice(0, LIMITS.opportunities);

	const modelsWithoutFanout = modelTotals
		.filter((m) => m.runs > 0 && m.total_queries === 0)
		.map((m) => m.model);

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
		invisibleQueries,
		wonQueries,
		modelsWithoutFanout,
	};
}
