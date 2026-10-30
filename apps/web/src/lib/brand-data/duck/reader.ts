import type { MentionAssessment } from "@workspace/lib/mentions";
import type { AnalyticsReader } from "@/lib/analytics/reader";
import type { AnalyticsScope, SqlQuery } from "@/lib/analytics-sql";
import { ENTITIES_CHUNK, type EntitiesChunk } from "@/lib/brand-data/chunks";
import { type Coverage, MissingChunksError, missingChunks } from "@/lib/brand-data/coverage";
import { citationReads } from "@/lib/citation-read";
import type { SentimentQuoteRow } from "@/lib/postgres-read";
import { rollupReads } from "@/lib/rollup-read";

export interface QuoteText {
	id: string;
	brand: MentionAssessment;
	text_content: string;
}

export type QuoteTextLoader = (brandId: string, runIds: string[]) => Promise<QuoteText[]>;

export interface BrandSource {
	entities(brandId: string): EntitiesChunk | undefined;
	coverage(brandId: string): Coverage;
}

type Reads = ReturnType<typeof rollupReads> & ReturnType<typeof citationReads>;
type ScopedQuery = (brandId: string) => SqlQuery;

const isScope = (value: unknown): value is AnalyticsScope =>
	typeof value === "object" && value !== null && "brandId" in value && "timezone" in value;
const brandOf = (args: unknown[]) => (isScope(args[0]) ? args[0].brandId : String(args[0]));
const readsCitations = (name: string) => /Citation|Domain|Google/.test(name);

/**
 * Answers every read with the server's own SQL over the brand's synced rows, after checking the window's months
 * have synced.
 */
export function createDuckReader(scopedQuery: ScopedQuery, source: BrandSource, loadQuoteTexts: QuoteTextLoader) {
	const entitiesOf = (brandId: string) => {
		const entities = source.entities(brandId);
		if (!entities) throw new MissingChunksError([ENTITIES_CHUNK]);
		return entities;
	};
	const brandReads = new Map<string, Reads>();
	const readsFor = (brandId: string): Reads => {
		let reads = brandReads.get(brandId);
		if (!reads) {
			const query = scopedQuery(brandId);
			reads = { ...rollupReads(query), ...citationReads(query) };
			brandReads.set(brandId, reads);
		}
		return reads;
	};
	const checked = <K extends keyof Reads>(name: K) =>
		((...args: unknown[]) => {
			const brandId = brandOf(args);
			entitiesOf(brandId);
			const group = readsCitations(name) ? "citations" : "runs";
			const coverage = source.coverage(brandId);
			const missing = new Set(args.filter(isScope).flatMap((scope) => missingChunks(coverage, group, scope)));
			if (missing.size > 0) throw new MissingChunksError([...missing]);
			return (readsFor(brandId)[name] as (...a: unknown[]) => unknown)(...args);
		}) as Reads[K];

	const template = { ...rollupReads(async () => []), ...citationReads(async () => []) };
	const reads = Object.fromEntries(Object.keys(template).map((name) => [name, checked(name as keyof Reads)])) as Reads;
	const quoteTexts = new Map<string, QuoteText>();

	const reader: AnalyticsReader = {
		...reads,
		async getBrandRow(brandId) {
			return entitiesOf(brandId).brand;
		},
		async getCompetitorRows(brandId) {
			return entitiesOf(brandId).competitors;
		},
		async getPromptRows(brandId) {
			return entitiesOf(brandId).prompts.map(({ firstEvaluatedAt: _, ...prompt }) => ({
				...prompt,
				createdAt: new Date(prompt.createdAt),
			}));
		},
		async getBrandEarliestRunDate(brandId) {
			const first = entitiesOf(brandId)
				.prompts.flatMap((prompt) => (prompt.firstEvaluatedAt ? [prompt.firstEvaluatedAt] : []))
				.sort()[0];
			return first ?? null;
		},
		async getPromptsFirstEvaluatedAt(brandId, promptIds) {
			const wanted = new Set(promptIds);
			return entitiesOf(brandId).prompts.flatMap((prompt) =>
				wanted.has(prompt.id) && prompt.firstEvaluatedAt
					? [{ prompt_id: prompt.id, first_evaluated_at: prompt.firstEvaluatedAt }]
					: [],
			);
		},
		async getSentimentQuotes(scope, sentiments, limit): Promise<SentimentQuoteRow[]> {
			const picks = await reads.getSentimentQuotePicks(scope, sentiments, limit);
			const missing = picks.map((pick) => pick.id).filter((id) => !quoteTexts.has(id));
			if (missing.length > 0) {
				for (const text of await loadQuoteTexts(scope.brandId, missing)) quoteTexts.set(text.id, text);
			}
			return picks.flatMap(({ place: _, ...pick }) => {
				const text = quoteTexts.get(pick.id);
				return text ? [{ ...pick, brand: text.brand, text_content: text.text_content }] : [];
			});
		},
	};
	return reader;
}
