import { getModelMeta } from "@workspace/config/models";

export interface ReportPromptRun {
	promptId: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
}

export interface ReportCompetitor {
	name: string;
	domain: string;
}

export interface PromptSoV {
	promptId: string;
	sovPct: number | null;
	brandMentionCount: number;
	totalRuns: number;
	totalCompetitorMentions: number;
	competitorMentions: Record<string, number>;
}

export interface CompetitorSoV {
	name: string;
	sovPct: number;
	mentionCount: number;
}

export type PromptCategory = "strength" | "opportunity";

export interface SelectedPrompt {
	promptId: string;
	category: PromptCategory;
	sovPct: number | null;
}

/** brand / (brand + competitor mentions); null when no one was mentioned. */
export function computePromptSoV(
	promptId: string,
	runs: ReportPromptRun[],
	competitors: ReportCompetitor[],
): PromptSoV {
	const promptRuns = runs.filter((r) => r.promptId === promptId);
	const totalRuns = promptRuns.length;

	if (totalRuns === 0) {
		return {
			promptId,
			sovPct: null,
			brandMentionCount: 0,
			totalRuns: 0,
			totalCompetitorMentions: 0,
			competitorMentions: {},
		};
	}

	const brandMentionCount = promptRuns.filter((r) => r.brandMentioned).length;

	const competitorMentions: Record<string, number> = {};
	let totalCompetitorMentions = 0;

	for (const run of promptRuns) {
		if (run.competitorsMentioned) {
			for (const mentioned of run.competitorsMentioned) {
				if (competitors.some((c) => c.name === mentioned)) {
					competitorMentions[mentioned] = (competitorMentions[mentioned] || 0) + 1;
					totalCompetitorMentions++;
				}
			}
		}
	}

	const denominator = brandMentionCount + totalCompetitorMentions;
	const sovPct = denominator === 0 ? null : Math.round((brandMentionCount / denominator) * 100);

	return { promptId, sovPct, brandMentionCount, totalRuns, totalCompetitorMentions, competitorMentions };
}

export function computeOverallSoV(runs: ReportPromptRun[], competitors: ReportCompetitor[]): number | null {
	let totalBrandMentions = 0;
	let totalCompetitorMentions = 0;

	for (const run of runs) {
		if (run.brandMentioned) totalBrandMentions++;
		if (run.competitorsMentioned) {
			for (const mentioned of run.competitorsMentioned) {
				if (competitors.some((c) => c.name === mentioned)) {
					totalCompetitorMentions++;
				}
			}
		}
	}

	const denominator = totalBrandMentions + totalCompetitorMentions;
	if (denominator === 0) return null;
	return Math.round((totalBrandMentions / denominator) * 100);
}

export function computeCompetitorSoVs(runs: ReportPromptRun[], competitors: ReportCompetitor[]): CompetitorSoV[] {
	let totalBrandMentions = 0;
	const competitorMentionCounts: Record<string, number> = {};

	for (const run of runs) {
		if (run.brandMentioned) totalBrandMentions++;
		if (run.competitorsMentioned) {
			for (const mentioned of run.competitorsMentioned) {
				if (competitors.some((c) => c.name === mentioned)) {
					competitorMentionCounts[mentioned] = (competitorMentionCounts[mentioned] || 0) + 1;
				}
			}
		}
	}

	const totalAllMentions = totalBrandMentions + Object.values(competitorMentionCounts).reduce((sum, c) => sum + c, 0);

	if (totalAllMentions === 0) return [];

	return competitors
		.map((comp) => {
			const mentionCount = competitorMentionCounts[comp.name] || 0;
			return {
				name: comp.name,
				sovPct: Math.round((mentionCount / totalAllMentions) * 100),
				mentionCount,
			};
		})
		.sort((a, b) => b.sovPct - a.sovPct);
}

/** A report shows four prompts: two the brand wins, two it has room to win. */
const MAX_SELECTED = 4;
const MAX_PER_CATEGORY = 2;

/** More than one prompt the brand is absent from makes it look invisible. */
const MAX_ZERO_SOV = 1;

const isZeroSoV = (prompt: PromptSoV): boolean => prompt.sovPct === null || prompt.sovPct === 0;

