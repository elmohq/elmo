// Until the startup backfill finishes the rollup tables don't cover all history, so
// reads fall back to raw.

import { normalizeUrl } from "@workspace/lib/citations/domain-categories";
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

// Thunks, not functions: resolving `rollup.x`/`raw.x` at definition time would touch
// every export on import, which breaks partially mocked modules in tests.
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

// A bare model name is never the grounded target, so unlike the rollup path this
// fallback can't tell standard citations from grounded ones.
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
 * Classifies each daily row by its page's canonical title, the one the URL table
 * shows, so a page falls in the same category in the chart as in the table.
 * Tenant-independent like the rollup rebuild; callers apply the brand/competitor
 * override on top.
 */
export function classifyDailyPages(
	rows: raw.PerPromptDailyCitationPageRow[],
	urlStats: raw.CitationUrlStats[],
): rollup.PerPromptDailyCitationClassRow[] {
	const titleByUrl = new Map<string, string | null>();
	for (const { url, title } of urlStats) {
		const normalized = normalizeUrl(url);
		if (!titleByUrl.get(normalized)) titleByUrl.set(normalized, title || null);
	}

	const folded = new Map<string, rollup.PerPromptDailyCitationClassRow>();
	for (const row of rows) {
		if (!row.url) continue;
		const url = normalizeUrl(row.url);
		const { pageType, staticCategory } = classifyPage(url, row.domain, titleByUrl.get(url) ?? row.title);
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
	const [rows, urlStats] = await Promise.all([
		raw.getPerPromptDailyCitationPages(brandId, fromDate, toDate, timezone, enabledPromptIds, model),
		raw.getCitationUrlStats(brandId, fromDate, toDate, timezone, enabledPromptIds, model),
	]);
	return classifyDailyPages(rows, urlStats);
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
