/**
 * Pure analytics for the citation landscape — the AEO-actionable cuts that sit
 * on top of raw citation counts. All functions take already-aggregated, plain
 * data (no IO, no apps/web imports) so they're trivially unit tested.
 *
 *  - computeDrQuadrants  : DR × citation-frequency 2×2 (quick wins vs strategic)
 *  - computeKingmakers   : third-party domains to get placed on, by prompt reach
 *  - computeWinnability  : per-prompt opportunity from concentration + volatility
 *  - computeScoreboard   : share of citations, you vs competitors, per model
 */

import { spearman } from "./dr-correlation";
import { classifySourceType, SOURCE_TYPE_LABELS, type SourceType } from "./source-type";

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ownedMatch(domain: string, owned: string[]): boolean {
	return owned.some((d) => d !== "" && (domain === d || domain.endsWith(`.${d}`)));
}

// ---------------------------------------------------------------------------
// Idea 1 — DR quadrants
// ---------------------------------------------------------------------------

export type DomainKind = "own" | "competitor" | "third_party";

export interface LandscapeDomain {
	domain: string;
	count: number;
	rating: number | null;
	kind: DomainKind;
}

export interface DrQuadrantDomain {
	domain: string;
	count: number;
	rating: number;
	kind: DomainKind;
}

export interface DrQuadrants {
	thresholds: { drMedian: number; countMedian: number } | null;
	counts: { quickWins: number; strategic: number; nicheLow: number; underCited: number };
	quickWins: DrQuadrantDomain[]; // high citations, low DR — easy/replicable wins
	strategic: DrQuadrantDomain[]; // high citations, high DR — strategic PR targets
	underCited: DrQuadrantDomain[]; // low citations, high DR — authority not yet showing up
	nicheLow: DrQuadrantDomain[]; // low citations, low DR — the long tail
}

/** Split rated cited domains into a DR × citation-frequency 2×2 (medians as cuts). */
export function computeDrQuadrants(domains: LandscapeDomain[], topN = 8): DrQuadrants {
	const rated = domains.filter((d): d is LandscapeDomain & { rating: number } => d.rating !== null);
	if (rated.length < 4) {
		return {
			thresholds: null,
			counts: { quickWins: 0, strategic: 0, nicheLow: 0, underCited: 0 },
			quickWins: [],
			strategic: [],
			underCited: [],
			nicheLow: [],
		};
	}
	const drMedian = median(rated.map((d) => d.rating));
	const countMedian = median(rated.map((d) => d.count));
	const counts = { quickWins: 0, strategic: 0, nicheLow: 0, underCited: 0 };
	const quickWins: DrQuadrantDomain[] = [];
	const strategic: DrQuadrantDomain[] = [];
	const underCited: DrQuadrantDomain[] = [];
	const nicheLow: DrQuadrantDomain[] = [];
	for (const d of rated) {
		const highCount = d.count > countMedian;
		const highDr = d.rating > drMedian;
		const entry: DrQuadrantDomain = { domain: d.domain, count: d.count, rating: d.rating, kind: d.kind };
		if (highCount && !highDr) {
			counts.quickWins++;
			quickWins.push(entry);
		} else if (highCount && highDr) {
			counts.strategic++;
			strategic.push(entry);
		} else if (!highCount && highDr) {
			counts.underCited++;
			underCited.push(entry);
		} else {
			counts.nicheLow++;
			nicheLow.push(entry);
		}
	}
	quickWins.sort((a, b) => b.count - a.count);
	strategic.sort((a, b) => b.count - a.count);
	underCited.sort((a, b) => b.rating - a.rating);
	nicheLow.sort((a, b) => b.count - a.count);
	return {
		thresholds: { drMedian, countMedian },
		counts,
		quickWins: quickWins.slice(0, topN),
		strategic: strategic.slice(0, topN),
		underCited: underCited.slice(0, topN),
		nicheLow: nicheLow.slice(0, topN),
	};
}

/** Candidate untracked competitors: top brand-like ("other" source type) third-party domains. */
export interface CandidateCompetitor {
	domain: string;
	citations: number;
}
export function pickCandidateCompetitors(
	domains: { domain: string; citations: number; kind: DomainKind; sourceType: string }[],
	limit = 12,
): CandidateCompetitor[] {
	return domains
		.filter((d) => d.kind === "third_party" && d.sourceType === "other")
		.sort((a, b) => b.citations - a.citations)
		.slice(0, limit)
		.map((d) => ({ domain: d.domain, citations: d.citations }));
}