/** Winning against nobody isn't compelling, so competitor activity ranks first. */
const byStrength = (a: PromptSoV, b: PromptSoV): number =>
	Number(b.totalCompetitorMentions > 0) - Number(a.totalCompetitorMentions > 0) || (b.sovPct ?? 0) - (a.sovPct ?? 0);

/** Lowest brand SoV first (the most room to grow), then most competitor activity. */
const byOpportunity = (a: PromptSoV, b: PromptSoV): number =>
	(a.sovPct ?? 0) - (b.sovPct ?? 0) || b.totalCompetitorMentions - a.totalCompetitorMentions;

const byCompetitorActivity = (a: PromptSoV, b: PromptSoV): number =>
	b.totalCompetitorMentions - a.totalCompetitorMentions;

/** The report's four slots, plus the caps a pick has to respect to claim one. */
interface Selection {
	selected: SelectedPrompt[];
	used: Set<string>;
	zeroSoVCount: number;
}

function take(selection: Selection, candidates: PromptSoV[], slots: number, category?: PromptCategory): void {
	let remaining = slots;
	for (const prompt of candidates) {
		if (remaining === 0 || selection.selected.length >= MAX_SELECTED) return;
		if (selection.used.has(prompt.promptId)) continue;
		const zeroSoV = isZeroSoV(prompt);
		if (zeroSoV && selection.zeroSoVCount >= MAX_ZERO_SOV) continue;
		if (zeroSoV) selection.zeroSoVCount++;
		selection.used.add(prompt.promptId);
		selection.selected.push({
			promptId: prompt.promptId,
			category: category ?? (zeroSoV ? "opportunity" : "strength"),
			sovPct: prompt.sovPct,
		});
		remaining--;
	}
}

/** When either half comes up short, the other fills the remainder. */
export function selectRepresentativePrompts(
	promptSoVs: PromptSoV[],
	isBrandedFn: (promptId: string) => boolean,
): SelectedPrompt[] {
	// Non-branded prompts are more representative of organic discovery, so they
	// are the pool whenever there are enough of them to fill the report.
	const nonBranded = promptSoVs.filter((p) => !isBrandedFn(p.promptId));
	const pool = nonBranded.length >= MAX_SELECTED ? nonBranded : promptSoVs;

	const strengths = pool.filter((p) => !isZeroSoV(p)).sort(byStrength);
	const contested = pool.filter((p) => p.totalCompetitorMentions > 0);
	const opportunities = [
		...contested.filter((p) => !isZeroSoV(p)).sort(byOpportunity),
		...contested.filter(isZeroSoV).sort(byCompetitorActivity),
	];

	const selection: Selection = { selected: [], used: new Set(), zeroSoVCount: 0 };
	take(selection, strengths, MAX_PER_CATEGORY, "strength");
	take(selection, opportunities, MAX_PER_CATEGORY, "opportunity");
	take(selection, [...strengths, ...opportunities], MAX_SELECTED);

	return selection.selected;
}

export interface FullPromptRun {
	promptId: string;
	promptValue: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	webQueries: string[];
	textContent: string;
	model: string;
}

export interface ContentGap {
	promptValue: string;
	promptId: string;
	competitorsMentioned: string[];
	competitorCount: number;
}

export interface WebQueryInsight {
	query: string;
	count: number;
	brandMentionRate: number;
}

/** Prompts where competitors are mentioned but the brand is not. */
export function findContentGaps(runs: FullPromptRun[], maxResults: number = 5): ContentGap[] {
	const byPrompt = new Map<string, FullPromptRun[]>();
	for (const run of runs) {
		if (!byPrompt.has(run.promptId)) byPrompt.set(run.promptId, []);
		byPrompt.get(run.promptId)!.push(run);
	}

	const gaps: ContentGap[] = [];

	for (const [promptId, promptRuns] of byPrompt) {
		const hasBrandMention = promptRuns.some((r) => r.brandMentioned);
		if (hasBrandMention) continue;

		const allCompetitors = new Set<string>();
		for (const run of promptRuns) {
			for (const comp of run.competitorsMentioned) {
				allCompetitors.add(comp);
			}
		}

		if (allCompetitors.size === 0) continue;

		gaps.push({
			promptValue: promptRuns[0].promptValue,
			promptId,
			competitorsMentioned: [...allCompetitors],
			competitorCount: allCompetitors.size,
		});
	}

	return gaps.sort((a, b) => b.competitorCount - a.competitorCount).slice(0, maxResults);
}

