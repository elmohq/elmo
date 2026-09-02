/**
 * `answer.text` is the normalized extraction, never the provider's payload —
 * exposing that would make its shape part of this contract.
 */
import { db } from "@workspace/lib/db/db";
import { citations, promptRuns } from "@workspace/lib/db/schema";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq } from "drizzle-orm";
import { countPromptRuns, getPromptRuns } from "@/lib/postgres-read";
import type { AnalyticsWindow } from "@/server/analytics-core";

export interface RunSummary {
	id: string;
	promptId: string;
	brandId: string;
	model: string;
	provider: string | null;
	webSearchEnabled: boolean | null;
	brandMentioned: boolean | null;
	competitorsMentioned: unknown;
	webQueries: unknown;
	citationCount: number;
	createdAt: Date | string;
}

interface RunCitation {
	url: string;
	domain: string;
	title: string | null;
	citationIndex: number | null;
}

export interface RunDetail extends Omit<RunSummary, "citationCount"> {
	citationCount: number;
	answer: { text: string | null };
	citations: RunCitation[];
}

export interface ListRunsOptions {
	promptId: string;
	window: AnalyticsWindow;
	limit: number;
	offset: number;
	model?: string;
}

export async function listPromptRuns(options: ListRunsOptions): Promise<{ data: RunSummary[]; total: number }> {
	const { promptId, window, limit, offset, model } = options;
	const { from, to, timezone } = window;

	const [rows, total] = await Promise.all([
		getPromptRuns(promptId, from, to, timezone, limit, offset, model),
		countPromptRuns(promptId, from, to, timezone, model),
	]);

	return {
		data: rows.map((row) => ({
			id: row.id,
			promptId: row.prompt_id,
			brandId: row.brand_id,
			model: row.model,
			provider: row.provider,
			webSearchEnabled: row.web_search_enabled,
			brandMentioned: row.brand_mentioned,
			competitorsMentioned: row.competitors_mentioned,
			webQueries: row.web_queries,
			citationCount: row.citation_count,
			createdAt: row.created_at,
		})),
		total,
	};
}

/** Addressed through its prompt, so a run id cannot be read under another. */
export async function findRunDetail(promptId: string, runId: string): Promise<RunDetail | null> {
	const [run] = await db
		.select()
		.from(promptRuns)
		.where(and(eq(promptRuns.id, runId), eq(promptRuns.promptId, promptId)))
		.limit(1);
	if (!run) return null;

	const cited = await db
		.select({
			url: citations.url,
			domain: citations.domain,
			title: citations.title,
			citationIndex: citations.citationIndex,
		})
		.from(citations)
		.where(eq(citations.promptRunId, run.id))
		.orderBy(asc(citations.citationIndex));

	// Older rows predate the provider column; the model name is the extractor's
	// other accepted key.
	const text = extractTextContent(run.rawOutput, run.provider ?? run.model);

	return {
		id: run.id,
		promptId: run.promptId,
		brandId: run.brandId,
		model: run.model,
		provider: run.provider,
		webSearchEnabled: run.webSearchEnabled,
		brandMentioned: run.brandMentioned,
		competitorsMentioned: run.competitorsMentioned,
		webQueries: run.webQueries,
		citationCount: cited.length,
		createdAt: run.createdAt,
		answer: { text: text || null },
		citations: cited,
	};
}
