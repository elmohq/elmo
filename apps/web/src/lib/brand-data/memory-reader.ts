import type { AnalyticsReader } from "@/lib/analytics/reader";
import * as citations from "@/lib/brand-data/memory-citation-reads";
import {
	getBrandRow,
	getCompetitorRows,
	getPromptRows,
	type QuoteTextLoader,
	sentimentQuoteReader,
} from "@/lib/brand-data/memory-entity-reads";
import * as rollups from "@/lib/brand-data/memory-reads";

export function createMemoryReader(loadQuoteTexts: QuoteTextLoader): AnalyticsReader {
	return {
		...rollups,
		...citations,
		getBrandRow,
		getCompetitorRows,
		getPromptRows,
		getSentimentQuotes: sentimentQuoteReader(loadQuoteTexts),
	};
}
