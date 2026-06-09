/**
 * Pure statistics for the Domain Rating (DR) ↔ citation-count relationship.
 *
 * Citation counts are power-law distributed, so the headline metric is the
 * Spearman rank correlation (robust to skew). Pearson on (rating, log10(count))
 * is provided as a secondary signal. Outliers are surfaced via rank-gap rather
 * than regression residuals — it needs no model fit and reads naturally
 * ("ranks #3 in citations but #47 in authority").
 *
 * No IO here; this module is fully unit tested.
 */

export interface DrPoint<C extends string = string> {
	domain: string;
	count: number;
	category: C;
	rating: number | null;
}

export interface DrScatterPoint<C extends string = string> {
	domain: string;
	rating: number;
	count: number;
	category: C;
}

export interface DrOutlier<C extends string = string> extends DrScatterPoint<C> {
	citationRank: number;
	drRank: number;
	rankGap: number;
}

export interface DrCorrelationResult<C extends string = string> {
	/** Number of rated domains used for the correlation. */
	n: number;
	/** Spearman rank correlation of DR vs citation count, or null when n < 2. */
	spearman: number | null;
	/** Pearson correlation of DR vs log10(count), or null when undefined. */
	pearsonLog: number | null;
	/** "ok" once there are enough rated domains to trust the coefficient. */
	confidence: "low" | "ok";
	/** All rated domains, for the scatter plot. */
	scatter: DrScatterPoint<C>[];
	outliers: {
		/** Low DR but heavily cited — "punching above their weight". */
		aboveWeight: DrOutlier<C>[];
		/** High DR but rarely cited — "underperforming authority". */
		underperforming: DrOutlier<C>[];
	};
}

/** Below this many rated domains the coefficient is treated as unreliable. */
export const DR_MIN_CONFIDENCE_N = 15;
/** Outliers ignore one-off citations to avoid surfacing noise. */
const OUTLIER_MIN_COUNT = 2;
const OUTLIER_TOP_K = 8;

function pearson(xs: number[], ys: number[]): number | null {
	const n = xs.length;
	if (n < 2) return null;
	let sx = 0;
	let sy = 0;
	for (let i = 0; i < n; i++) {
		sx += xs[i];
		sy += ys[i];
	}
	const mx = sx / n;
	const my = sy / n;
	let cov = 0;
	let vx = 0;
	let vy = 0;
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - mx;
		const dy = ys[i] - my;
		cov += dx * dy;
		vx += dx * dx;
		vy += dy * dy;
	}
	if (vx === 0 || vy === 0) return null;
	return cov / Math.sqrt(vx * vy);
}

/** Average (fractional) ranks, 1-based, with ties sharing the mean rank. */
function averageRanks(values: number[]): number[] {
	const indexed = values.map((v, i) => ({ v, i }));
	indexed.sort((a, b) => a.v - b.v);
	const ranks = new Array<number>(values.length);
	let i = 0;
	while (i < indexed.length) {
		let j = i;
		while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
		const avg = (i + j) / 2 + 1;
		for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
		i = j + 1;
	}
	return ranks;
}

export function spearman(xs: number[], ys: number[]): number | null {
	if (xs.length < 2) return null;
	return pearson(averageRanks(xs), averageRanks(ys));
}

function computeOutliers<C extends string>(
	rated: (DrPoint<C> & { rating: number })[],
): DrCorrelationResult<C>["outliers"] {
	const m = rated.length;
	if (m < 4) return { aboveWeight: [], underperforming: [] };

	// Ordinal ranks (1 = best). Deterministic tie-break by domain for stability.
	const byCitations = [...rated].sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
	const byDr = [...rated].sort((a, b) => b.rating - a.rating || a.domain.localeCompare(b.domain));
	const citationRank = new Map<string, number>();
	for (const [i, p] of byCitations.entries()) citationRank.set(p.domain, i + 1);
	const drRank = new Map<string, number>();
	for (const [i, p] of byDr.entries()) drRank.set(p.domain, i + 1);

	const all: DrOutlier<C>[] = rated.map((p) => {
		const cr = citationRank.get(p.domain) as number;
		const dr = drRank.get(p.domain) as number;
		return { domain: p.domain, rating: p.rating, count: p.count, category: p.category, citationRank: cr, drRank: dr, rankGap: dr - cr };
	});

	const minGap = Math.max(3, Math.ceil(m * 0.15));

	const aboveWeight = all
		.filter((o) => o.rankGap >= minGap)
		.sort((a, b) => b.rankGap - a.rankGap || b.count - a.count)
		.slice(0, OUTLIER_TOP_K);

	const underperforming = all
		.filter((o) => o.rankGap <= -minGap)
		.sort((a, b) => a.rankGap - b.rankGap || b.rating - a.rating)
		.slice(0, OUTLIER_TOP_K);

	return { aboveWeight, underperforming };
}