// ---------------------------------------------------------------------------
// DR distribution by source type — "what authority bar do I need to win here?"
// ---------------------------------------------------------------------------

export interface DrBySourceTypeRow {
	domain: string;
	url: string;
	title?: string | null;
	count: number;
	isOwn?: boolean;
	isCompetitor?: boolean;
	rating: number | null;
}

export interface SourceTypeDrSummary {
	type: SourceType;
	label: string;
	domains: number; // distinct rated domains in this source type
	citations: number;
	medianDr: number | null;
	/** 10 DR deciles [0–10) … [90–100], counts of distinct rated domains. */
	histogram: number[];
}

/**
 * For each source type, the DR distribution of the domains cited in it. Read
 * the listicle/comparison row: if its DR skews low, you can crack those lists
 * with content; if it skews high, it's an authority/PR fight.
 */
export function summarizeDrBySourceType(rows: DrBySourceTypeRow[]): SourceTypeDrSummary[] {
	const byType = new Map<SourceType, Map<string, { rating: number; citations: number }>>();
	for (const r of rows) {
		if (r.rating === null || r.rating === undefined) continue;
		const type = classifySourceType(r);
		let domains = byType.get(type);
		if (!domains) {
			domains = new Map();
			byType.set(type, domains);
		}
		const existing = domains.get(r.domain);
		if (existing) existing.citations += r.count;
		else domains.set(r.domain, { rating: r.rating, citations: r.count });
	}

	const out: SourceTypeDrSummary[] = [];
	for (const [type, domains] of byType) {
		const ratings = [...domains.values()].map((d) => d.rating);
		const histogram = new Array<number>(10).fill(0);
		for (const rt of ratings) histogram[Math.min(9, Math.max(0, Math.floor(rt / 10)))]++;
		out.push({
			type,
			label: SOURCE_TYPE_LABELS[type],
			domains: domains.size,
			citations: [...domains.values()].reduce((s, d) => s + d.citations, 0),
			medianDr: ratings.length ? median(ratings) : null,
			histogram,
		});
	}
	return out.sort((a, b) => b.citations - a.citations);
}

// ---------------------------------------------------------------------------
// Per-prompt citation domain map (DR × citations, sized by pages referenced)
// ---------------------------------------------------------------------------

export interface PromptDomainDot {
	domain: string;
	citations: number;
	pages: number; // distinct URLs of this domain cited for the prompt
	rating: number | null;
	kind: DomainKind;
}

/** Minimum rated domains in a prompt before its DR↔citation correlation is trustworthy. */
export const PROMPT_DR_MIN_N = 5;

export interface PromptDistribution {
	promptId: string;
	value: string;
	totalCitations: number;
	ratedDomains: number;
	/** Spearman of DR vs citations across this prompt's rated domains; null if too few. */
	drSpearman: number | null;
	dots: PromptDomainDot[];
}

export interface PromptDistributionInput {
	rows: { promptId: string; domain: string; citations: number; pages: number }[];
	promptValues: Record<string, string>;
	ratings: Record<string, number | null>;
	kindOf: Record<string, DomainKind>;
}

/** Build a per-prompt domain map: who's cited, their DR, and how many of their pages. */
export function computePromptDomainDistribution(
	input: PromptDistributionInput,
	opts: { maxPrompts?: number; maxDomainsPerPrompt?: number } = {},
): PromptDistribution[] {
	const maxPrompts = opts.maxPrompts ?? 50;
	const maxDomains = opts.maxDomainsPerPrompt ?? 60;

	const byPrompt = new Map<string, PromptDomainDot[]>();
	for (const r of input.rows) {
		let arr = byPrompt.get(r.promptId);
		if (!arr) {
			arr = [];
			byPrompt.set(r.promptId, arr);
		}
		arr.push({
			domain: r.domain,
			citations: r.citations,
			pages: r.pages,
			rating: input.ratings[r.domain] ?? null,
			kind: input.kindOf[r.domain] ?? "third_party",
		});
	}

	const out: PromptDistribution[] = [];
	for (const [promptId, dots] of byPrompt) {
		dots.sort((a, b) => b.citations - a.citations);
		const ratedDots = dots.filter((d): d is PromptDomainDot & { rating: number } => d.rating !== null);
		out.push({
			promptId,
			value: input.promptValues[promptId] ?? promptId,
			totalCitations: dots.reduce((s, d) => s + d.citations, 0),
			ratedDomains: ratedDots.length,
			drSpearman:
				ratedDots.length >= PROMPT_DR_MIN_N
					? spearman(ratedDots.map((d) => d.rating), ratedDots.map((d) => d.citations))
					: null,
			dots: dots.slice(0, maxDomains),
		});
	}
	return out.sort((a, b) => b.totalCitations - a.totalCitations).slice(0, maxPrompts);
}

