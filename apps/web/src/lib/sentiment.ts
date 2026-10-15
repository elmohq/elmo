import type { DailyVerdicts, MentionTotals } from "@/lib/rollup-read";

export interface SentimentCounts {
	positive: number;
	neutral: number;
	negative: number;
	mixed: number;
}

export interface SentimentPoint {
	date: string;
	/** Share of the trailing window's mentions with a clear tone that were positive; null with none. */
	positive: number | null;
	negative: number | null;
}

export const SENTIMENT_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function shiftDate(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * Positive and negative shares per day over a trailing window: a brand turns up in only some
 * answers each day, so single days swing on a handful of mentions. `rows` should start
 * `windowDays - 1` days before `dateRange` so its first days get a full window.
 */
export function sentimentSeries(
	rows: DailyVerdicts[],
	dateRange: string[],
	windowDays = SENTIMENT_WINDOW_DAYS,
): SentimentPoint[] {
	return trailing(rows, dateRange, windowDays, (window) => {
		const clear = window.positive_runs + window.neutral_runs + window.negative_runs + window.mixed_runs;
		return { positive: share(window.positive_runs, clear), negative: share(window.negative_runs, clear) };
	});
}

export interface PositionPoint {
	date: string;
	/** The brand's average position over the trailing window, 1 being named first; null when never ranked. */
	average: number | null;
}

/** One decimal: positions are small whole numbers, so a finer average only adds noise. */
export function averagePosition(sum: number, runs: number): number | null {
	return runs > 0 ? Math.round((sum / runs) * 10) / 10 : null;
}

/** The brand's average position per day over a trailing window, for the same reason as `sentimentSeries`. */
export function positionSeries(
	rows: DailyVerdicts[],
	dateRange: string[],
	windowDays = SENTIMENT_WINDOW_DAYS,
): PositionPoint[] {
	return trailing(rows, dateRange, windowDays, (window) => ({
		average: averagePosition(window.position_sum, window.positioned_runs),
	}));
}

type Sums = Omit<DailyVerdicts, "date">;

function trailing<T>(rows: DailyVerdicts[], dateRange: string[], windowDays: number, read: (window: Sums) => T) {
	const byDate = new Map(rows.map((row) => [row.date, row]));
	return dateRange.map((date) => {
		const window: Sums = {
			positive_runs: 0,
			neutral_runs: 0,
			negative_runs: 0,
			mixed_runs: 0,
			position_sum: 0,
			positioned_runs: 0,
		};
		for (let back = 0; back < windowDays; back++) {
			const row = byDate.get(shiftDate(date, -back));
			if (!row) continue;
			for (const key of Object.keys(window) as (keyof Sums)[]) window[key] += row[key];
		}
		return { date, ...read(window) };
	});
}

export function sentimentCounts(totals: MentionTotals): SentimentCounts {
	return {
		positive: totals.positive_runs,
		neutral: totals.neutral_runs,
		negative: totals.negative_runs,
		mixed: totals.mixed_runs,
	};
}
