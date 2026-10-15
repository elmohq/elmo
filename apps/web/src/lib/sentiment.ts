import type { DailySentiment, MentionTotals } from "@/lib/rollup-read";

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

/** `date` (YYYY-MM-DD) moved by `days`. */
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
	rows: DailySentiment[],
	dateRange: string[],
	windowDays = SENTIMENT_WINDOW_DAYS,
): SentimentPoint[] {
	const byDate = new Map(rows.map((row) => [row.date, row]));
	return dateRange.map((date) => {
		let positive = 0;
		let negative = 0;
		let clear = 0;
		for (let back = 0; back < windowDays; back++) {
			const row = byDate.get(shiftDate(date, -back));
			if (!row) continue;
			positive += row.positive_runs;
			negative += row.negative_runs;
			clear += row.positive_runs + row.neutral_runs + row.negative_runs + row.mixed_runs;
		}
		return { date, positive: share(positive, clear), negative: share(negative, clear) };
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
