/**
 * For queries that join `run_mentions` as `rm`. Runs without an assessment, or whose tone the judge
 * couldn't call, match no tone but still count among all runs.
 */
import { type SQL, sql } from "drizzle-orm";
import type { ResponseSort, Tone, ToneCounts, ToneFilter } from "@/lib/tone";

const brandTone = sql`(CASE WHEN rm.brand_mentioned THEN rm.assessments->'brand'->>'sentiment' END)`;

export const toneConfidence = sql`COALESCE((rm.assessments->'brand'->'sentimentProbabilities'->>(rm.assessments->'brand'->>'sentiment'))::float8, 0)`;

export function toneCondition(tone: ToneFilter | undefined): SQL {
	if (!tone) return sql`TRUE`;
	if (tone === "unmentioned") return sql`NOT rm.brand_mentioned`;
	return sql`${brandTone} = ${tone}`;
}

export const toneRank = (order: readonly Tone[]): SQL =>
	sql`array_position(ARRAY[${sql.join(
		order.map((tone) => sql`${tone}`),
		sql`, `,
	)}]::text[], ${brandTone})`;

const probability = (tone: Tone): SQL =>
	sql`COALESCE((rm.assessments->'brand'->'sentimentProbabilities'->>${tone}::text)::float8, 0)`;

export function responseOrder(sort: ResponseSort | undefined): SQL {
	if (sort === "negative") {
		return sql`${toneRank(["negative", "mixed", "neutral", "positive"])} NULLS LAST, ${probability("negative")} DESC, pr.created_at DESC, pr.id`;
	}
	if (sort === "positive") {
		return sql`${toneRank(["positive", "neutral", "mixed", "negative"])} NULLS LAST, ${probability("positive")} DESC, pr.created_at DESC, pr.id`;
	}
	return sql`pr.created_at DESC, pr.id`;
}

export const toneBucket = sql`(CASE WHEN NOT rm.brand_mentioned THEN 'unmentioned' ELSE ${brandTone} END)`;

export function toToneCounts(rows: { bucket: string | null; runs: number }[]): ToneCounts {
	const counts: ToneCounts = { positive: 0, neutral: 0, mixed: 0, negative: 0, unmentioned: 0, all: 0 };
	for (const row of rows) {
		counts.all += row.runs;
		if (row.bucket && row.bucket in counts) counts[row.bucket as ToneFilter] += row.runs;
	}
	return counts;
}
