/**
 * `answer.text` is the normalized extraction, never the provider's payload —
 * exposing that would make its shape part of this contract.
 */
import { db } from "@workspace/lib/db/db";
import { loadRawOutputs, selectRuns } from "@workspace/lib/db/runs";
import { citations, promptRuns } from "@workspace/lib/db/schema";
import type { MentionAssessmentRecord, RunMentionAssessments } from "@workspace/lib/mentions";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq } from "drizzle-orm";
import { evidencePassage } from "@/lib/evidence";
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
	/** The mention judge's verdicts; null for runs matched by substring, which have none. */
	assessments: RunAssessments | null;
	webQueries: unknown;
	citationCount: number;
	createdAt: Date | string;
}

export interface MentionAssessment {
	mention: MentionAssessmentRecord["mention"];
	probability: number;
	reason: string | null;
	sentiment: NonNullable<MentionAssessmentRecord["sentiment"]> | null;
	sentimentProbabilities: Record<string, number> | null;
	/** The passage the verdict rests on. Only on a single run, and only where the answer's text was stored. */
	evidence?: string | null;
}

export interface RunAssessments {
	/** Null when the answer never names the brand. */
	brand: MentionAssessment | null;
	/** Keyed by competitor name; only competitors the answer names. */
	competitors: Record<string, MentionAssessment>;
}

/**
 * Evidence is stored as offsets into the run's stored text; clients don't hold that text, so a
 * single run gets the passage itself.
 */
function publicAssessments(stored: RunMentionAssessments | null, text?: string | null): RunAssessments | null {
	if (!stored) return null;
	const convert = (record: MentionAssessmentRecord): MentionAssessment => ({
		mention: record.mention,
		probability: record.probability,
		reason: record.reason ?? null,
		sentiment: record.sentiment ?? null,
		sentimentProbabilities: record.sentimentProbabilities ?? null,
		...(text === undefined ? {} : { evidence: evidencePassage(text, record) }),
	});
	return {
		brand: stored.brand ? convert(stored.brand) : null,
		competitors: Object.fromEntries(Object.entries(stored.competitors ?? {}).map(([name, r]) => [name, convert(r)])),
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

	// Older rows carry no text and may predate the provider column; the
	// extractor also accepts the model name.
	const text =
		run.textContent ?? extractTextContent((await loadRawOutputs(db, [run.id])).get(run.id), run.provider ?? run.model);

	return {
		id: run.id,
		promptId: run.promptId,
		brandId: run.brandId,
		model: run.model,
		provider: run.provider,
		webSearchEnabled: run.webSearchEnabled,
		brandMentioned: run.brandMentioned,
		competitorsMentioned: run.competitorsMentioned,
		// Offsets index the stored text; text re-extracted for an older run may not line up.
		assessments: publicAssessments(run.mentionAssessments, run.textContent),
		webQueries: run.webQueries,
		citationCount: cited.length,
		createdAt: run.createdAt,
		answer: { text: text || null },
		citations: cited,
	};
}
