/**
 * `answer.text` is the normalized extraction, never the provider's payload —
 * exposing that would make its shape part of this contract.
 */
import { db } from "@workspace/lib/db/db";
import { loadRawOutputs, selectRuns } from "@workspace/lib/db/runs";
import { citations, promptRuns } from "@workspace/lib/db/schema";
import type { RunMentionAssessments, MentionAssessment as StoredAssessment } from "@workspace/lib/mentions";
import { extractorFor, extractTextContent } from "@workspace/lib/text-extraction";
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
	/** The mention judge's assessments; null for mentions matched by name, before the judge. */
	assessments: RunAssessments | null;
	webQueries: unknown;
	citationCount: number;
	createdAt: Date | string;
}

export interface MentionAssessment {
	mentioned: boolean;
	probability: number;
	reason: string | null;
	sentiment: NonNullable<StoredAssessment["sentiment"]> | null;
	sentimentProbabilities: Record<string, number> | null;
	/** 1 for the tracked company the answer names first, and so on; null when it isn't counted as a mention. */
	position: number | null;
	/** Null when it isn't counted as a mention. */
	mentionCount: number | null;
}

export interface RunAssessments {
	/** Null when the answer never names the brand. */
	brand: MentionAssessment | null;
	/** Keyed by competitor name; only competitors the answer names. */
	competitors: Record<string, MentionAssessment>;
}

const publicAssessment = (record: StoredAssessment): MentionAssessment => ({
	mentioned: record.mentioned,
	probability: record.probability,
	reason: record.reason ?? null,
	sentiment: record.sentiment ?? null,
	sentimentProbabilities: record.sentimentProbabilities ?? null,
	position: record.position ?? null,
	mentionCount: record.mentionCount ?? null,
});

/** Fingerprints and passage offsets stay internal. */
function publicAssessments(stored: RunMentionAssessments | null): RunAssessments | null {
	if (!stored) return null;
	return {
		brand: stored.brand ? publicAssessment(stored.brand) : null,
		competitors: Object.fromEntries(Object.entries(stored.competitors).map(([name, r]) => [name, publicAssessment(r)])),
	};
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
			assessments: publicAssessments(row.assessments),
			webQueries: row.web_queries,
			citationCount: row.citation_count,
			createdAt: row.created_at,
		})),
		total,
	};
}

/** Addressed through its prompt, so a run id cannot be read under another. */
export async function findRunDetail(promptId: string, runId: string): Promise<RunDetail | null> {
	const [run] = await selectRuns(db)
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

	const text =
		run.textContent ?? extractTextContent((await loadRawOutputs(db, [run.id])).get(run.id), extractorFor(run));

	return {
		id: run.id,
		promptId: run.promptId,
		brandId: run.brandId,
		model: run.model,
		provider: run.provider,
		webSearchEnabled: run.webSearchEnabled,
		brandMentioned: run.brandMentioned,
		competitorsMentioned: run.competitorsMentioned,
		assessments: publicAssessments(run.mentionAssessments),
		webQueries: run.webQueries,
		citationCount: cited.length,
		createdAt: run.createdAt,
		answer: { text: text || null },
		citations: cited,
	};
}
