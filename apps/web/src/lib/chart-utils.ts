import { getDefaultDelayHours } from "@workspace/lib/constants";
import { CITATION_CATEGORIES, type CitationCategory } from "@/lib/domain-categories";
import type { PerPromptDailyCitationStats, PerPromptVisibilityPoint } from "@/lib/postgres-read";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

/** Charts key a series by id and label it by name; nothing else about a brand is read. */
export interface ChartSubject {
	id: string;
	name: string;
}

/** Use a stable one-month default while history loads, then shorten it for brands with less than a week of data. */
export function getDefaultLookbackPeriod(earliestDataDate: string | null | undefined): LookbackPeriod {
	if (!earliestDataDate) {
		return "1m";
	}

	const earliestDate = new Date(earliestDataDate);
	const now = new Date();
	const diffInMs = now.getTime() - earliestDate.getTime();
	const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

	return diffInDays > 7 ? "1m" : "1w";
}

export function getDaysFromLookback(lookback: LookbackPeriod): number {
	switch (lookback) {
		case "1w":
			return 7;
		case "1m":
			return 30;
		case "3m":
			return 90;
		case "6m":
			return 180;
		case "1y":
			return 365;
		case "all":
			// Bound the nominally unbounded UI option so chart queries remain predictable.
			return 365 * 2;
	}
}

export function generateDateRange(startDate: Date, endDate: Date): string[] {
	const dates: string[] = [];
	const current = new Date(startDate);

	while (current <= endDate) {
		dates.push(current.toISOString().split("T")[0]);
		current.setDate(current.getDate() + 1);
	}

	return dates;
}

/**
 * Citation comparison window for a lookback of `days` days — computed entirely in
 * UTC so it's independent of server timezone. The current window is `days` calendar
 * days ending on `today` (inclusive): [today-(days-1), today]. The previous window
 * is the contiguous equal-length window ending the day before the current one
 * starts. `dateRange` is the current window as one YYYY-MM-DD per day (what the
 * trend charts iterate) so totals and charts cover exactly the same span.
 */
export function citationDateWindow(
	today: Date,
	days: number,
): { fromDateStr: string; toDateStr: string; prevFromDateStr: string; prevToDateStr: string; dateRange: string[] } {
	const iso = (d: Date) => d.toISOString().split("T")[0];
	const shift = (base: Date, deltaDays: number) => {
		const d = new Date(base);
		d.setUTCDate(d.getUTCDate() + deltaDays);
		return d;
	};
	const span = Math.max(1, days);
	const from = shift(today, -(span - 1));
	const prevTo = shift(from, -1);
	const prevFrom = shift(prevTo, -(span - 1));
	const dateRange: string[] = [];
	for (let i = 0; i < span; i++) dateRange.push(iso(shift(from, i)));
	return {
		fromDateStr: iso(from),
		toDateStr: iso(today),
		prevFromDateStr: iso(prevFrom),
		prevToDateStr: iso(prevTo),
		dateRange,
	};
}

export interface DailyVisibilityBucket {
	branded: { total: number; mentioned: number };
	nonBranded: { total: number; mentioned: number };
}

/**
 * Walk each prompt's series across `dateRange`, carrying its last observation
 * forward over the days it didn't run. Pre-seeded with the prompt's earliest
 * observation so days before its first run still contribute — otherwise a
 * staggered schedule reads as a ramp-up rather than steady coverage.
 */
function carryForward<V>(
	byPrompt: Map<string, Map<string, V>>,
	dateRange: string[],
	visit: (promptId: string, date: string, carried: V, actual: V | undefined) => void,
): void {
	for (const [promptId, byDate] of byPrompt) {
		const earliest = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))[0]?.[1];
		let carried = earliest;
		for (const date of dateRange) {
			const actual = byDate.get(date);
			if (actual !== undefined) carried = actual;
			if (carried === undefined) continue;
			visit(promptId, date, carried, actual);
		}
	}
}

/**
 * Per-prompt Last Value Carried Forward (LVCF) for visibility data.
 *
 * For each prompt, carries forward its last known (total_runs, brand_mentioned_count)
 * to fill gap days when it didn't run. Then aggregates across all prompts per day,
 * split by branded/non-branded status.
 *
 * This eliminates periodic artifacts caused by staggered prompt schedules:
 * every prompt contributes to every day's aggregate via its last observation.
 */
