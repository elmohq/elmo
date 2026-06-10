/**
 * Pure aggregation for the Query Fanout page. No DB or React imports, so it can
 * be unit-tested in isolation and safely imported by both the server fn and the
 * page (for its result types).
 *
 * "Query fanout" = the sub-queries an AI engine issues to the web while
 * answering a tracked prompt (`prompt_runs.web_queries`). Two kinds of entries
 * are *not* genuine fan-out and are dropped (in the SQL that reads web_queries,
 * and defensively here): a query identical to the prompt (the engine echoing it,
 * e.g. DataForSEO Google AI Mode stores `[prompt]`), and the `"unavailable"`
 * sentinel some providers write when a search happened but the real query
 * strings aren't exposed (OpenRouter always; BrightData/Olostep on extraction
 * failure). So every row that reaches the aggregator is a genuine expansion.
 *
 * Most engines populate `web_queries` directly. DataForSEO's Google AI Mode does
 * not — it only echoes the prompt there, but *cites* `google.com/search?q=…`
 * links (the searches it actually ran). `deriveGoogleFanout` reconstructs Google
 * fan-out from those citations, and `mergeGoogleFanout` ADDS it to the
 * web_queries-derived totals (Olostep's Google runs carry genuine `web_queries`,
 * which must be kept, not replaced) so neither provider is a blank on the page.
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

/** One `google.com/search?…` citation emitted by a Google AI Mode run. */
export interface GoogleFanoutCitationRow {
	prompt_id: string;
	prompt_run_id: string;
	model: string;
	url: string;
	brand_mentioned: boolean;
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
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const LIMITS = {
	topQueries: 25,
	terms: 60,
	wordChanges: 60,
	perModelTop: 8,
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
// Google AI Mode: reconstruct fan-out from cited google.com/search?q= links.
// ---------------------------------------------------------------------------

/**
 * Hostname is a real Google domain: `google.<tld>` or `<sub>.google.<tld>`,
 * where `<tld>` is a single label (com, de, …) or a known second-level ccTLD
 * (co.uk, com.au, …). "google" must be the registrable-domain label, so
 * look-alikes like `google.evil.com`, `google.com.evil.com`, and `notgoogle.com`
 * are rejected. The SQL prefilter (`getGoogleSearchFanoutCitations`) is looser —
 * this regex is the authoritative gate.
 */
const GOOGLE_HOST = /(^|\.)google\.(?:[a-z]{2,}|(?:co|com|org|net|gov|ac|edu)\.[a-z]{2,})$/;

/**
 * If `url` is a plain Google web-search link, return its decoded query; else
 * null. Shopping / vertical links (`prds`, `tbm`, non-web `udm`) are product or
 * image/news surfaces, not query fan-out, so they're rejected — except
 * `udm=14`, which is Google's plain "Web" results surface, i.e. a genuine
 * web search.
 */
export function parseGoogleSearchQuery(url: string): string | null {
	try {
		const u = new URL(url);
		if (!GOOGLE_HOST.test(u.hostname)) return null;
		if (u.pathname !== "/search" && u.pathname !== "/search/") return null;
		if (u.searchParams.has("prds") || u.searchParams.has("tbm")) return null;
		const udm = u.searchParams.get("udm");
		if (udm !== null && udm !== "14") return null;
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
	// A run that cites the same search in several reference blocks ran it once —
	// count one query instance per (run, query). Not every extractor dedups its
	// citations (DataForSEO's doesn't), so guard here regardless of provider.
	const seenPerRun = new Set<string>();

	for (const c of citations) {
		const q = parseGoogleSearchQuery(c.url);
		if (!q) continue;
		const query = norm(q);
		if (!query) continue;
		if (query === norm(promptValueMap.get(c.prompt_id) ?? "")) continue; // prompt echo, not a fan-out
		const seenKey = `${c.prompt_run_id} ${query}`;
		if (seenPerRun.has(seenKey)) continue;
		seenPerRun.add(seenKey);

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

export interface MergedGoogleFanout {
	/** Model totals with reconstructed Google fan-out folded in. */
	modelTotals: FanoutModelTotalRow[];
	/** Per-prompt fan-out run counts (the denominator for avg fan-out per prompt run). */
	promptRuns: Map<string, number>;
	/** Google models whose fan-out was reconstructed from citations (have ≥1 search). */
	reconstructedModels: string[];
}

/**
 * Fold citation-reconstructed Google fan-out (from `deriveGoogleFanout`) into the
 * `web_queries`-derived model and per-prompt totals.
 *
 * The two sources are per-run disjoint, so the counts are ADDED, never replaced:
 * a DataForSEO Google run echoes the prompt in `web_queries` (dropped by provider,
 * not by text match, so prompt edits can't leak it) and exposes its real searches
 * only as `google.com/search` citations, while an Olostep Google run carries
 * genuine `web_queries` and cites external pages. Replacing would discard Olostep's
 * real Google fan-out; adding keeps both and still surfaces DataForSEO's
 * reconstructed searches. Disjointness is enforced upstream:
 * `getGoogleSearchFanoutCitations` only returns citations for runs that produced no
 * genuine `web_queries`, so no run is counted twice.
 *
 * A model is reported as "reconstructed" only when ALL its fan-out came from
 * citations (no genuine `web_queries` total) — a model with both keeps its
 * web_queries-derived label.
 */
export function mergeGoogleFanout(
	modelTotals: FanoutModelTotalRow[],
	promptTotals: FanoutPromptTotalRow[],
	google: GoogleFanoutDerived,
): MergedGoogleFanout {
	const webQueriesTotal = new Map(modelTotals.map((m) => [m.model, m.total_queries]));
	const merged: FanoutModelTotalRow[] = modelTotals.map((m) => {
		const g = google.totalsByModel.get(m.model);
		if (!g) return m;
		const fanout_runs = m.fanout_runs + g.fanoutRuns;
		// `runs` counts web-search-enabled runs; reconstructed runs are web searches
		// too, so keep the invariant runs >= fanout_runs even if a reconstructed run
		// somehow wasn't flagged web-search-enabled (else the UI shows "runs w/ queries"
		// exceeding "search prompt runs").
		return { ...m, runs: Math.max(m.runs, fanout_runs), fanout_runs, total_queries: m.total_queries + g.totalQueries };
	});
	// A reconstructed Google model with no `prompt_runs` row in the window (only
	// citations) won't be in `modelTotals` — add it; `runs` is best-effort.
	for (const [model, g] of google.totalsByModel) {
		if (!merged.some((m) => m.model === model)) {
			merged.push({ model, runs: g.fanoutRuns, fanout_runs: g.fanoutRuns, total_queries: g.totalQueries });
		}
	}

	const promptRuns = new Map(promptTotals.map((r) => [r.prompt_id, r.runs]));
	for (const [promptId, g] of google.totalsByPrompt) {
		promptRuns.set(promptId, (promptRuns.get(promptId) ?? 0) + g.fanoutRuns);
	}

	// Only models whose fan-out is *purely* reconstructed (no genuine web_queries).
	const reconstructedModels = [...google.totalsByModel.entries()]
		.filter(([model, g]) => g.totalQueries > 0 && (webQueriesTotal.get(model) ?? 0) === 0)
		.map(([m]) => m);

	return { modelTotals: merged, promptRuns, reconstructedModels };
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

	// A prompt's token set is identical for every one of its breakdown rows.
	const promptTokensByPrompt = new Map<string, Set<string>>();
	const promptTokensFor = (promptId: string, promptValue: string): Set<string> => {
		let set = promptTokensByPrompt.get(promptId);
		if (!set) {
			set = new Set(tokenize(promptValue));
			promptTokensByPrompt.set(promptId, set);
		}
		return set;
	};

	for (const row of breakdown) {
		const query = norm(row.query);
		if (!query || query === UNAVAILABLE_SENTINEL) continue;
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
		const promptTokens = promptTokensFor(row.prompt_id, promptValue);
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
	const allQueryStats = toQueryStats(overall, overall.size);
	const topQueries = allQueryStats.slice(0, LIMITS.topQueries);

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
				variations: toQueryStats(pp.queries, LIMITS.variations),
			};
		})
		.sort((a, b) => b.totalQueries - a.totalQueries);

	// Opportunity framing — queries engines run often where the brand is absent,
	// and the queries it reliably wins. Require count >= 2 so one-off queries
	// don't dominate the lists.
	const invisibleQueries = allQueryStats
		.filter((q) => q.count >= 2 && q.brandMentionRate === 0)
		.slice(0, LIMITS.opportunities);
	const wonQueries = allQueryStats
		.filter((q) => q.count >= 2 && q.brandMentionRate > WON_MENTION_THRESHOLD)
		.sort((a, b) => b.count - a.count || b.brandMentionRate - a.brandMentionRate)
		.slice(0, LIMITS.opportunities);

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
	};
}