// ---------------------------------------------------------------------------
// DR vs citation volatility
// ---------------------------------------------------------------------------

export interface DomainRunStat {
	promptId: string;
	domain: string;
	total: number; // total citations of the domain for this prompt
	sumsq: number; // sum of (per-run count)^2 across runs that cited it
	runsPresent: number; // distinct runs of this prompt that cited it
}

export interface DrVolatilityInput {
	runStats: DomainRunStat[];
	/** Web-search run count per prompt — the volatility denominator. */
	runsByPrompt: Record<string, number>;
	ratings: Record<string, number | null>;
	kindOf: Record<string, DomainKind>;
	/** Ignore domains cited fewer than this many times overall (default 3). */
	minCitations?: number;
	/** Need the domain present in at least this many runs to measure variation (default 2). */
	minRunsPresent?: number;
}

export interface DomainVolatilityPoint {
	domain: string;
	rating: number;
	volatility: number; // coefficient of variation of per-run citation counts (0 = cited steadily every run)
	count: number;
	runsPresent: number;
	universeRuns: number;
	presenceRate: number; // runsPresent / universeRuns
	kind: DomainKind;
}

export interface DrVolatility {
	n: number;
	/** Spearman correlation of DR vs volatility (negative ⇒ authority = steadier). */
	spearman: number | null;
	points: DomainVolatilityPoint[];
	mostStable: DomainVolatilityPoint[];
	mostVolatile: DomainVolatilityPoint[];
	/** Steady (below-median volatility) AND low DR — reliable, low-authority → emulate or pay to place. */
	steadyLowDr: DomainVolatilityPoint[];
}

/** DR below this is "low authority" for the emulate/pay-to-place shortlist. */
const STEADY_LOW_DR_MAX = 40;

/**
 * For each rated domain, measure how steadily it's cited across the prompt-runs
 * where it's relevant — the coefficient of variation of its per-run citation
 * counts over the web-search runs of every prompt that cites it — then correlate
 * that with Domain Rating. Per-run (not per-day) so run cadence can't masquerade
 * as instability. Answers "do authoritative domains get cited more consistently?".
 */
export function computeDrVolatility(input: DrVolatilityInput, topN = 6): DrVolatility {
	const minCitations = input.minCitations ?? 3;
	const minRunsPresent = input.minRunsPresent ?? 2;

	const agg = new Map<string, { total: number; sumsq: number; runsPresent: number; prompts: Set<string> }>();
	for (const r of input.runStats) {
		let e = agg.get(r.domain);
		if (!e) {
			e = { total: 0, sumsq: 0, runsPresent: 0, prompts: new Set() };
			agg.set(r.domain, e);
		}
		e.total += r.total;
		e.sumsq += r.sumsq;
		e.runsPresent += r.runsPresent;
		e.prompts.add(r.promptId);
	}

	const points: DomainVolatilityPoint[] = [];
	for (const [domain, e] of agg) {
		const rating = input.ratings[domain];
		if (rating === null || rating === undefined) continue;
		if (e.total < minCitations) continue;
		if (e.runsPresent < minRunsPresent) continue;
		let universeRuns = 0;
		for (const p of e.prompts) universeRuns += input.runsByPrompt[p] ?? 0;
		universeRuns = Math.max(universeRuns, e.runsPresent);
		if (universeRuns < 2) continue;
		const mean = e.total / universeRuns;
		if (mean <= 0) continue;
		const variance = Math.max(0, e.sumsq / universeRuns - mean * mean);
		points.push({
			domain,
			rating,
			volatility: Math.sqrt(variance) / mean,
			count: e.total,
			runsPresent: e.runsPresent,
			universeRuns,
			presenceRate: e.runsPresent / universeRuns,
			kind: input.kindOf[domain] ?? "third_party",
		});
	}

	const byVol = [...points].sort((a, b) => a.volatility - b.volatility);
	const medianVol = points.length ? median(points.map((p) => p.volatility)) : 0;
	const steadyLowDr = points
		.filter((p) => p.rating < STEADY_LOW_DR_MAX && p.volatility <= medianVol)
		.sort((a, b) => b.count - a.count)
		.slice(0, topN);
	return {
		n: points.length,
		spearman: spearman(points.map((p) => p.rating), points.map((p) => p.volatility)),
		points,
		mostStable: byVol.slice(0, topN),
		mostVolatile: byVol.slice(-topN).reverse(),
		steadyLowDr,
	};
}

