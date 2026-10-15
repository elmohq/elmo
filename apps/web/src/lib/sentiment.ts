import type { DailySentiment } from "@/lib/rollup-read";

export interface SentimentCounts {
	positive: number;
	neutral: number;
	negative: number;
	mixed: number;
}

export interface SentimentPoint {
	date: string;
	/** Share of the trailing window's sentiment-judged mentions that were positive; null with none. */
	positive: number | null;
	negative: number | null;
}

const judged = (c: SentimentCounts) => c.positive + c.neutral + c.negative + c.mixed;
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * Positive and negative shares per day over a trailing window: a brand turns up in only some
 * answers each day, so single days swing on a handful of mentions.
 */
export function sentimentSeries(rows: DailySentiment[], dateRange: string[], windowDays = 7): SentimentPoint[] {
	const byDate = new Map(rows.map((row) => [row.date, row]));
	return dateRange.map((date, i) => {
		const window = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
		for (const day of dateRange.slice(Math.max(0, i - windowDays + 1), i + 1)) {
			const row = byDate.get(day);
			if (!row) continue;
			window.positive += row.positive_runs;
			window.neutral += row.neutral_runs;
			window.negative += row.negative_runs;
			window.mixed += row.mixed_runs;
		}
		return { date, positive: share(window.positive, judged(window)), negative: share(window.negative, judged(window)) };
	});
}

export function sentimentTotals(rows: DailySentiment[]): SentimentCounts & { uncertainMentions: number } {
	return rows.reduce(
		(sum, row) => ({
			positive: sum.positive + row.positive_runs,
			neutral: sum.neutral + row.neutral_runs,
			negative: sum.negative + row.negative_runs,
			mixed: sum.mixed + row.mixed_runs,
			uncertainMentions: sum.uncertainMentions + row.uncertain_mention_runs,
		}),
		{ positive: 0, neutral: 0, negative: 0, mixed: 0, uncertainMentions: 0 },
	);
}
