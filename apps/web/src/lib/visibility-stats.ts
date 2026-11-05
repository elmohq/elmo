/**
 * Set and weighted volatility are kept distinct because they barely correlate: a
 * prompt with one dominant source and a noisy long tail churns by set but not by
 * volume. Weighted is the one surfaced as the Stability score.
 */

export interface DailyDomainCount {
	/** "YYYY-MM-DD", so string order is date order. */
	date: string;
	domain: string;
	count: number;
}

export interface VolatilityResult {
	/** Mean Jaccard distance between consecutive days' domain sets, 0..1. null if < 2 days of data. */
	setVolatility: number | null;
	/** Mean Bray–Curtis distance between consecutive days' citation-share vectors, 0..1. null if < 2 days. */
	weightedVolatility: number | null;
	/** Consecutive-day transitions the averages are based on. Use as a reliability gate. */
	dayTransitions: number;
}

interface DayBucket {
	date: string;
	counts: Map<string, number>;
	total: number;
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

function bucketByDay(daily: DailyDomainCount[]): DayBucket[] {
	const byDate = new Map<string, Map<string, number>>();
	for (const { date, domain, count } of daily) {
		if (count <= 0) continue;
		let m = byDate.get(date);
		if (!m) {
			m = new Map();
			byDate.set(date, m);
		}
		m.set(domain, (m.get(domain) ?? 0) + count);
	}
	return [...byDate.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([date, counts]) => {
			let total = 0;
			for (const c of counts.values()) total += c;
			return { date, counts, total };
		});
}

export function computeVolatility(daily: DailyDomainCount[]): VolatilityResult {
	const days = bucketByDay(daily);
	if (days.length < 2) {
		return { setVolatility: null, weightedVolatility: null, dayTransitions: 0 };
	}

	let setSum = 0;
	let weightedSum = 0;
	let transitions = 0;

	for (let i = 1; i < days.length; i++) {
		const prev = days[i - 1];
		const cur = days[i];

		// Jaccard distance on the domain sets: 1 - |A∩B| / |A∪B|.
		let inter = 0;
		for (const d of cur.counts.keys()) {
			if (prev.counts.has(d)) inter++;
		}
		const union = cur.counts.size + prev.counts.size - inter;
		const setDist = union === 0 ? 0 : 1 - inter / union;

		// Bray–Curtis distance on the citation-share vectors: 1 - Σ min(shareCur, sharePrev).
		// A domain cited on only one of the two days adds min(x, 0) = 0, so only shared ones are walked.
		let overlap = 0;
		for (const [d, c] of cur.counts) {
			const prevC = prev.counts.get(d);
			if (prevC === undefined) continue;
			overlap += Math.min(c / cur.total, prevC / prev.total);
		}
		const weightedDist = 1 - overlap;

		setSum += setDist;
		weightedSum += weightedDist;
		transitions++;
	}

	return {
		setVolatility: round3(setSum / transitions),
		weightedVolatility: round3(weightedSum / transitions),
		dayTransitions: transitions,
	};
}

/** 0 churns daily, 100 never moves. */
export function stabilityScore(weightedVolatility: number | null): number | null {
	if (weightedVolatility === null) return null;
	return Math.round((1 - clamp01(weightedVolatility)) * 100);
}

export interface VoiceShare {
	name: string;
	/** Run-days (or runs) on which this entity was mentioned. */
	mentions: number;
	/** Ratio of all brand and competitor mentions; see computeShareOfVoice on rounding. */
	share: number;
	isBrand: boolean;
}

/**
 * Mentions must share one unit across entities (e.g. runs that named them).
 * Shares stay unrounded: every view rounds the same ratio once, so the table
 * can't read a point off the headline.
 */
export function computeShareOfVoice(
	brand: { name: string; mentions: number },
	competitors: { name: string; mentions: number }[],
): { entries: VoiceShare[]; brandShare: number | null; total: number } {
	let total = brand.mentions;
	for (const c of competitors) total += c.mentions;
	const mk = (name: string, mentions: number, isBrand: boolean): VoiceShare => ({
		name,
		mentions,
		isBrand,
		share: total === 0 ? 0 : mentions / total,
	});
	const entries = [mk(brand.name, brand.mentions, true), ...competitors.map((c) => mk(c.name, c.mentions, false))].sort(
		(a, b) => b.mentions - a.mentions,
	);
	return { entries, brandShare: total === 0 ? null : brand.mentions / total, total };
}

export interface PerPromptDailyMentions {
	promptId: string;
	date: string;
	brandMentions: number;
	competitorMentions: number;
}

interface MentionCounts {
	brand: number;
	competitor: number;
}

function groupMentionsByPromptAndDate(perPrompt: PerPromptDailyMentions[]): Map<string, Map<string, MentionCounts>> {
	const byPrompt = new Map<string, Map<string, MentionCounts>>();
	for (const r of perPrompt) {
		const dateMap = byPrompt.get(r.promptId) ?? new Map<string, MentionCounts>();
		byPrompt.set(r.promptId, dateMap);
		dateMap.set(r.date, { brand: r.brandMentions, competitor: r.competitorMentions });
	}
	return byPrompt;
}

function accumulateCarriedMentions(
	dateMap: Map<string, MentionCounts>,
	dateRange: string[],
	daily: Map<string, MentionCounts>,
): void {
	const sorted = [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b));
	let carried = sorted.length > 0 ? sorted[0][1] : null;