// ---------------------------------------------------------------------------
// Idea 3 — Kingmaker third-party placement targets
// ---------------------------------------------------------------------------

export interface PromptDomainEdge {
	promptId: string;
	domain: string;
	count: number;
}

export interface KingmakerInput {
	edges: PromptDomainEdge[];
	kindOf: Record<string, DomainKind>;
	brandCitedPromptIds: string[];
	ratings: Record<string, number | null>;
	modelsByDomain?: Record<string, string[]>;
}

export interface Kingmaker {
	domain: string;
	reach: number; // distinct prompts that cite this domain
	totalCitations: number;
	rating: number | null;
	brandAbsentReach: number; // of those prompts, how many never cite the brand
	examplePromptIds: string[];
	models: string[];
}

/** Rank third-party domains by how many of the brand's prompts they're cited across. */
export function computeKingmakers(input: KingmakerInput, limit = 25): Kingmaker[] {
	const brandCited = new Set(input.brandCitedPromptIds);
	const byDomain = new Map<string, { prompts: Set<string>; total: number; absent: Set<string> }>();
	for (const e of input.edges) {
		if (input.kindOf[e.domain] !== "third_party") continue;
		let entry = byDomain.get(e.domain);
		if (!entry) {
			entry = { prompts: new Set(), total: 0, absent: new Set() };
			byDomain.set(e.domain, entry);
		}
		entry.prompts.add(e.promptId);
		entry.total += e.count;
		if (!brandCited.has(e.promptId)) entry.absent.add(e.promptId);
	}
	return [...byDomain.entries()]
		.map(([domain, v]) => ({
			domain,
			reach: v.prompts.size,
			totalCitations: v.total,
			rating: input.ratings[domain] ?? null,
			brandAbsentReach: v.absent.size,
			examplePromptIds: [...v.prompts].slice(0, 5),
			models: input.modelsByDomain?.[domain] ?? [],
		}))
		.sort((a, b) => b.reach - a.reach || b.totalCitations - a.totalCitations)
		.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Idea 4 — Prompt winnability
// ---------------------------------------------------------------------------

/** Herfindahl index (0 = perfectly diffuse, 1 = a single domain owns every citation). */
export function hhi(counts: number[]): number {
	const total = counts.reduce((s, c) => s + c, 0);
	if (total <= 0) return 0;
	return counts.reduce((s, c) => s + (c / total) ** 2, 0);
}

export interface WinnabilityInput {
	/** Per-(prompt, domain) run-level stats (total citations + runs the domain appeared in). */
	runStats: { promptId: string; domain: string; total: number; runsPresent: number }[];
	/** Web-search run count per prompt — denominator for run-to-run volatility. */
	runsByPrompt: Record<string, number>;
	brandCitedPromptIds: string[];
	prompts: { id: string; value: string; weight?: number }[];
}

export interface PromptWinnability {
	promptId: string;
	value: string;
	totalCitations: number;
	uniqueDomains: number;
	concentration: number; // HHI 0..1
	volatility: number | null; // 0..1 — citation-weighted run-to-run instability
	brandCited: boolean;
	topDomain: string | null;
	topDomainShare: number;
	opportunity: number; // composite (higher = easier, higher-value win)
}

/**
 * Score each cited prompt by how winnable it looks: diffuse citation set
 * (low concentration) + unstable run-to-run + brand not yet cited. Volatility is
 * citation-weighted run-to-run instability — 1 minus the share-weighted average
 * of each domain's presence rate across the prompt's web-search runs.
 */
export function computeWinnability(input: WinnabilityInput, limit = 25): PromptWinnability[] {
	const brandCited = new Set(input.brandCitedPromptIds);

	const perPrompt = new Map<string, Map<string, { total: number; runsPresent: number }>>();
	for (const r of input.runStats) {
		let m = perPrompt.get(r.promptId);
		if (!m) {
			m = new Map();
			perPrompt.set(r.promptId, m);
		}
		const existing = m.get(r.domain);
		if (existing) {
			existing.total += r.total;
			existing.runsPresent += r.runsPresent;
		} else {
			m.set(r.domain, { total: r.total, runsPresent: r.runsPresent });
		}
	}

	const out: PromptWinnability[] = [];
	for (const p of input.prompts) {
		const domainStats = perPrompt.get(p.id);
		if (!domainStats || domainStats.size === 0) continue; // no citations → not part of the landscape
		const counts = [...domainStats.values()].map((d) => d.total);
		const total = counts.reduce((s, c) => s + c, 0);
		const concentration = hhi(counts);
		const [topDomain, topEntry] = [...domainStats.entries()].sort((a, b) => b[1].total - a[1].total)[0];

		const runs = input.runsByPrompt[p.id] ?? 0;
		let volatility: number | null = null;
		if (runs >= 1 && total > 0) {
			let weightedStability = 0;
			for (const [, d] of domainStats) {
				weightedStability += (d.total / total) * Math.min(1, d.runsPresent / runs);
			}
			volatility = Math.max(0, Math.min(1, 1 - weightedStability));
		}

		const isBrandCited = brandCited.has(p.id);
		let opportunity = 1 - concentration;
		if (volatility !== null) opportunity *= 0.5 + 0.5 * volatility;
		if (isBrandCited) opportunity *= 0.3; // already winning here → less of an opportunity
		opportunity *= p.weight ?? 1;

		out.push({
			promptId: p.id,
			value: p.value,
			totalCitations: total,
			uniqueDomains: domainStats.size,
			concentration,
			volatility,
			brandCited: isBrandCited,
			topDomain,
			topDomainShare: total > 0 ? topEntry.total / total : 0,
			opportunity,
		});
	}
	return out.sort((a, b) => b.opportunity - a.opportunity).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Idea 5 — Share-of-citations scoreboard
// ---------------------------------------------------------------------------

export interface ScoreboardEdge {
	model: string;
	domain: string;
	count: number;
}

export interface ScoreboardCompetitor {
	name: string;
	domains: string[];
}

export interface ScoreboardInput {
	edges: ScoreboardEdge[];
	brandDomains: string[];
	competitors: ScoreboardCompetitor[];
}

export interface EntityShare {
	name: string;
	kind: "brand" | "competitor";
	citations: number;
	share: number; // 0..1 of all citations for that model
}

export interface ScoreboardModel {
	model: string;
	total: number;
	entities: EntityShare[];
}

export interface Scoreboard {
	overall: ScoreboardModel;
	byModel: ScoreboardModel[];
}

function tally(
	edges: ScoreboardEdge[],
	brandDomains: string[],
	competitors: ScoreboardCompetitor[],
	model: string,
): ScoreboardModel {
	let total = 0;
	let brand = 0;
	const compCounts = new Map<string, number>(competitors.map((c) => [c.name, 0]));
	for (const e of edges) {
		total += e.count;
		if (ownedMatch(e.domain, brandDomains)) brand += e.count;
		for (const c of competitors) {
			if (ownedMatch(e.domain, c.domains)) {
				compCounts.set(c.name, (compCounts.get(c.name) ?? 0) + e.count);
				break;
			}
		}
	}
	const entities: EntityShare[] = [
		{ name: "You", kind: "brand" as const, citations: brand, share: total > 0 ? brand / total : 0 },
		...competitors.map((c) => {
			const n = compCounts.get(c.name) ?? 0;
			return { name: c.name, kind: "competitor" as const, citations: n, share: total > 0 ? n / total : 0 };
		}),
	].sort((a, b) => b.citations - a.citations);
	return { model, total, entities };
}

/** Share of citations going to you vs. each competitor, overall and per model. */
export function computeScoreboard(input: ScoreboardInput): Scoreboard {
	const overall = tally(input.edges, input.brandDomains, input.competitors, "all");
	const models = [...new Set(input.edges.map((e) => e.model))].sort();
	const byModel = models.map((m) =>
		tally(input.edges.filter((e) => e.model === m), input.brandDomains, input.competitors, m),
	);
	return { overall, byModel };
}
