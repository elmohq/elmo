import { SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { z } from "zod";
import { parseTagFilter } from "@/lib/analytics/prompt-resolution";
import { getPerPromptRunStats, getPromptRows, getPromptsFirstEvaluatedAt } from "@/lib/analytics/reads";
import { lookbackSchema } from "@/lib/lookback";
import type { PerPromptRunStats } from "@/lib/rollup-read";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";

export const promptsSummaryInput = z.object({
	brandId: z.string(),
	lookback: lookbackSchema.default("1m"),
	webSearchEnabled: z.string().optional(),
	model: z.string().optional(),
	tags: z.string().optional(),
	timezone: z.string().optional(),
});

/**
 * Get prompts summary for a brand (visibility scores, tags, etc.)
 */
export function summarizePrompt(
	prompt: {
		id: string;
		value: string;
		enabled: boolean;
		createdAt: Date;
		tags: string[] | null;
		systemTags: string[] | null;
	},
	stats: PerPromptRunStats | undefined,
	firstEvaluatedAt: string | Date | null | undefined,
) {
	const userTags = prompt.tags || [];
	const { isBranded } = getEffectiveBrandedStatus(prompt.systemTags || [], userTags);
	const systemTag = isBranded ? SYSTEM_TAGS.BRANDED : SYSTEM_TAGS.UNBRANDED;
	const totalRuns = stats?.runs ?? 0;
	// The API publishes these ratios unrounded; the dashboard renders
	// percentages, and this is where it rounds.
	const ratio = (count: number | undefined) => (totalRuns > 0 ? (count ?? 0) / totalRuns : 0);
	const brandMentionRate = Math.round(ratio(stats?.brand_mentioned_runs) * 100);
	const competitorMentionRate = Math.round(ratio(stats?.competitor_runs) * 100);
	const weightedMentions = (stats?.brand_mentioned_runs ?? 0) * 2 + (stats?.competitor_mentions ?? 0);

	return {
		id: prompt.id,
		value: prompt.value,
		enabled: prompt.enabled,
		createdAt: prompt.createdAt,
		totalRuns,
		brandMentionRate,
		competitorMentionRate,
		averageWeightedMentions: totalRuns > 0 ? weightedMentions / totalRuns : 0,
		hasVisibilityData: totalRuns > 0 && (brandMentionRate > 0 || competitorMentionRate > 0),
		lastRunAt: stats?.last_run_date ? new Date(stats.last_run_date) : null,
		firstEvaluatedAt: firstEvaluatedAt ? new Date(firstEvaluatedAt) : null,
		// Exactly one effective system tag, so branded and unbranded filters use
		// the same status the UI shows.
		tags: userTags.includes(systemTag) ? [...userTags] : [...userTags, systemTag],
	};
}

type PromptSummary = ReturnType<typeof summarizePrompt>;

function byVisibilityThenName(a: PromptSummary, b: PromptSummary): number {
	const rank = (prompt: PromptSummary) => (prompt.hasVisibilityData ? 1 : prompt.totalRuns === 0 ? 2 : 3);
	const rankA = rank(a);
	if (rankA !== rank(b)) return rankA - rank(b);
	if (rankA === 1 && a.averageWeightedMentions !== b.averageWeightedMentions) {
		return b.averageWeightedMentions - a.averageWeightedMentions;
	}
	return a.value.localeCompare(b.value);
}

export async function computePromptsSummary(input: z.input<typeof promptsSummaryInput>) {
	const data = promptsSummaryInput.parse(input);

	const allPrompts = (await getPromptRows(data.brandId)).filter((prompt) => prompt.enabled);

	const promptIds = allPrompts.map((p) => p.id);

	if (promptIds.length === 0) {
		return { prompts: [], totalPrompts: 0, availableTags: [] };
	}

	const timezone = resolveTimezone(data.timezone, "UTC");
	const { fromDateStr, toDateStr } = getTimezoneLookbackRange(data.lookback, timezone);

	const webSearchEnabled = data.webSearchEnabled != null ? data.webSearchEnabled === "true" : undefined;

	const [summaryData, firstEvaluatedData] = await Promise.all([
		getPerPromptRunStats({
			brandId: data.brandId,
			from: fromDateStr,
			to: toDateStr,
			timezone,
			promptIds,
			model: data.model,
			webSearchEnabled,
		}),
		getPromptsFirstEvaluatedAt(data.brandId, promptIds),
	]);

	const summaryMap = new Map(summaryData.map((s) => [s.prompt_id, s]));
	const firstEvalMap = new Map(firstEvaluatedData.map((f) => [f.prompt_id, f.first_evaluated_at]));

	// Collect all user tags (system tags are added separately)
	const allUserTags = new Set<string>();
	const tagFilter = parseTagFilter(data.tags);

	const promptSummaries = allPrompts.map((p) => {
		for (const tag of p.tags || []) allUserTags.add(tag);
		return summarizePrompt(p, summaryMap.get(p.id), firstEvalMap.get(p.id));
	});

	const filteredPrompts =
		tagFilter.length > 0 ? promptSummaries.filter((p) => tagFilter.some((t) => p.tags.includes(t))) : promptSummaries;
	const sortedPrompts = filteredPrompts.sort(byVisibilityThenName);

	return {
		prompts: sortedPrompts,
		totalPrompts: promptSummaries.length,
		availableTags: [
			SYSTEM_TAGS.BRANDED,
			SYSTEM_TAGS.UNBRANDED,
			...Array.from(allUserTags)
				.filter((tag) => tag.toLowerCase() !== SYSTEM_TAGS.BRANDED && tag.toLowerCase() !== SYSTEM_TAGS.UNBRANDED)
				.sort(),
		],
	};
}