export function applyPerPromptLVCF(
	perPromptData: PerPromptVisibilityPoint[],
	dateRange: string[],
	brandedPromptIds: string[],
): {
	dailyVisibilityMap: Map<string, DailyVisibilityBucket>;
	totalBrandedRuns: number;
	totalBrandedMentioned: number;
	totalNonBrandedRuns: number;
	totalNonBrandedMentioned: number;
} {
	const brandedSet = new Set(brandedPromptIds);

	const byPrompt = new Map<string, Map<string, { total: number; mentioned: number }>>();
	for (const row of perPromptData) {
		const byDate = byPrompt.get(row.prompt_id) ?? new Map<string, { total: number; mentioned: number }>();
		byDate.set(String(row.date), { total: Number(row.total_runs), mentioned: Number(row.brand_mentioned_count) });
		byPrompt.set(row.prompt_id, byDate);
	}

	const dailyVisibilityMap = new Map<string, DailyVisibilityBucket>();
	const observed = {
		branded: { runs: 0, mentioned: 0 },
		nonBranded: { runs: 0, mentioned: 0 },
	};

	carryForward(byPrompt, dateRange, (promptId, date, carried, actual) => {
		const isBranded = brandedSet.has(promptId);
		const bucket = dailyVisibilityMap.get(date) ?? {
			branded: { total: 0, mentioned: 0 },
			nonBranded: { total: 0, mentioned: 0 },
		};
		dailyVisibilityMap.set(date, bucket);

		const day = isBranded ? bucket.branded : bucket.nonBranded;
		day.total += carried.total;
		day.mentioned += carried.mentioned;

		// Period totals measure observations, not the synthetic daily series.
		if (!actual) return;
		const period = isBranded ? observed.branded : observed.nonBranded;
		period.runs += actual.total;
		period.mentioned += actual.mentioned;
	});

	return {
		dailyVisibilityMap,
		totalBrandedRuns: observed.branded.runs,
		totalBrandedMentioned: observed.branded.mentioned,
		totalNonBrandedRuns: observed.nonBranded.runs,
		totalNonBrandedMentioned: observed.nonBranded.mentioned,
	};
}

export type CitationCategories = Record<CitationCategory, number>;

/**
 * Generalized per-prompt LVCF with cadence normalization over arbitrary string
 * keys (citation category, page type, …). For each prompt, carries forward its
 * last known per-key counts, normalized by the brand's cadence so daily totals
 * reflect a steady rate rather than spiking on run days. Pre-seeds each prompt
 * with its earliest observation to avoid ramp-up artifacts.
 */
export function applyPerPromptKeyedLVCF<K extends string>(
	rows: { prompt_id: string; date: string | Date; key: K; count: number }[],
	dateRange: string[],
	cadenceHours: number | null | undefined,
	allKeys: readonly K[],
): Map<string, Record<K, number>> {
	const cadenceDays = Math.max(1, Math.ceil((cadenceHours ?? getDefaultDelayHours()) / 24));
	const empty = (): Record<K, number> => Object.fromEntries(allKeys.map((k) => [k, 0])) as Record<K, number>;

	const byPrompt = new Map<string, Map<string, Record<K, number>>>();
	for (const row of rows) {
		const byDate = byPrompt.get(row.prompt_id) ?? new Map<string, Record<K, number>>();
		const date = String(row.date);
		const counts = byDate.get(date) ?? empty();
		counts[row.key] += Number(row.count);
		byDate.set(date, counts);
		byPrompt.set(row.prompt_id, byDate);
	}

	const daily = new Map<string, Record<K, number>>();
	carryForward(byPrompt, dateRange, (_promptId, date, carried) => {
		const day = daily.get(date) ?? empty();
		for (const key of allKeys) day[key] += carried[key] / cadenceDays;
		daily.set(date, day);
	});

	// Values are intentionally left fractional: both consumers
	// convert to percentages via toRoundedPercentages, where the 1/cadenceDays factor
	// cancels exactly — so cadence can't shift the chart, and a tiny category isn't
	// rounded to zero before the percentage is taken.
	return daily;
}

/** Dashboard wrapper that converts citation domains to category keys before smoothing. */
export function applyPerPromptCitationLVCF(
	perPromptData: PerPromptDailyCitationStats[],
	dateRange: string[],
	cadenceHours: number | null | undefined,
	categorizeDomain: (domain: string) => CitationCategory,
): Map<string, CitationCategories> {
	return applyPerPromptKeyedLVCF(
		perPromptData.map((r) => ({
			prompt_id: r.prompt_id,
			date: r.date,
			key: categorizeDomain(r.domain),
			count: Number(r.count),
		})),
		dateRange,
		cadenceHours,
		CITATION_CATEGORIES,
	);
}

/** Map the 0–500 score range to 20-point percentage bands. */
export const normalizeToPercentage = (value: number): number => {
	const percentage = (value / 500) * 100;
	const roundedPercentage = Math.floor(percentage / 20) * 20;
	return Math.min(roundedPercentage, 100);
};

