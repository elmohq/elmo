// Imported by the browser too, so it reads nothing from the database layer.
import type { Sentiment } from "@workspace/lib/mentions";
import { z } from "zod";
import type { sentimentSummarySchema } from "@/lib/api/schemas/sentiment";

export type { Sentiment };
export const SENTIMENTS = ["positive", "neutral", "mixed", "negative"] as const satisfies readonly Sentiment[];

export const sentimentFilterSchema = z.enum([...SENTIMENTS, "unmentioned"]);
export type SentimentFilter = z.infer<typeof sentimentFilterSchema>;

export const responseSortSchema = z.enum(["newest", "negative", "positive"]);
export type ResponseSort = z.infer<typeof responseSortSchema>;

/** `all` includes mentions with no sentiment, such as answers that only link to the brand. */
export type SentimentFilterCounts = Record<SentimentFilter, number> & { all: number };

/**
 * Okabe–Ito hues, so positive and negative stay apart under the common colour-vision deficiencies.
 * `text` is a darker shade of `color` that keeps contrast on white.
 */
export const SENTIMENT_STYLES: Record<Sentiment, { label: string; color: string; text: string; soft: string }> = {
	positive: {
		label: "Positive",
		color: "#009E73",
		text: "text-[#00795a]",
		soft: "bg-[#009E73]/15",
	},
	neutral: {
		label: "Neutral",
		color: "#cbd5e1",
		text: "text-slate-500",
		soft: "bg-slate-200/70",
	},
	mixed: {
		label: "Mixed",
		color: "#E69F00",
		text: "text-[#a66f00]",
		soft: "bg-[#E69F00]/20",
	},
	negative: {
		label: "Negative",
		color: "#D55E00",
		text: "text-[#b34d00]",
		soft: "bg-[#D55E00]/15",
	},
};

/** Answers with a sentiment: the base every sentiment share is of. */
export const sentimentTotal = (counts: Record<Sentiment, number>) =>
	SENTIMENTS.reduce((sum, sentiment) => sum + counts[sentiment], 0);

export const isSentiment = (value: unknown): value is Sentiment => SENTIMENTS.includes(value as Sentiment);

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

export type SentimentCounts = Record<Sentiment, number>;

export type SentimentSummary = z.infer<typeof sentimentSummarySchema>;

export interface MentionQuality {
	sentiment: SentimentSummary;
	/** `average` is 1 when it's always the first tracked company named; null when never ranked. */
	position: { average: number | null };
}

/** Runs with a sentiment; shares are of these. */
const sentimentRuns = (sums: AssessmentSums) =>
	sums.positive_runs + sums.neutral_runs + sums.negative_runs + sums.mixed_runs;

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
	const withSentiment = sentimentRuns(sums);
	return {
		...sentimentCounts(sums),
		score: withSentiment > 0 ? (sums.positive_runs + (sums.neutral_runs + sums.mixed_runs) / 2) / withSentiment : null,
	};
}

export function mentionQuality(sums: AssessmentSums): MentionQuality {
	return {
		sentiment: sentimentSummary(sums),
		position: { average: averagePosition(sums.position_sum, sums.positioned_runs) },
	};
}
