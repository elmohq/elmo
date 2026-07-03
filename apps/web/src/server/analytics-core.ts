/**
 * Edge-agnostic analytics computations shared by the dashboard server
 * functions and the `/api/v1` REST endpoints.
 *
 * Like `prompt-resolution.ts` and `onboarding-core.ts`, these functions take an
 * already-authorized brand id (never a session or Request) and return plain
 * data. Callers authorize at the edge — server functions via `requireOrgAccess`,
 * REST handlers via the API-key scope check — so the exact same computation
 * backs the dashboard and the API and the two can't drift.
 *
 * This module is imported only from server-fn handlers and server-only route
 * files, keeping `db` (→ pg → Buffer) out of the client bundle. See issue #68
 * and the note in `prompt-resolution.ts`.
 */

import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { getCitationsTotalCount, getVisibilityDailyAggregate } from "@/lib/postgres-read";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

export interface VisibilityPoint {
	date: string;
	/** Brand mention rate for the day (0–100), or null when no runs were plotted. */
	visibility: number | null;
}

export interface BrandVisibility {
	/** Latest plotted mention rate (the right end of the trend), 0–100. */
	currentVisibility: number;
	totalRuns: number;
	totalPrompts: number;
	totalCitations: number;
	series: VisibilityPoint[];
}

export interface BrandVisibilityOptions {
	brandId: string;
	/** Inclusive date bounds, `YYYY-MM-DD`, already resolved by the caller. */
	fromDate: string;
	toDate: string;
	/** IANA timezone the day buckets are computed in. Defaults to UTC. */
	timezone?: string;
	/** Restrict to a single model/platform (e.g. "chatgpt"). */
	model?: string;
	/** Comma-separated tag filter, matching the dashboard's prompt list. */
	tags?: string;
	/** Case-insensitive substring filter on prompt text. */
	search?: string;
}

/**
 * Brand AI-visibility over a date range: a daily mention-rate series (LVCF
 * smoothed so gaps in individual prompt schedules don't scallop the line) plus
 * period totals. `currentVisibility` is the last non-null point so a headline
 * number matches the right end of the series.
 *
 * Extracted verbatim from the dashboard's `getFilteredVisibilityFn` so both
 * edges return identical numbers — the only differences there are the session
 * auth (moved to the caller) and lookback→date resolution (also the caller's).
 */
export async function getBrandVisibility(opts: BrandVisibilityOptions): Promise<BrandVisibility> {
	const { brandId, fromDate, toDate, timezone = "UTC", model, tags, search } = opts;

	const resolvedPrompts = await resolveFilteredPrompts(brandId, { tags, search });
	const promptIds = resolvedPrompts.map((p) => p.id);
	const totalPrompts = promptIds.length;

	if (totalPrompts === 0) {
		return { currentVisibility: 0, totalRuns: 0, totalPrompts: 0, totalCitations: 0, series: [] };
	}

	const brandedPromptIds = resolvedPrompts
		.filter((p) => getEffectiveBrandedStatus(p.systemTags, p.tags).isBranded)
		.map((p) => p.id);

	const [daily, totalCitations] = await Promise.all([
		getVisibilityDailyAggregate(brandId, fromDate, toDate, timezone, promptIds, brandedPromptIds, model),
		getCitationsTotalCount(brandId, fromDate, toDate, timezone, promptIds, model),
	]);

	// Period run totals come from the raw observation sums (actual_*); the series
	// uses the per-day LVCF sums so schedule gaps don't scallop the line.
	let totalBrandedRuns = 0;
	let totalNonBrandedRuns = 0;
	const series: VisibilityPoint[] = daily.map((row) => {
		totalBrandedRuns += row.actual_branded_runs;
		totalNonBrandedRuns += row.actual_nonbranded_runs;
		const t = row.lvcf_branded_runs + row.lvcf_nonbranded_runs;
		const m = row.lvcf_branded_mentioned + row.lvcf_nonbranded_mentioned;
		return { date: row.date, visibility: t === 0 ? null : Math.round((m / t) * 100) };
	});

	let currentVisibility = 0;
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i].visibility;
		if (v != null) {
			currentVisibility = v;
			break;
		}
	}

	return {
		currentVisibility,
		totalRuns: totalBrandedRuns + totalNonBrandedRuns,
		totalPrompts,
		totalCitations,
		series,
	};
}
