/**
 * For queries that join `run_mentions` as `rm`. Runs without a sentiment match none but still count
 * among all runs.
 */
import { type SQL, sql } from "drizzle-orm";
import type { ResponseSort, Sentiment, SentimentFilter, SentimentFilterCounts } from "@/lib/sentiment";

const brandSentiment = sql`(CASE WHEN rm.brand_mentioned THEN rm.assessments->'brand'->>'sentiment' END)`;

export const sentimentConfidence = sql`COALESCE((rm.assessments->'brand'->'sentimentProbabilities'->>(rm.assessments->'brand'->>'sentiment'))::float8, 0)`;

export function sentimentCondition(sentiment: SentimentFilter | undefined): SQL {
	if (!sentiment) return sql`TRUE`;
	if (sentiment === "unmentioned") return sql`NOT rm.brand_mentioned`;
	return sql`${brandSentiment} = ${sentiment}`;
}

export const sentimentRank = (order: readonly Sentiment[]): SQL =>
	sql`array_position(ARRAY[${sql.join(
		order.map((sentiment) => sql`${sentiment}`),
		sql`, `,
	)}]::text[], ${brandSentiment})`;

const probability = (sentiment: Sentiment): SQL =>
	sql`COALESCE((rm.assessments->'brand'->'sentimentProbabilities'->>${sentiment}::text)::float8, 0)`;

export function responseOrder(sort: ResponseSort | undefined): SQL {
	if (sort === "negative") {
		return sql`${sentimentRank(["negative", "mixed", "neutral", "positive"])} NULLS LAST, ${probability("negative")} DESC, pr.created_at DESC, pr.id`;
	}
	if (sort === "positive") {
		return sql`${sentimentRank(["positive", "neutral", "mixed", "negative"])} NULLS LAST, ${probability("positive")} DESC, pr.created_at DESC, pr.id`;
	}
	return sql`pr.created_at DESC, pr.id`;
}

export const sentimentBucket = sql`(CASE WHEN NOT rm.brand_mentioned THEN 'unmentioned' ELSE ${brandSentiment} END)`;

export function toSentimentFilterCounts(rows: { bucket: string | null; runs: number }[]): SentimentFilterCounts {
	const counts: SentimentFilterCounts = { positive: 0, neutral: 0, mixed: 0, negative: 0, unmentioned: 0, all: 0 };
	for (const row of rows) {
		counts.all += row.runs;
		if (row.bucket && row.bucket in counts) counts[row.bucket as SentimentFilter] += row.runs;
	}
	return counts;
}
