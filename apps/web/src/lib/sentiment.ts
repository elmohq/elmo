// Imported by the browser too, so it reads nothing from the database layer.
import type { Tone } from "@/lib/tone";

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

export type SentimentCounts = Record<Tone, number>;

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

/** Runs with a tone the judge could call; shares are of these. */
const tonedRuns = (sums: AssessmentSums) =>
	sums.positive_runs + sums.neutral_runs + sums.negative_runs + sums.mixed_runs;

export interface PositionPoint {
	date: string;
	/** The brand's average position that day, 1 being named first; null when never ranked. */
	average: number | null;
}

/** One decimal: positions are small whole numbers, so a finer average only adds noise. */
export function averagePosition(sum: number, runs: number): number | null {
	return runs > 0 ? Math.round((sum / runs) * 10) / 10 : null;
}

const ASSESSMENT_KEYS = Object.keys(NO_ASSESSMENTS) as (keyof AssessmentSums)[];

export function sumAssessments(rows: AssessmentSums[]): AssessmentSums {
	const total = { ...NO_ASSESSMENTS };
	for (const row of rows) for (const key of ASSESSMENT_KEYS) total[key] += row[key];
	return total;
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