export function analyzeWebQueries(runs: FullPromptRun[], maxResults: number = 10): WebQueryInsight[] {
	const queryStats = new Map<string, { count: number; brandMentions: number }>();

	for (const run of runs) {
		if (!run.webQueries) continue;
		for (const query of run.webQueries) {
			const normalized = query.toLowerCase().trim();
			if (!normalized || normalized.length < 3) continue;
			if (!queryStats.has(normalized)) {
				queryStats.set(normalized, { count: 0, brandMentions: 0 });
			}
			const stats = queryStats.get(normalized)!;
			stats.count++;
			if (run.brandMentioned) stats.brandMentions++;
		}
	}

	return [...queryStats.entries()]
		.map(([query, stats]) => ({
			query,
			count: stats.count,
			brandMentionRate: stats.count > 0 ? Math.round((stats.brandMentions / stats.count) * 100) : 0,
		}))
		.sort((a, b) => b.count - a.count)
		.slice(0, maxResults);
}

export function analyzeCompetitorFrequency(
	runs: FullPromptRun[],
	competitors: ReportCompetitor[],
): Array<{ name: string; mentionCount: number; promptCount: number; coMentionRate: number }> {
	const competitorStats = new Map<string, { mentions: number; prompts: Set<string>; coMentions: number }>();

	for (const comp of competitors) {
		competitorStats.set(comp.name, { mentions: 0, prompts: new Set(), coMentions: 0 });
	}

	for (const run of runs) {
		if (!run.competitorsMentioned) continue;
		for (const mentioned of run.competitorsMentioned) {
			const stats = competitorStats.get(mentioned);
			if (!stats) continue;
			stats.mentions++;
			stats.prompts.add(run.promptId);
			if (run.brandMentioned) stats.coMentions++;
		}
	}

	return competitors
		.map((comp) => {
			const stats = competitorStats.get(comp.name)!;
			return {
				name: comp.name,
				mentionCount: stats.mentions,
				promptCount: stats.prompts.size,
				coMentionRate: stats.mentions > 0 ? Math.round((stats.coMentions / stats.mentions) * 100) : 0,
			};
		})
		.sort((a, b) => b.mentionCount - a.mentionCount);
}

export function analyzeByEngine(
	runs: FullPromptRun[],
): Array<{ engine: string; totalRuns: number; brandMentions: number; mentionRate: number }> {
	const engineStats = new Map<string, { total: number; mentions: number }>();

	for (const run of runs) {
		const engine = run.model;
		if (!engineStats.has(engine)) engineStats.set(engine, { total: 0, mentions: 0 });
		const stats = engineStats.get(engine)!;
		stats.total++;
		if (run.brandMentioned) stats.mentions++;
	}

	// Persisted reports may use provider names where current reports use model ids.
	const legacyAliases: Record<string, string> = {
		openai: "ChatGPT",
		anthropic: "Claude",
		google: "Google AI",
	};

	return [...engineStats.entries()]
		.map(([engine, stats]) => ({
			engine: legacyAliases[engine] ?? getModelMeta(engine).label,
			totalRuns: stats.total,
			brandMentions: stats.mentions,
			mentionRate: stats.total > 0 ? Math.round((stats.mentions / stats.total) * 100) : 0,
		}))
		.sort((a, b) => b.mentionRate - a.mentionRate);
}

export interface ReportRawPromptRuns {
	competitors: ReportCompetitor[];
	promptRuns: Array<{
		promptValue: string;
		runs: Array<{
			brandMentioned: boolean;
			competitorsMentioned: string[];
		}>;
	}>;
}

export interface UnstableCompetitorStats {
	name: string;
	sov: number;
	visibility: number;
	promptsWithMentions: number;
	promptRunsWithMentions: number;
}

export interface ReportUnstableStats {
	sov: number | null;
	visibility: number;
	totalPrompts: number;
	totalPromptRuns: number;
	promptsWithBrandMentions: number;
	promptRunsWithBrandMentions: number;
	competitors: UnstableCompetitorStats[];
}