/**
 * Compute the DR ↔ citation correlation, scatter points, and outlier lists.
 * Correlation/scatter use every rated domain; outliers ignore count < 2.
 */
export function computeDrCorrelation<C extends string>(points: DrPoint<C>[]): DrCorrelationResult<C> {
	const rated = points.filter((p): p is DrPoint<C> & { rating: number } => p.rating !== null);

	const scatter: DrScatterPoint<C>[] = rated.map((p) => ({
		domain: p.domain,
		rating: p.rating,
		count: p.count,
		category: p.category,
	}));

	const n = rated.length;
	const ratings = rated.map((p) => p.rating);
	const counts = rated.map((p) => p.count);

	return {
		n,
		spearman: spearman(ratings, counts),
		pearsonLog: pearson(
			ratings,
			counts.map((c) => Math.log10(c)),
		),
		confidence: n >= DR_MIN_CONFIDENCE_N ? "ok" : "low",
		scatter,
		outliers: computeOutliers(rated.filter((p) => p.count >= OUTLIER_MIN_COUNT)),
	};
}

export interface AuthorityRegime {
	regime: "authority" | "content";
	/** Whether the brand's DR is at/above the median DR of cited domains (null if unknown). */
	aboveBar: boolean | null;
	headline: string;
	detail: string;
}

/** DR↔citation Spearman at/above this counts as an authority-gated space. */
const AUTHORITY_RHO = 0.25;

/**
 * Turn the DR↔citation correlation + the brand's own DR vs. the cited-set median
 * into a plain strategic call: is this space authority-gated (invest in earned
 * authority / digital PR) or content-gated (invest in content & coverage)?
 */
export function classifyAuthorityRegime(
	spearman: number | null,
	brandRating: number | null,
	medianCitedDr: number | null,
): AuthorityRegime {
	const aboveBar = brandRating !== null && medianCitedDr !== null ? brandRating >= medianCitedDr : null;
	const barText =
		brandRating !== null && medianCitedDr !== null
			? `Your DR (${Math.round(brandRating)}) is ${aboveBar ? "at or above" : "below"} the median of cited domains (${Math.round(medianCitedDr)}).`
			: "";

	if (spearman !== null && spearman >= AUTHORITY_RHO) {
		return {
			regime: "authority",
			aboveBar,
			headline: "Authority-gated space",
			detail:
				`Domain Rating meaningfully predicts who gets cited here. ${barText} ` +
				(aboveBar === false
					? "You're below the bar — lean into earned authority (digital PR, links, citations on authoritative sites)."
					: "Authority is a real moat — defend it, and strong content still compounds.").trim(),
		};
	}
	return {
		regime: "content",
		aboveBar,
		headline: "Content-gated space",
		detail:
			`Domain Rating barely predicts citations here — relevance and coverage win. ${barText} ` +
			(aboveBar === true
				? "You already out-rank the typical cited site, so authority isn't your constraint — invest in content & coverage."
				: "Focus on content & coverage rather than chasing DR.").trim(),
	};
}

/**
 * Plain-language strength label for a correlation coefficient, e.g.
 * "a moderate positive" / "no meaningful". The caller appends "correlation".
 */
export function describeCorrelationStrength(r: number): string {
	const a = Math.abs(r);
	const dir = r >= 0 ? "positive" : "negative";
	if (a < 0.1) return "no meaningful";
	if (a < 0.3) return `a weak ${dir}`;
	if (a < 0.5) return `a moderate ${dir}`;
	if (a < 0.7) return `a strong ${dir}`;
	return `a very strong ${dir}`;
}
