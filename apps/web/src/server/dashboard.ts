/** Server functions for dashboard data. */
import { createServerFn } from "@tanstack/react-start";
import {
	type CitationCategory,
	emptyCategoryCounts,
	extractDomain,
	toRoundedPercentages,
} from "@workspace/lib/citations/domain-categories";
import { categorizeDomain } from "@workspace/lib/citations/domain-lists";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { applyPerPromptCitationLVCF, applyPerPromptLVCF, generateDateRange } from "@/lib/chart-utils";
import { lookbackSchema } from "@/lib/lookback";
import {
	getDailyVerdicts,
	getMentionTotals,
	getPerPromptDailyCitationDomains,
	getPerPromptDailyRuns,
} from "@/lib/rollup-read";
import {
	averagePosition,
	type PositionPoint,
	positionSeries,
	SENTIMENT_WINDOW_DAYS,
	type SentimentCounts,
	type SentimentPoint,
	sentimentCounts,
	sentimentSeries,
	shiftDate,
} from "@/lib/sentiment";
import { resolveBrandWindow } from "@/server/brand-window";

interface VisibilityTimeSeriesPoint {
	date: string;
	overall: number | null;
	nonBranded: number | null;
	branded: number | null;
}

type CitationTimeSeriesPoint = { date: string } & Record<CitationCategory, number>;

export interface DashboardSummaryResponse {
	totalPrompts: number;
	totalRuns: number;
	averageVisibility: number;
	nonBrandedVisibility: number;
	brandedVisibility: number;
	visibilityTimeSeries: VisibilityTimeSeriesPoint[];
	citationTimeSeries: CitationTimeSeriesPoint[];
	sentiment: SentimentCounts;
	sentimentTimeSeries: SentimentPoint[];
	/** The brand's average position among the tracked companies an answer names; null when never ranked. */
	averagePosition: number | null;
	positionTimeSeries: PositionPoint[];
	lastUpdatedAt: string | null;
}

export const getDashboardSummaryFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			lookback: lookbackSchema.default("1m"),
			timezone: z.string().default("UTC"),
		}),
	)
	.handler(async ({ data }): Promise<DashboardSummaryResponse> => {
		await requireBrandSession(data.brandId);

		// Same timezone-aware window as the visibility and share-of-voice pages, so
		// the overview's two trend charts share one date domain (issue #413).
		const { timezone, fromDateStr, toDateStr } = await resolveBrandWindow(data.brandId, data.lookback, data.timezone);

		const [brandResult, competitorsList, enabledPromptsResult, totalPromptsResult] = await Promise.all([
			db
				.select({
					name: brands.name,
					website: brands.website,
					additionalDomains: brands.additionalDomains,
					delayOverrideHours: brands.delayOverrideHours,
				})
				.from(brands)
				.where(eq(brands.id, data.brandId))
				.limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
			db
				.select({ id: prompts.id, value: prompts.value, systemTags: prompts.systemTags, tags: prompts.tags })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
			db
				.select({ count: count() })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);

		const brandWebsite = brandResult[0]?.website || "";
		const primaryBrandDomain = extractDomain(brandWebsite);
		const additionalBrandDomains = (brandResult[0]?.additionalDomains || []).map(extractDomain);
		const brandDomains = new Set([primaryBrandDomain, ...additionalBrandDomains].filter(Boolean));
		const competitorDomains = new Set(competitorsList.flatMap((c) => c.domains.map(extractDomain)).filter(Boolean));
		const totalPrompts = totalPromptsResult[0]?.count || 0;

		const enabledPromptIds = enabledPromptsResult.map((p) => p.id);
		const brandedPromptIds = enabledPromptsResult
			.filter((p) => getEffectiveBrandedStatus(p.systemTags || [], p.tags || []).isBranded)
			.map((p) => p.id);

		const scope = { brandId: data.brandId, from: fromDateStr, to: toDateStr, timezone, promptIds: enabledPromptIds };
		const [totals, perPromptVisibility, perPromptCitations, dailyVerdicts] = await Promise.all([
			getMentionTotals(scope),
			getPerPromptDailyRuns(scope),
			getPerPromptDailyCitationDomains(scope),
			// Reaching back so the trailing window is full from the first plotted day.
			getDailyVerdicts({
				...scope,
				from: shiftDate(fromDateStr, 1 - SENTIMENT_WINDOW_DAYS),
			}),
		]);

		const totalRuns = totals.runs;
		const lastUpdatedAt = totals.last_run_at;

		// Same window as the DB queries above (and as share-of-voice), so LVCF
		// smoothing and the emitted series cover exactly this date domain.
		const dateRange = generateDateRange(new Date(fromDateStr), new Date(toDateStr));

		const {
			dailyVisibilityMap,
			totalBrandedRuns,
			totalBrandedMentioned,
			totalNonBrandedRuns,
			totalNonBrandedMentioned,
		} = applyPerPromptLVCF(perPromptVisibility, dateRange, brandedPromptIds);

		const totalQualifyingRuns = totalBrandedRuns + totalNonBrandedRuns;
		const totalMentioned = totalBrandedMentioned + totalNonBrandedMentioned;
		const averageVisibility = totalQualifyingRuns > 0 ? Math.round((totalMentioned / totalQualifyingRuns) * 100) : 0;
		const nonBrandedVisibility =
			totalNonBrandedRuns > 0 ? Math.round((totalNonBrandedMentioned / totalNonBrandedRuns) * 100) : 0;
		const brandedVisibility = totalBrandedRuns > 0 ? Math.round((totalBrandedMentioned / totalBrandedRuns) * 100) : 100;

		const visibilityTimeSeries: VisibilityTimeSeriesPoint[] = dateRange.map((date) => {
			const d = dailyVisibilityMap.get(date);
			if (!d) return { date, overall: null, nonBranded: null, branded: null };
			const t = d.branded.total + d.nonBranded.total;
			const m = d.branded.mentioned + d.nonBranded.mentioned;
			if (t === 0) return { date, overall: null, nonBranded: null, branded: null };
			return {
				date,
				overall: Math.round((m / t) * 100),
				nonBranded: d.nonBranded.total > 0 ? Math.round((d.nonBranded.mentioned / d.nonBranded.total) * 100) : null,
				branded: d.branded.total > 0 ? Math.round((d.branded.mentioned / d.branded.total) * 100) : null,
			};
		});

		const smoothedCitations = applyPerPromptCitationLVCF(
			perPromptCitations,
			dateRange,
			brandResult[0]?.delayOverrideHours,
			(domain: string) => categorizeDomain(domain, brandDomains, competitorDomains),
		);
		const citationTimeSeries: CitationTimeSeriesPoint[] = dateRange.map((date) => {
			const c = smoothedCitations.get(date);
			if (!c) return { date, ...emptyCategoryCounts() };
			return { date, ...(toRoundedPercentages(c) as Record<CitationCategory, number>) };
		});

		return {
			totalPrompts: Number(totalPrompts),
			totalRuns,
			averageVisibility,
			nonBrandedVisibility,
			brandedVisibility,
			visibilityTimeSeries,
			citationTimeSeries,
			sentiment: sentimentCounts(totals),
			sentimentTimeSeries: sentimentSeries(dailyVerdicts, dateRange),
			averagePosition: averagePosition(totals.position_sum, totals.positioned_runs),
			positionTimeSeries: positionSeries(dailyVerdicts, dateRange),
			lastUpdatedAt,
		};
	});
