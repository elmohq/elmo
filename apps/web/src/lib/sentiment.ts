// Imported by the browser too, so it reads nothing from the database layer but types.
import type { DailyAssessments } from "@/lib/rollup-read";
import { shiftDateStr } from "@/lib/timezone-utils";

/** The mention judge's assessments summed over runs that mention a company. */
export interface AssessmentSums {
	positive_runs: number;
	neutral_runs: number;
	negative_runs: number;
	mixed_runs: number;
	/** The company's position summed over the runs that rank it; see `averagePosition`. */
	position_sum: number;
	positioned_runs: number;
}

export const NO_ASSESSMENTS: AssessmentSums = {
	positive_runs: 0,
	neutral_runs: 0,
	negative_runs: 0,
	mixed_runs: 0,
	position_sum: 0,
	positioned_runs: 0,
};

export interface SentimentCounts {
	positive: number;
	neutral: number;
	negative: number;
	mixed: number;
}

export interface SentimentSummary extends SentimentCounts {
	/** Fractions of 1 of the mentions with a sentiment; null with none. */
	positiveShare: number | null;
	negativeShare: number | null;
}

export interface MentionQuality {
	sentiment: SentimentSummary;
	/** `average` is 1 when it's always the first tracked company named; null when never ranked. */
	position: { average: number | null };
}

export interface SentimentPoint {
	date: string;
	/** Share of the trailing window's mentions with a sentiment that were positive; null with none. */
	positive: number | null;
	negative: number | null;
}

export const SENTIMENT_WINDOW_DAYS = 7;

/** Runs with a tone the judge could call; shares are of these. */
const tonedRuns = (sums: AssessmentSums) =>
	sums.positive_runs + sums.neutral_runs + sums.negative_runs + sums.mixed_runs;

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * Positive and negative shares per day over a trailing window: a brand turns up in only some
 * answers each day, so single days swing on a handful of mentions. `rows` should start
 * `windowDays - 1` days before `dateRange` so its first days get a full window.
 */
export function sentimentSeries(
	rows: DailyAssessments[],
	dateRange: string[],
	windowDays = SENTIMENT_WINDOW_DAYS,
): SentimentPoint[] {
	return trailing(rows, dateRange, windowDays, (window) => {
		const toned = tonedRuns(window);
		return { positive: share(window.positive_runs, toned), negative: share(window.negative_runs, toned) };
	});
}

export interface PositionPoint {
	date: string;
	/** 1 is named first; null when never ranked. */
	average: number | null;
}

/** One decimal: positions are small whole numbers, so a finer average only adds noise. */
export function averagePosition(sum: number, runs: number): number | null {
	return runs > 0 ? Math.round((sum / runs) * 10) / 10 : null;
}

/** Trailing window for the same reason as `sentimentSeries`. */
export function positionSeries(
	rows: DailyAssessments[],
	dateRange: string[],
	windowDays = SENTIMENT_WINDOW_DAYS,
): PositionPoint[] {
	return trailing(rows, dateRange, windowDays, (window) => ({
		average: averagePosition(window.position_sum, window.positioned_runs),
	}));
}

const ASSESSMENT_KEYS = Object.keys(NO_ASSESSMENTS) as (keyof AssessmentSums)[];

export function sumAssessments(rows: AssessmentSums[]): AssessmentSums {
	const total = { ...NO_ASSESSMENTS };
	for (const row of rows) for (const key of ASSESSMENT_KEYS) total[key] += row[key];
	return total;
}

function trailing<T>(
	rows: DailyAssessments[],
	dateRange: string[],
	windowDays: number,
	read: (window: AssessmentSums) => T,
) {
	const byDate = new Map(rows.map((row) => [row.date, row]));
	return dateRange.map((date) => {
		const days = Array.from({ length: windowDays }, (_, back) => byDate.get(shiftDateStr(date, { days: -back })));
		return { date, ...read(sumAssessments(days.filter((row) => row !== undefined))) };
	});
}

export function sentimentCounts(sums: AssessmentSums): SentimentCounts {
	return {
		positive: sums.positive_runs,
		neutral: sums.neutral_runs,
		negative: sums.negative_runs,
		mixed: sums.mixed_runs,
	};
}

export function sentimentSummary(sums: AssessmentSums): SentimentSummary {
	const toned = tonedRuns(sums);
	return {
		...sentimentCounts(sums),
		positiveShare: toned > 0 ? sums.positive_runs / toned : null,
		negativeShare: toned > 0 ? sums.negative_runs / toned : null,
	};
}

export function mentionQuality(sums: AssessmentSums): MentionQuality {
	return {
		sentiment: sentimentSummary(sums),
		position: { average: averagePosition(sums.position_sum, sums.positioned_runs) },
	};
}
