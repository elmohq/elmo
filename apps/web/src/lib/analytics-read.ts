/**
 * Facade over `postgres-read.ts` (raw tables) and `rollup-read.ts` (rollup
 * tables): every migrated analytics read goes through here so callers don't
 * know or care which one actually ran.
 *
 * Gate: while the startup backfill hasn't finished, the rollup tables don't
 * cover all of history yet, so reads fall back to raw. `rollupsReady` hits
 * `pipeline_state`, which is cheap but not free on every request, so the
 * result is cached in-module for a minute — long enough that the one-time
 * flip from "not ready" to "ready" is noticed within a request or two, short
 * enough that no deploy needs to know to bust it.
 */

import { classifyPage } from "@workspace/lib/citations/page-classification";
import { db } from "@workspace/lib/db/db";
import { rollupsReady } from "@workspace/lib/rollups";
import * as raw from "@/lib/postgres-read";
import * as rollup from "@/lib/rollup-read";

const READY_CACHE_MS = 60_000;
let readyCache: { value: boolean; expiresAt: number } | null = null;

async function isReady(): Promise<boolean> {
	const now = Date.now();
	if (readyCache && readyCache.expiresAt > now) return readyCache.value;
	let value = false;
	try {
		value = await rollupsReady(db);
	} catch (error) {
		// A web deploy can land before the migration; the raw reads still work then.
		console.error("[analytics-read] rollup readiness check failed, serving raw reads:", error);
	}
	readyCache = { value, expiresAt: now + READY_CACHE_MS };
	return value;
}

/**
 * Picks the rollup implementation once the backfill has caught up, raw
 * otherwise. Takes thunks rather than the functions themselves so neither
 * module is actually touched until the returned function is called: both
 * `raw` and `rollup` export several dozen names, and a caller (a test with a
 * partial mock of one module, say) may only ever exercise a few of them —
 * resolving `rollup.x`/`raw.x` here, at every export's definition, would
 * touch all of them just by importing this module.
 */
