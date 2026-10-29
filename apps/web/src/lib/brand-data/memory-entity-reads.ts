/** Entity reads and sentiment quotes, answered from a brand's in-memory store. */

import type { MentionAssessment } from "@workspace/lib/mentions";
import type { AnalyticsBrandRow, AnalyticsCompetitorRow, AnalyticsPromptRow } from "@/lib/analytics/entities";
import type { PromptListScope } from "@/lib/analytics-sql";
import { storeFor } from "@/lib/brand-data/memory-reads";
import { scopeRows } from "@/lib/brand-data/scope";
import type { SentimentQuoteRow } from "@/lib/postgres-read";
import type { Sentiment } from "@/lib/sentiment";

export async function getBrandRow(brandId: string): Promise<AnalyticsBrandRow | undefined> {
	return storeFor(brandId).bundle.brand;
}

export async function getCompetitorRows(brandId: string): Promise<AnalyticsCompetitorRow[]> {
	return storeFor(brandId).bundle.competitors;
}

export async function getPromptRows(brandId: string): Promise<AnalyticsPromptRow[]> {
	return storeFor(brandId).bundle.prompts.map((prompt) => ({ ...prompt, createdAt: new Date(prompt.createdAt) }));
}

export interface QuoteText {
	id: string;
	brand: MentionAssessment;
	text_content: string;
}

const quoteTexts = new Map<string, { brand: SentimentQuoteRow["brand"]; text_content: string }>();

/** Picks the quotes from the local rollups as the SQL does, then fetches only their answers' text. */
export async function getSentimentQuotes(
	scope: PromptListScope,
	sentiments: readonly Sentiment[],
	limit: number,
): Promise<SentimentQuoteRow[]> {
	if (scope.promptIds.length === 0 || sentiments.length === 0) return [];
	const store = storeFor(scope.brandId);
	const t = store.sentimentQuotes;
	const wanted = new Set(sentiments as readonly string[]);
	const best = new Map<string, number>();
	const better = (a: number, b: number) =>
		t.confidence[a] !== t.confidence[b]
			? t.confidence[a] > t.confidence[b]
			: t.createdAt[a] !== t.createdAt[b]
				? t.createdAt[a] > t.createdAt[b]
				: t.runId[a] < t.runId[b];
	for (const i of scopeRows(store, t, scope)) {
		const sentiment = store.bundle.dicts.sentiments[t.sentiment[i]];
		if (!wanted.has(sentiment)) continue;
		const key = `${sentiment}|${t.prompt[i]}`;
		const current = best.get(key);
		if (current === undefined || better(i, current)) best.set(key, i);
	}
	const picked: { sentiment: string; index: number }[] = [];
	for (const sentiment of [...wanted].sort()) {
		const side = [...best]
			.filter(([key]) => key.startsWith(`${sentiment}|`))
			.map(([, index]) => index)
			.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0))
			.slice(0, limit);
		for (const index of side) picked.push({ sentiment, index });
	}
	const missing = picked.map(({ index }) => t.runId[index]).filter((id) => !quoteTexts.has(id));
	if (missing.length > 0) {
		const response = await fetch(
			`/api/brand-data/${encodeURIComponent(scope.brandId)}/quotes?runIds=${missing.join(",")}`,
			{ credentials: "same-origin" },
		);
		if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
		for (const row of (await response.json()) as QuoteText[]) {
			quoteTexts.set(row.id, { brand: row.brand, text_content: row.text_content });
		}
	}
	return picked.flatMap(({ sentiment, index }) => {
		const text = quoteTexts.get(t.runId[index]);
		if (!text) return [];
		return [
			{
				id: t.runId[index],
				prompt_id: store.bundle.prompts[t.prompt[index]].id,
				model: store.bundle.dicts.models[t.model[index]],
				created_at: new Date(t.createdAt[index]).toISOString(),
				sentiment: sentiment as Sentiment,
				brand: text.brand,
				text_content: text.text_content,
			},
		];
	});
}
