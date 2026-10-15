/**
 * Filtering and ordering individual runs by the tone of the answer toward the brand, read from the
 * mention judge's assessment, over a query that joins `run_mentions` as `rm`. Runs without an assessment,
 * or whose tone the judge couldn't call, match no tone but still count among all runs.
 */
import { type SQL, sql } from "drizzle-orm";
import type { ResponseSort, Tone, ToneCounts, ToneFilter } from "@/lib/tone";

/** The brand's tone, only where the brand counts as mentioned; null otherwise. */
const brandTone = sql`(CASE WHEN rm.brand_mentioned THEN rm.assessments->'brand'->>'sentiment' END)`;

/** How sure the judge was of the tone it called. */
export const toneConfidence = sql`COALESCE((rm.assessments->'brand'->'sentimentProbabilities'->>(rm.assessments->'brand'->>'sentiment'))::float8, 0)`;

export function toneCondition(tone: ToneFilter | undefined): SQL {
	if (!tone) return sql`TRUE`;
	if (tone === "unmentioned") return sql`NOT rm.brand_mentioned`;
	return sql`${brandTone} = ${tone}`;
}

/** Each run's place in `order` by its tone, from 1; null for a tone outside it, or none. */
export const toneRank = (order: readonly Tone[]): SQL =>
	sql`array_position(ARRAY[${sql.join(
		order.map((tone) => sql`${tone}`),
		sql`, `,
	)}]::text[], ${brandTone})`;

const probability = (tone: Tone): SQL =>
	sql`COALESCE((rm.assessments->'brand'->'sentimentProbabilities'->>${tone}::text)::float8, 0)`;

/** The strongest tone first; within a tone, the assessments the judge was surest of. Runs with no tone go last. */
export function responseOrder(sort: ResponseSort | undefined): SQL {
	if (sort === "negative") {
		return sql`${toneRank(["negative", "mixed", "neutral", "positive"])} NULLS LAST, ${probability("negative")} DESC, pr.created_at DESC, pr.id`;
	}
	if (sort === "positive") {
		return sql`${toneRank(["positive", "neutral", "mixed", "negative"])} NULLS LAST, ${probability("positive")} DESC, pr.created_at DESC, pr.id`;
	}
	return sql`pr.created_at DESC, pr.id`;
}

/** One bucket per tone, plus `unmentioned`; null for mentioned runs that have no tone. */
export const toneBucket = sql`(CASE WHEN NOT rm.brand_mentioned THEN 'unmentioned' ELSE ${brandTone} END)`;

export function toToneCounts(rows: { bucket: string | null; runs: number }[]): ToneCounts {
	const counts: ToneCounts = { positive: 0, neutral: 0, mixed: 0, negative: 0, unmentioned: 0, all: 0 };
	for (const row of rows) {
		counts.all += row.runs;
		if (row.bucket && row.bucket in counts) counts[row.bucket as ToneFilter] += row.runs;
	}
	return counts;
}
