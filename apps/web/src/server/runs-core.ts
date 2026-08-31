/**
 * Recorded answers, as the external surfaces publish them.
 *
 * Server-only and edge-agnostic, so `/api/v1` and the MCP run tools answer with
 * one row shape from one projection. Deciding the caller may see the run is the
 * caller's job; nothing here knows who is asking.
 *
 * `answer.text` is the normalized extraction, never the provider's own payload:
 * that shape belongs to the provider, and exposing it would quietly make it
 * part of these surfaces' contract.
 */
import { db } from "@workspace/lib/db/db";
import { citations, promptRuns } from "@workspace/lib/db/schema";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { asc, eq } from "drizzle-orm";
import type { AnalyticsWindow } from "@/lib/api/analytics-range";
import { countPromptRuns, getPromptRuns } from "@/lib/postgres-read";

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

export interface RunCitation {
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
	const { startDate, endDate, timezone } = window;

	// Both go through the read layer's timezone-aware, half-open window, so a run
	// just after local midnight lands on the day the caller asked about rather
	// than the day UTC happens to be on.
	const [rows, total] = await Promise.all([
		getPromptRuns(promptId, startDate, endDate, timezone, limit, offset, model),
		countPromptRuns(promptId, startDate, endDate, timezone, model),
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

/** One run with its answer text and citations, or null if there is no such run. */
export async function findRunDetail(runId: string): Promise<RunDetail | null> {
	const [run] = await db.select().from(promptRuns).where(eq(promptRuns.id, runId)).limit(1);
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
	// other accepted key, so it is the right fallback.
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
