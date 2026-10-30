import type { MentionAssessment } from "@workspace/lib/mentions";
import type { AnalyticsBrandRow, AnalyticsCompetitorRow, AnalyticsPromptRow } from "@/lib/analytics/entities";
import type { PromptListScope } from "@/lib/analytics-sql";
import { storeFor } from "@/lib/brand-data/memory-reads";
import { scopeRows } from "@/lib/brand-data/scope";
import type { BrandStore } from "@/lib/brand-data/store";
import type { SentimentQuoteRow } from "@/lib/postgres-read";
import type { Sentiment } from "@/lib/sentiment";

export async function getBrandRow(brandId: string): Promise<AnalyticsBrandRow | undefined> {
	return storeFor(brandId).bundle.brand;
}

export async function getCompetitorRows(brandId: string): Promise<AnalyticsCompetitorRow[]> {
	return storeFor(brandId).bundle.competitors;
}

export async function getPromptRows(brandId: string): Promise<AnalyticsPromptRow[]> {
	return storeFor(brandId).bundle.prompts.map(({ firstEvaluatedAt: _, ...prompt }) => ({
		...prompt,
		createdAt: new Date(prompt.createdAt),
	}));
}

export interface QuoteText {
	id: string;
	brand: MentionAssessment;
	text_content: string;
}

export type QuoteTextLoader = (brandId: string, runIds: string[]) => Promise<QuoteText[]>;

/** Picks the quotes from the local rollups as the SQL does, then loads only their answers' text. */
type Quotes = BrandStore["sentimentQuotes"];

/** Mirrors the SQL's tie-breaks: most confident, then newest, then lowest run id. */
const beats = (t: Quotes, a: number, b: number) =>
	t.confidence[a] !== t.confidence[b]
		? t.confidence[a] > t.confidence[b]
		: t.createdAt[a] !== t.createdAt[b]
			? t.createdAt[a] > t.createdAt[b]
			: t.runId[a] < t.runId[b];

/** Mirrors `getSentimentQuotes`: the best quote per sentiment and prompt, then the best `limit` per sentiment. */
function pickQuotes(store: BrandStore, scope: PromptListScope, sentiments: readonly Sentiment[], limit: number) {
	const t = store.sentimentQuotes;
	const wanted = new Set<string>(sentiments);
	const best = new Map<string, number>();
	for (const i of scopeRows(store, t, scope)) {
		const sentiment = store.bundle.dicts.sentiments[t.sentiment[i]];
		if (!wanted.has(sentiment)) continue;
		const key = `${sentiment}|${t.prompt[i]}`;
		const current = best.get(key);
		if (current === undefined || beats(t, i, current)) best.set(key, i);
	}
	return [...wanted].sort().flatMap((sentiment) =>
		[...best]
			.filter(([key]) => key.startsWith(`${sentiment}|`))
			.map(([, index]) => index)
			.sort((a, b) => (beats(t, a, b) ? -1 : beats(t, b, a) ? 1 : 0))
			.slice(0, limit)
			.map((index) => ({ sentiment: sentiment as Sentiment, index })),
	);
}

/** Picks quotes from the local rollups, then loads only those answers' text. */
export function sentimentQuoteReader(loadQuoteTexts: QuoteTextLoader) {
	const texts = new WeakMap<BrandStore, Map<string, QuoteText>>();
	return async function getSentimentQuotes(
		scope: PromptListScope,
		sentiments: readonly Sentiment[],
		limit: number,
	): Promise<SentimentQuoteRow[]> {
		if (scope.promptIds.length === 0 || sentiments.length === 0) return [];
		const store = storeFor(scope.brandId);
		const t = store.sentimentQuotes;
		const quoteTexts = texts.get(store) ?? new Map<string, QuoteText>();
		texts.set(store, quoteTexts);
		const picked = pickQuotes(store, scope, sentiments, limit);
		const missing = picked.map(({ index }) => t.runId[index]).filter((id) => !quoteTexts.has(id));
		if (missing.length > 0) {
			for (const row of await loadQuoteTexts(scope.brandId, missing)) quoteTexts.set(row.id, row);
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
					sentiment,
					brand: text.brand,
					text_content: text.text_content,
				},
			];
		});
	};
}
