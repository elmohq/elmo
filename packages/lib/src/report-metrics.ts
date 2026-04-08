/**
 * Shared report metrics computation module.
 * Provides Share of Voice (SoV) calculations and representative prompt selection
 * for both the report renderer and the report API.
 */

// ---------- Types ----------

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
	sov: number | null;
	brandMentionCount: number;
	totalRuns: number;
	totalCompetitorMentions: number;
	competitorMentions: Record<string, number>;
}

export interface CompetitorSoV {
	name: string;
	sov: number;
	mentionCount: number;
}

export type PromptCategory = "strength" | "opportunity";

export interface SelectedPrompt {
	promptId: string;
	category: PromptCategory;
	sov: number | null;
}

// ---------- SoV Computation ----------

/**
 * Compute Share of Voice for a single prompt.
 * SoV = brand_mentions / (brand_mentions + total_competitor_mentions)
 * Returns null when denominator is 0 (no one mentioned).
 */
export function computePromptSoV(
	promptId: string,
	runs: ReportPromptRun[],
	competitors: ReportCompetitor[],
): PromptSoV {
	const promptRuns = runs.filter((r) => r.promptId === promptId);
	const totalRuns = promptRuns.length;

	if (totalRuns === 0) {
		return { promptId, sov: null, brandMentionCount: 0, totalRuns: 0, totalCompetitorMentions: 0, competitorMentions: {} };
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
	const sov = denominator === 0 ? null : Math.round((brandMentionCount / denominator) * 100);

	return { promptId, sov, brandMentionCount, totalRuns, totalCompetitorMentions, competitorMentions };
}

/**
 * Compute overall Share of Voice across all prompts.
 * Aggregates brand mentions and competitor mentions across all runs.
 */
export function computeOverallSoV(
	runs: ReportPromptRun[],
	competitors: ReportCompetitor[],
): number | null {
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

/**
 * Compute per-competitor Share of Voice.
 */
export function computeCompetitorSoVs(
	runs: ReportPromptRun[],
	competitors: ReportCompetitor[],
): CompetitorSoV[] {
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

	const totalAllMentions = totalBrandMentions +
		Object.values(competitorMentionCounts).reduce((sum, c) => sum + c, 0);

	if (totalAllMentions === 0) return [];

	return competitors.map((comp) => {
		const mentionCount = competitorMentionCounts[comp.name] || 0;
		return {
			name: comp.name,
			sov: Math.round((mentionCount / totalAllMentions) * 100),
			mentionCount,
		};
	}).sort((a, b) => b.sov - a.sov);
}

// ---------- Prompt Selection ----------

/**
 * Select a representative mix of prompts: 2 strengths + 2 opportunities.
 *
 * Strengths: highest SoV prompts (brand is performing well).
 * Opportunities: prompts with competitor mentions but low/zero brand SoV (biggest gaps).
 *
 * If fewer than 2 in either bucket, fills from the other.
 */
export function selectRepresentativePrompts(
	promptSoVs: PromptSoV[],
	isBrandedFn: (promptId: string) => boolean,
): SelectedPrompt[] {
	// Prefer non-branded prompts as they're more representative of organic discovery
	const nonBranded = promptSoVs.filter((p) => !isBrandedFn(p.promptId));
	const pool = nonBranded.length >= 4 ? nonBranded : promptSoVs;

	// Strengths: highest SoV, must have brand mentions
	const strengths = pool
		.filter((p) => p.sov !== null && p.sov > 0)
		.sort((a, b) => (b.sov ?? 0) - (a.sov ?? 0));

	// Opportunities: have competitor mentions but low/no brand SoV
	const opportunities = pool
		.filter((p) => p.totalCompetitorMentions > 0)
		.sort((a, b) => {
			// Sort by lowest brand SoV first (biggest opportunity), then by most competitor activity
			const sovDiff = (a.sov ?? 0) - (b.sov ?? 0);
			if (sovDiff !== 0) return sovDiff;
			return b.totalCompetitorMentions - a.totalCompetitorMentions;
		});

	const selected: SelectedPrompt[] = [];
	const usedIds = new Set<string>();

	// Pick up to 2 strengths
	for (const s of strengths) {
		if (selected.length >= 2) break;
		if (usedIds.has(s.promptId)) continue;
		selected.push({ promptId: s.promptId, category: "strength", sov: s.sov });
		usedIds.add(s.promptId);
	}

	// Pick up to 2 opportunities
	for (const o of opportunities) {
		if (selected.filter((s) => s.category === "opportunity").length >= 2) break;
		if (usedIds.has(o.promptId)) continue;
		selected.push({ promptId: o.promptId, category: "opportunity", sov: o.sov });
		usedIds.add(o.promptId);
	}

	// Fill remaining slots if we have fewer than 4
	if (selected.length < 4) {
		const remaining = [...strengths, ...opportunities];
		for (const r of remaining) {
			if (selected.length >= 4) break;
			if (usedIds.has(r.promptId)) continue;
			const category: PromptCategory = (r.sov ?? 0) > 0 ? "strength" : "opportunity";
			selected.push({ promptId: r.promptId, category, sov: r.sov });
			usedIds.add(r.promptId);
		}
	}

	return selected.slice(0, 4);
}

// ---------- Display Helpers ----------

export function getSoVColor(sov: number | null): string {
	if (sov === null) return "text-gray-400";
	if (sov >= 40) return "text-emerald-600";
	if (sov >= 20) return "text-amber-500";
	return "text-rose-500";
}

export function getSoVBadgeClasses(sov: number | null): { variant: "default" | "secondary" | "destructive"; className: string } {
	if (sov === null || sov < 20) return { variant: "destructive", className: "bg-rose-500 hover:bg-rose-500 text-white" };
	if (sov < 40) return { variant: "secondary", className: "bg-amber-500 hover:bg-amber-500 text-white" };
	return { variant: "default", className: "bg-emerald-600 hover:bg-emerald-600 text-white" };
}

export function getSoVLevel(sov: number | null): { label: string; description: string } {
	if (sov === null) return { label: "No Data", description: "No mentions detected." };
	if (sov >= 40) return { label: "Strong", description: "Your brand leads the conversation." };
	if (sov >= 20) return { label: "Moderate", description: "Room for improvement." };
	return { label: "Low", description: "Competitors dominate this space." };
}