	for (const date of dateRange) {
		carried = dateMap.get(date) ?? carried;
		if (!carried) continue;
		const bucket = daily.get(date) ?? { brand: 0, competitor: 0 };
		daily.set(date, bucket);
		bucket.brand += carried.brand;
		bucket.competitor += carried.competitor;
	}
}

/**
 * Each prompt's last counts carry across days it didn't run (seeded with its
 * earliest), so staggered schedules don't read as dips. Share is a ratio.
 */
export function shareOfVoiceTimeSeriesLVCF(
	perPrompt: PerPromptDailyMentions[],
	dateRange: string[],
): Array<{ date: string; share: number | null }> {
	const daily = new Map<string, MentionCounts>();
	for (const dateMap of groupMentionsByPromptAndDate(perPrompt).values()) {
		accumulateCarriedMentions(dateMap, dateRange, daily);
	}

	return dateRange.map((date) => {
		const b = daily.get(date);
		if (!b) return { date, share: null };
		const denom = b.brand + b.competitor;
		return { date, share: denom === 0 ? null : b.brand / denom };
	});
}

export interface LeaderboardLVCFResult {
	brandMentions: number;
	brandPrompts: number;
	competitors: Array<{ name: string; mentions: number; prompts: number }>;
}

interface DailyObservation {
	brand: number;
	competitors: Map<string, number>;
}

function groupObservations(
	brandDaily: Array<{ promptId: string; date: string; brand: number }>,
	competitorDaily: Array<{ promptId: string; date: string; competitor: string; mentions: number }>,
): Map<string, Map<string, DailyObservation>> {
	const byPrompt = new Map<string, Map<string, DailyObservation>>();
	const observationAt = (promptId: string, date: string): DailyObservation => {
		const dateMap = byPrompt.get(promptId) ?? new Map<string, DailyObservation>();
		byPrompt.set(promptId, dateMap);
		const observation = dateMap.get(date) ?? { brand: 0, competitors: new Map() };
		dateMap.set(date, observation);
		return observation;
	};

	for (const row of brandDaily) observationAt(row.promptId, row.date).brand = row.brand;
	for (const row of competitorDaily) {
		if (row.mentions > 0) observationAt(row.promptId, row.date).competitors.set(row.competitor, row.mentions);
	}
	return byPrompt;
}

function latestObservation(dateMap: Map<string, DailyObservation>, lastDate: string): DailyObservation | null {
	let latest: DailyObservation | null = null;
	let latestDate = "";
	for (const [date, observation] of dateMap) {
		if (date > lastDate || date < latestDate) continue;
		latest = observation;
		latestDate = date;
	}
	return latest;
}

/**
 * Same carry-forward as shareOfVoiceTimeSeriesLVCF, so the brand share it
 * implies equals that trend's final point rather than a whole-window aggregate.
 */
export function shareOfVoiceLeaderboardLVCF(
	brandDaily: Array<{ promptId: string; date: string; brand: number }>,
	competitorDaily: Array<{ promptId: string; date: string; competitor: string; mentions: number }>,
	dateRange: string[],
): LeaderboardLVCFResult {
	if (dateRange.length === 0) return { brandMentions: 0, brandPrompts: 0, competitors: [] };
	const lastDate = dateRange[dateRange.length - 1];

	const byPrompt = groupObservations(brandDaily, competitorDaily);

	let brandMentions = 0;
	let brandPrompts = 0;
	const compMentions = new Map<string, number>();
	const compPrompts = new Map<string, number>();

	for (const [, dateMap] of byPrompt) {
		const last = latestObservation(dateMap, lastDate);
		if (!last) continue;
		brandMentions += last.brand;
		if (last.brand > 0) brandPrompts++;
		for (const [name, mentions] of last.competitors) {
			if (mentions <= 0) continue;
			compMentions.set(name, (compMentions.get(name) ?? 0) + mentions);
			compPrompts.set(name, (compPrompts.get(name) ?? 0) + 1);
		}
	}

	const competitors = [...compMentions.entries()]
		.map(([name, mentions]) => ({ name, mentions, prompts: compPrompts.get(name) ?? 0 }))
		.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));

	return { brandMentions, brandPrompts, competitors };
}