/**
 * "Unstable" because the format may change. Every ratio is a 0–1 float.
 *
 * - sov: brand_mentions / (brand_mentions + competitor_mentions), 0-1 float
 * - visibility: brand_mentions / total_prompt_runs, 0-1 float (how often the brand appears at all)
 * - competitors[].sov: competitor_mentions / total_mentions, 0-1 float
 * - competitors[].promptsWithMentions: number of prompts where this competitor was mentioned
 * - competitors[].promptRunsWithMentions: number of prompt runs where this competitor was mentioned
 * - competitors[].visibility: prompt runs with this competitor / total prompt runs, 0-1 float
 */
export function computeReportUnstableStats(raw: ReportRawPromptRuns): ReportUnstableStats {
	const runs: ReportPromptRun[] = [];
	let totalPromptRuns = 0;
	const promptsWithBrand = new Set<number>();

	const competitorPrompts = new Map<string, Set<number>>();
	const competitorRunCounts = new Map<string, number>();

	raw.promptRuns.forEach((pr, promptIndex) => {
		let promptHasBrand = false;
		for (const run of pr.runs) {
			runs.push({
				promptId: `prompt-${promptIndex + 1}`,
				brandMentioned: run.brandMentioned,
				competitorsMentioned: run.competitorsMentioned,
			});
			totalPromptRuns++;
			if (run.brandMentioned) promptHasBrand = true;
			for (const comp of run.competitorsMentioned) {
				if (!competitorPrompts.has(comp)) competitorPrompts.set(comp, new Set());
				competitorPrompts.get(comp)!.add(promptIndex);
				competitorRunCounts.set(comp, (competitorRunCounts.get(comp) || 0) + 1);
			}
		}
		if (promptHasBrand) promptsWithBrand.add(promptIndex);
	});

	// Avoid an intermediate integer percentage so small shares are not rounded away.
	const brandMentionCount = runs.filter((r) => r.brandMentioned).length;
	let totalCompetitorMentions = 0;
	for (const run of runs) {
		for (const mentioned of run.competitorsMentioned) {
			if (raw.competitors.some((c) => c.name === mentioned)) {
				totalCompetitorMentions++;
			}
		}
	}
	const totalAllMentions = brandMentionCount + totalCompetitorMentions;

	const sov = totalAllMentions === 0 ? null : brandMentionCount / totalAllMentions;
	const visibility = totalPromptRuns === 0 ? 0 : brandMentionCount / totalPromptRuns;

	return {
		sov,
		visibility,
		totalPrompts: raw.promptRuns.length,
		totalPromptRuns,
		promptsWithBrandMentions: promptsWithBrand.size,
		promptRunsWithBrandMentions: brandMentionCount,
		competitors:
			totalAllMentions === 0
				? []
				: raw.competitors
						.map((comp) => {
							const promptRunsWithMentions = competitorRunCounts.get(comp.name) || 0;
							return {
								name: comp.name,
								sov: promptRunsWithMentions / totalAllMentions,
								visibility: totalPromptRuns === 0 ? 0 : promptRunsWithMentions / totalPromptRuns,
								promptsWithMentions: competitorPrompts.get(comp.name)?.size || 0,
								promptRunsWithMentions,
							};
						})
						.sort((a, b) => b.sov - a.sov),
	};
}

export function getSoVColor(sov: number | null): string {
	if (sov === null) return "text-gray-400";
	if (sov >= 40) return "text-emerald-600";
	if (sov >= 20) return "text-amber-500";
	return "text-rose-500";
}

export function getSoVBadgeClasses(sov: number | null): {
	variant: "default" | "secondary" | "destructive";
	className: string;
} {
	if (sov === null || sov < 20)
		return { variant: "destructive", className: "bg-rose-500 hover:bg-rose-500 text-white" };
	if (sov < 40) return { variant: "secondary", className: "bg-amber-500 hover:bg-amber-500 text-white" };
	return { variant: "default", className: "bg-emerald-600 hover:bg-emerald-600 text-white" };
}

export function getSoVLevel(sov: number | null): { label: string; description: string } {
	if (sov === null) return { label: "No Data", description: "No mentions detected." };
	if (sov >= 40) return { label: "Strong", description: "Your brand leads the conversation." };
	if (sov >= 20) return { label: "Moderate", description: "Room for improvement." };
	return { label: "Low", description: "Competitors dominate this space." };
}