function gated<Args extends unknown[], R>(
	rollupFn: () => (...args: Args) => Promise<R>,
	rawFn: () => (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
	return async (...args: Args) => ((await isReady()) ? rollupFn() : rawFn())(...args);
}

export const getDashboardSummary = gated(
	() => rollup.getDashboardSummary,
	() => raw.getDashboardSummary,
);
export const getPerPromptVisibilityTimeSeries = gated(
	() => rollup.getPerPromptVisibilityTimeSeries,
	() => raw.getPerPromptVisibilityTimeSeries,
);
export const getVisibilityDailyAggregate = gated(
	() => rollup.getVisibilityDailyAggregate,
	() => raw.getVisibilityDailyAggregate,
);
export const getCitationsTotalCount = gated(
	() => rollup.getCitationsTotalCount,
	() => raw.getCitationsTotalCount,
);
export const getPromptsSummary = gated(
	() => rollup.getPromptsSummary,
	() => raw.getPromptsSummary,
);
export const getCitationDomainStats = gated(
	() => rollup.getCitationDomainStats,
	() => raw.getCitationDomainStats,
);
export const getCitationUrlStats = gated(
	() => rollup.getCitationUrlStats,
	() => raw.getCitationUrlStats,
);
export const getCitationDomainPromptCounts = gated(
	() => rollup.getCitationDomainPromptCounts,
	() => raw.getCitationDomainPromptCounts,
);
export const getPromptCitationUrlStats = gated(
	() => rollup.getPromptCitationUrlStats,
	() => raw.getPromptCitationUrlStats,
);
export const getPromptMentionSummary = gated(
	() => rollup.getPromptMentionSummary,
	() => raw.getPromptMentionSummary,
);
export const getPromptTopCompetitorMentions = gated(
	() => rollup.getPromptTopCompetitorMentions,
	() => raw.getPromptTopCompetitorMentions,
);
export const getDailyCitationStats = gated(
	() => rollup.getDailyCitationStats,
	() => raw.getDailyCitationStats,
);
export const getPerPromptDailyCitationStats = gated(
	() => rollup.getPerPromptDailyCitationStats,
	() => raw.getPerPromptDailyCitationStats,
);
export const getPerPromptRunStats = gated(
	() => rollup.getPerPromptRunStats,
	() => raw.getPerPromptRunStats,
);
export const getBrandMentionTotals = gated(
	() => rollup.getBrandMentionTotals,
	() => raw.getBrandMentionTotals,
);
export const getPerPromptDailyMentions = gated(
	() => rollup.getPerPromptDailyMentions,
	() => raw.getPerPromptDailyMentions,
);
export const getPerPromptDailyCompetitorMentions = gated(
	() => rollup.getPerPromptDailyCompetitorMentions,
	() => raw.getPerPromptDailyCompetitorMentions,
);
export const getPerPromptCitationPages = gated(
	() => rollup.getPerPromptCitationPages,
	() => raw.getPerPromptCitationPages,
);
export const getBrandMentionRateByModel = gated(
	() => rollup.getBrandMentionRateByModel,
	() => raw.getBrandMentionRateByModel,
);
export const getBatchChartData = gated(
	() => rollup.getBatchChartData,
	() => raw.getBatchChartData,
);

// Same row shapes whichever path answered, so consumers can name one type
// regardless of which module actually produced the rows.
export type {
	BrandMentionTotals,
	CitationDomainStats,
	CitationUrlStats,
	DailyCitationStats,
	DashboardSummary,
	ModelMentionRateRow,
	PerPromptCitationPageRow,
	PerPromptDailyCitationStats,
	PerPromptDailyCompetitorRow,
	PerPromptDailyMentionRow,
	PerPromptRunStats,
	PerPromptVisibilityPoint,
	ProcessedBatchChartDataPoint,
	PromptMentionSummary,
	PromptSummary,
	TopCompetitorMention,
	VisibilityDailyAggregate,
} from "@/lib/postgres-read";

/**
 * Reproduces today's per-model citations loop (the one `getBrandModelBreakdown`
 * used to run itself) so the pre-backfill window still shows what production
 * shows today: `getBrandMentionRateByModel`, unfiltered, enumerates the
 * distinct models in scope, and each one's count comes from the bare
 * (non-premium) target — the same call `getCitationsTotalCount(..., row.model)`
 * the old loop made. `web_search_enabled: false` reflects that: a bare model
 * name is never the grounded target, so this fallback cannot distinguish a
 * standard citation from a grounded one the way the rollup path can.
 */
async function citationsCountByModelFallback(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
): Promise<rollup.CitationCountByModelRow[]> {
	const modelRows = await raw.getBrandMentionRateByModel(brandId, fromDate, toDate, timezone, enabledPromptIds);
	return Promise.all(
		modelRows.map(async (row) => ({
			model: row.model,
			provider: "",
			web_search_enabled: false,
			count: await raw.getCitationsTotalCount(brandId, fromDate, toDate, timezone, enabledPromptIds, row.model),
		})),
	);
}

export async function getCitationsCountByModel(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
): Promise<rollup.CitationCountByModelRow[]> {
	return (await isReady())
		? rollup.getCitationsCountByModel(brandId, fromDate, toDate, timezone, enabledPromptIds)
		: citationsCountByModelFallback(brandId, fromDate, toDate, timezone, enabledPromptIds);
}

/**
 * Classifies each raw per-(prompt, day, URL) row the same way a rebuild
 * would (`classifyPage`, tenant-independent — the brand/competitor override
 * is applied on top of the result by the caller, same as the rollup path),
 * then folds rows that land on the same (prompt, day, domain, category, page
 * type) key together, the way the grouped rollup query would.
 */
export function classifyDailyPages(rows: raw.PerPromptDailyCitationPageRow[]): rollup.PerPromptDailyCitationClassRow[] {
	const folded = new Map<string, rollup.PerPromptDailyCitationClassRow>();
	for (const row of rows) {
		if (!row.url) continue;
		const { pageType, staticCategory } = classifyPage(row.url, row.domain, row.title);
		const date = String(row.date);
		const key = `${row.prompt_id}\u0000${date}\u0000${row.domain}\u0000${staticCategory}\u0000${pageType}`;
		const existing = folded.get(key);
		if (existing) {
			existing.count += Number(row.count);
			continue;
		}
		folded.set(key, {
			prompt_id: row.prompt_id,
			date,
			domain: row.domain,
			static_category: staticCategory,
			page_type: pageType,
			count: Number(row.count),
		});
	}
	return [...folded.values()];
}

async function perPromptDailyCitationClassesFallback(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<rollup.PerPromptDailyCitationClassRow[]> {
	const rows = await raw.getPerPromptDailyCitationPages(brandId, fromDate, toDate, timezone, enabledPromptIds, model);
	return classifyDailyPages(rows);
}

export async function getPerPromptDailyCitationClasses(
	brandId: string,
	fromDate: string,
	toDate: string,
	timezone: string,
	enabledPromptIds?: string[],
	model?: string,
): Promise<rollup.PerPromptDailyCitationClassRow[]> {
	return (await isReady())
		? rollup.getPerPromptDailyCitationClasses(brandId, fromDate, toDate, timezone, enabledPromptIds, model)
		: perPromptDailyCitationClassesFallback(brandId, fromDate, toDate, timezone, enabledPromptIds, model);
}

export type { CitationCountByModelRow, PerPromptDailyCitationClassRow } from "@/lib/rollup-read";