export function getBadgeVariant(value: number): "default" | "secondary" | "destructive" {
	if (value > 75) return "default";
	if (value > 45) return "secondary";
	return "destructive";
}

export function getBadgeClassName(value: number): string {
	if (value > 75) return "bg-emerald-600 hover:bg-emerald-600 text-white";
	if (value > 45) return "bg-amber-500 hover:bg-amber-500 text-white";
	return "bg-rose-500 hover:bg-rose-500 text-white";
}

export interface ChartDataPoint {
	date: string;
	[key: string]: number | string | boolean | null;
}

import type { Competitor, PromptRun } from "@workspace/lib/db/schema";

export function calculateVisibilityPercentages(
	promptRuns: PromptRun[],
	brand: ChartSubject,
	competitors: Competitor[],
	lookback: LookbackPeriod,
	userTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): ChartDataPoint[] {
	let startDate: Date;
	let endDate: Date;

	if (lookback === "all" && promptRuns.length > 0) {
		const sortedRuns = [...promptRuns].sort(
			(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
		const firstRun = sortedRuns[0];
		const lastRun = sortedRuns[sortedRuns.length - 1];

		startDate = new Date(firstRun.createdAt);
		endDate = new Date(lastRun.createdAt);

		// Use local-day bounds so late UTC runs do not spill into the wrong day.
		const startDateString = startDate.toLocaleDateString("en-CA", { timeZone: userTimezone });
		const endDateString = endDate.toLocaleDateString("en-CA", { timeZone: userTimezone });
		startDate = new Date(startDateString);
		endDate = new Date(endDateString);
	} else {
		const daysToSubtract = getDaysFromLookback(lookback);

		// UTC may already be on tomorrow relative to the viewer.
		const now = new Date();
		const currentDateInTimezone = now.toLocaleDateString("en-CA", { timeZone: userTimezone });
		endDate = new Date(currentDateInTimezone);

		startDate = new Date(endDate);
		startDate.setDate(startDate.getDate() - (daysToSubtract - 1));
	}

	const dateRange = generateDateRange(startDate, endDate);

	// Alphabetical order keeps colors stable when mention ranks change.
	const sortedCompetitors = [...competitors].sort((a, b) => a.name.localeCompare(b.name));

	const runsByDate = promptRuns.reduce(
		(acc, run) => {
			const runDate = new Date(run.createdAt);
			const dateKey = runDate.toLocaleDateString("en-CA", { timeZone: userTimezone });

			if (!acc[dateKey]) {
				acc[dateKey] = [];
			}
			acc[dateKey].push(run);
			return acc;
		},
		{} as Record<string, PromptRun[]>,
	);

	return dateRange.map((date) => {
		const runsForDate = runsByDate[date] || [];
		const totalRuns = runsForDate.length;

		const dataPoint: ChartDataPoint = { date };

		if (totalRuns === 0) {
			dataPoint[brand.id] = null;
			sortedCompetitors.forEach((competitor) => {
				dataPoint[competitor.id] = null;
			});
			return dataPoint;
		}

		const brandMentions = runsForDate.filter((run) => run.brandMentioned).length;
		const brandVisibility = Math.round((brandMentions / totalRuns) * 100);
		dataPoint[brand.id] = brandVisibility;

		sortedCompetitors.forEach((competitor) => {
			const competitorMentions = runsForDate.filter(
				(run) => run.competitorsMentioned && run.competitorsMentioned.includes(competitor.name),
			).length;
			const competitorVisibility = Math.round((competitorMentions / totalRuns) * 100);
			dataPoint[competitor.id] = competitorVisibility;
		});

		return dataPoint;
	});
}
export function getCompetitorColor(
	competitorName: string,
	competitors: Competitor[],
	whitelabelColors: string[],
): string {
	const sortedCompetitors = [...competitors].sort((a, b) => a.name.localeCompare(b.name));
	const index = sortedCompetitors.findIndex((c) => c.name === competitorName);

	// Index zero is reserved for the brand.
	const colorIndex = (index + 1) % whitelabelColors.length;
	return whitelabelColors[colorIndex] || whitelabelColors[1];
}

function calculateAverageVisibility(data: ChartDataPoint[], competitorId: string): number {
	const validValues = data
		.map((point) => point[competitorId] as number | null)
		.filter((value) => value !== null && value !== undefined) as number[];

	if (validValues.length === 0) return 0;
	return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

export function selectCompetitorsToDisplay(
	competitors: Competitor[],
	data: ChartDataPoint[],
	maxCompetitors: number = 3,
): Competitor[] {
	const competitorsWithAvgVisibility = competitors.map((competitor) => ({
		competitor,
		avgVisibility: calculateAverageVisibility(data, competitor.id),
	}));

	const sortedByVisibility = competitorsWithAvgVisibility.sort((a, b) => b.avgVisibility - a.avgVisibility);

	const topCompetitors = sortedByVisibility.slice(0, maxCompetitors).map((item) => item.competitor);

	if (topCompetitors.length < maxCompetitors) {
		const selectedIds = new Set(topCompetitors.map((c) => c.id));
		const remaining = competitors
			.filter((c) => !selectedIds.has(c.id))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, maxCompetitors - topCompetitors.length);

		topCompetitors.push(...remaining);
	}

	return topCompetitors;
}

export function getBrandColor(whitelabelColors: string[]): string {
	return whitelabelColors[0];
}

export function filterAndCompleteChartData(chartData: ChartDataPoint[], lookback: LookbackPeriod): ChartDataPoint[] {
	if (lookback === "all") {
		return chartData;
	}

	const daysToSubtract = getDaysFromLookback(lookback);

	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const now = new Date();
	const currentDateInTimezone = now.toLocaleDateString("en-CA", { timeZone: userTimezone });
	const referenceDate = new Date(currentDateInTimezone);

	const startDate = new Date(referenceDate);
	startDate.setDate(startDate.getDate() - (daysToSubtract - 1));

	const dateRange = generateDateRange(startDate, referenceDate);

	const filteredData = chartData.filter((item) => {
		const date = new Date(item.date);
		return date >= startDate && date <= referenceDate;
	});

	return dateRange.map((date) => {
		const existingData = filteredData.find((item) => item.date === date);
		return (
			existingData || {
				date,
			}
		);
	});
}

/**
 * Extends line chart data to the edges of the time frame.
 * For each entity (brand/competitor), extends the first non-null value backward
 * to fill the start of the chart, and extends the last non-null value forward
 * to fill the end of the chart. This prevents gaps at the edges of the chart
 * when data collection started mid-period or hasn't been collected yet for recent dates.
 *
 * Extended points are marked with `_extended_{key}: true` so the chart can:
 * - Skip rendering dots for extended points
 * - Skip showing extended values in tooltips
 */
export function extendLinesToChartEdges(chartData: ChartDataPoint[], dataKeys: string[]): ChartDataPoint[] {
	if (chartData.length === 0) return chartData;

	// Extension flags belong to the rendered copy, not the query cache.
	const extendedData = chartData.map((point) => ({ ...point }));

	for (const key of dataKeys) {
		const observed = extendedData
			.map((point, index) => ({ index, value: point[key] }))
			.filter((entry) => entry.value !== null && entry.value !== undefined);
		const first = observed[0];
		const last = observed[observed.length - 1];
		if (!first || !last) continue;

		for (let i = 0; i < first.index; i++) {
			extendedData[i][key] = first.value;
			extendedData[i][`_extended_${key}`] = true;
		}
		for (let i = last.index + 1; i < extendedData.length; i++) {
			extendedData[i][key] = last.value;
			extendedData[i][`_extended_${key}`] = true;
		}
	}

	return extendedData;
}

export function isExtendedDataPoint(dataPoint: ChartDataPoint, key: string): boolean {
	return dataPoint[`_extended_${key}`] === true;
}

/**
 * Create a mapping from prompt IDs to their oldest web query (first alphabetically if multiple from same time)
 */
export function createPromptToWebQueryMapping(promptRuns: PromptRun[]): Record<string, string> {
	const promptToWebQuery: Record<string, string> = {};

	const promptRunsByPromptId = promptRuns.reduce(
		(acc, run) => {
			if (!acc[run.promptId]) {
				acc[run.promptId] = [];
			}
			acc[run.promptId].push(run);
			return acc;
		},
		{} as Record<string, PromptRun[]>,
	);

	Object.entries(promptRunsByPromptId).forEach(([promptId, runs]) => {
		const runsWithWebQueries = runs.filter((run) => run.webQueries && run.webQueries.length > 0);

		if (runsWithWebQueries.length === 0) return;

		runsWithWebQueries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

		const oldestDate = runsWithWebQueries[0].createdAt;
		const oldestRuns = runsWithWebQueries.filter(
			(run) => new Date(run.createdAt).getTime() === new Date(oldestDate).getTime(),
		);

		const allWebQueries: string[] = [];
		oldestRuns.forEach((run) => {
			if (run.webQueries) {
				allWebQueries.push(...run.webQueries);
			}
		});

		if (allWebQueries.length > 0) {
			allWebQueries.sort();
			promptToWebQuery[promptId] = allWebQueries[0];
		}
	});

	return promptToWebQuery;
}
