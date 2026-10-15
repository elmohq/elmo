/**
 * Filtering and ordering individual runs by the tone of the answer toward the brand, read from the
 * mention judge's verdict. Runs without a verdict, or whose tone the judge couldn't call, match no
 * tone but still count among all runs.
 */
import { type SQL, sql } from "drizzle-orm";
import type { ResponseSort, Tone, ToneCounts, ToneFilter } from "@/lib/tone";

/** The run_mentions columns a tone is read from, as qualified references. */
export interface ToneColumns {
	mentioned: SQL;
	assessments: SQL;
}

export const toneColumns = (alias: string): ToneColumns => ({
	mentioned: sql.raw(`${alias}.brand_mentioned`),
	assessments: sql.raw(`${alias}.assessments`),
});

/** The brand's tone, only where the brand counts as mentioned; null otherwise. */
export const brandTone = (c: ToneColumns): SQL =>
	sql`(CASE WHEN ${c.mentioned} THEN ${c.assessments}->'brand'->>'sentiment' END)`;

export function toneCondition(c: ToneColumns, tone: ToneFilter | undefined): SQL {
	if (!tone) return sql`TRUE`;
	if (tone === "unmentioned") return sql`NOT ${c.mentioned}`;
	return sql`${brandTone(c)} = ${tone}`;
}

/**
 * The strongest of `order` first; within a tone, the verdicts the judge was surest of. Runs with
 * no tone go last.
 */
function toneRank(c: ToneColumns, order: readonly Tone[]): SQL {
	const tone = brandTone(c);
	// Ranks are literals: as parameters they'd be untyped and sort as text.
	const cases = order.map((t, i) => sql`WHEN ${t} THEN ${sql.raw(String(i))}`);
	return sql`(CASE ${tone} ${sql.join(cases, sql` `)} ELSE ${sql.raw(String(order.length))} END)`;
}

const probability = (c: ToneColumns, tone: Tone): SQL =>
	sql`COALESCE((${c.assessments}->'brand'->'sentimentProbabilities'->>${sql.raw(`'${tone}'`)})::float8, 0)`;

export function responseOrder(c: ToneColumns, sort: ResponseSort | undefined, createdAt: SQL, id: SQL): SQL {
	if (sort === "negative") {
		return sql`${toneRank(c, ["negative", "mixed", "neutral", "positive"])}, ${probability(c, "negative")} DESC, ${createdAt} DESC, ${id}`;
	}
	if (sort === "positive") {
		return sql`${toneRank(c, ["positive", "neutral", "mixed", "negative"])}, ${probability(c, "positive")} DESC, ${createdAt} DESC, ${id}`;
	}
	return sql`${createdAt} DESC, ${id}`;
}

/** One row per tone bucket, with null for mentioned runs that have no tone. */
export const toneBucket = (c: ToneColumns): SQL =>
	sql`(CASE WHEN NOT ${c.mentioned} THEN 'unmentioned' ELSE ${brandTone(c)} END)`;

export function toToneCounts(rows: { bucket: string | null; runs: number }[]): ToneCounts {
	const counts: ToneCounts = { positive: 0, neutral: 0, mixed: 0, negative: 0, unmentioned: 0, all: 0 };
	for (const row of rows) {
		counts.all += row.runs;
		if (row.bucket && row.bucket in counts) counts[row.bucket as ToneFilter] += row.runs;
	}
	return counts;
}
