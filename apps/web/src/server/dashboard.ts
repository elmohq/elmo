/**
 * Server functions for dashboard data.
 * Replaces apps/web/src/app/api/brands/[id]/dashboard-summary/route.ts
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { prompts, competitors, brands } from "@workspace/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { generateDateRange, getDaysFromLookback, type LookbackPeriod } from "@/lib/chart-utils";
import {
	getDashboardSummary,
	getVisibilityTimeSeries,
	getDailyCitationStats,
} from "@/lib/postgres-read";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";

// ============================================================================
// Types
// ============================================================================

export interface VisibilityTimeSeriesPoint {
	date: string;
	overall: number | null;
	nonBranded: number | null;
	branded: number | null;
}

export interface CitationTimeSeriesPoint {
	date: string;
	brand: number;
	competitor: number;
	socialMedia: number;
	other: number;
}

export interface DashboardSummaryResponse {
	totalPrompts: number;
	totalRuns: number;
	averageVisibility: number;
	nonBrandedVisibility: number;
	brandedVisibility: number;
	visibilityTimeSeries: VisibilityTimeSeriesPoint[];
	citationTimeSeries: CitationTimeSeriesPoint[];
	lastUpdatedAt: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function extractDomain(urlOrDomain: string): string {
	try {
		const cleaned = urlOrDomain.replace(/^https?:\/\//, "");
		const withoutWww = cleaned.replace(/^www\./, "");
		return withoutWww.split("/")[0].toLowerCase();
	} catch {
		return urlOrDomain.toLowerCase();
	}
}

const SOCIAL_MEDIA_DOMAINS = [
	"facebook.com", "twitter.com", "x.com", "instagram.com", "linkedin.com",
	"youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "snapchat.com",
	"tumblr.com", "whatsapp.com", "telegram.org", "discord.com", "twitch.tv",
];

function isSocialMediaDomain(domain: string): boolean {
	return SOCIAL_MEDIA_DOMAINS.some((sm) => domain === sm || domain.endsWith(`.${sm}`));
}

const ROLLING_WINDOW_DAYS = 7;

// ============================================================================
// Server Function
// ============================================================================

/**
 * Get dashboard summary with visibility and citation time series.
 */
export const getDashboardSummaryFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			lookback: z.enum(["1w", "1m", "3m", "6m", "1y", "all"]).default("1m"),
		}),
	)
	.handler(async ({ data }): Promise<DashboardSummaryResponse> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const lookbackParam = data.lookback as LookbackPeriod;
		const timezone = "UTC";

		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;

		if (lookbackParam !== "all") {
			const toDate = new Date();
			const fromDate = new Date();
			switch (lookbackParam) {
				case "1w": fromDate.setDate(fromDate.getDate() - 7); break;
				case "1m": fromDate.setMonth(fromDate.getMonth() - 1); break;
				case "3m": fromDate.setMonth(fromDate.getMonth() - 3); break;
				case "6m": fromDate.setMonth(fromDate.getMonth() - 6); break;
				case "1y": fromDate.setFullYear(fromDate.getFullYear() - 1); break;
			}
			fromDateStr = fromDate.toISOString().split("T")[0];
			toDateStr = toDate.toISOString().split("T")[0];
		}

		// Get brand info, competitors, and prompts from PostgreSQL
		const [brandResult, competitorsList, enabledPromptsResult, totalPromptsResult] = await Promise.all([
			db.select({ name: brands.name, website: brands.website }).from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
			db.select({ id: prompts.id, value: prompts.value, systemTags: prompts.systemTags, tags: prompts.tags })
				.from(prompts).where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
			db.select({ count: count() }).from(prompts).where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);

		const brandWebsite = brandResult[0]?.website || "";
		const brandDomain = extractDomain(brandWebsite);
		const competitorDomains = new Set(competitorsList.map((c) => extractDomain(c.domain)));
		const totalPrompts = totalPromptsResult[0]?.count || 0;

		const enabledPromptIds = enabledPromptsResult.map((p) => p.id);
		const brandedPromptIds = enabledPromptsResult
			.filter((p) => getEffectiveBrandedStatus(p.systemTags || [], p.tags || []).isBranded)
			.map((p) => p.id);

		// Query Tinybird for analytics data
		const [summaryResult, visibilityData, citationData] = await Promise.all([
			getDashboardSummary(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds),
			getVisibilityTimeSeries(data.brandId, fromDateStr, toDateStr, timezone, brandedPromptIds, enabledPromptIds),
			fromDateStr && toDateStr
				? getDailyCitationStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds)
				: Promise.resolve([]),
		]);

		// Process summary
		const summary = summaryResult[0];
		const totalRuns = summary ? Number(summary.total_runs) : 0;
		const lastUpdatedAt = summary?.last_updated || null;

		// Process visibility data
		const dailyVisibilityMap = new Map<string, {
			branded: { total: number; mentioned: number };
			nonBranded: { total: number; mentioned: number };
		}>();
		let totalBrandedRuns = 0, totalBrandedMentioned = 0, totalNonBrandedRuns = 0, totalNonBrandedMentioned = 0;

		for (const row of visibilityData) {
			const dateStr = String(row.date);
			if (!dailyVisibilityMap.has(dateStr)) {
				dailyVisibilityMap.set(dateStr, { branded: { total: 0, mentioned: 0 }, nonBranded: { total: 0, mentioned: 0 } });
			}
			const dayData = dailyVisibilityMap.get(dateStr)!;
			if (row.is_branded) {
				dayData.branded.total += Number(row.total_runs);
				dayData.branded.mentioned += Number(row.brand_mentioned_count);
				totalBrandedRuns += Number(row.total_runs);
				totalBrandedMentioned += Number(row.brand_mentioned_count);
			} else {
				dayData.nonBranded.total += Number(row.total_runs);
				dayData.nonBranded.mentioned += Number(row.brand_mentioned_count);
				totalNonBrandedRuns += Number(row.total_runs);
				totalNonBrandedMentioned += Number(row.brand_mentioned_count);
			}
		}

		const totalQualifyingRuns = totalBrandedRuns + totalNonBrandedRuns;
		const totalMentioned = totalBrandedMentioned + totalNonBrandedMentioned;
		const averageVisibility = totalQualifyingRuns > 0 ? Math.round((totalMentioned / totalQualifyingRuns) * 100) : 0;
		const nonBrandedVisibility = totalNonBrandedRuns > 0 ? Math.round((totalNonBrandedMentioned / totalNonBrandedRuns) * 100) : 0;
		const brandedVisibility = totalBrandedRuns > 0 ? Math.round((totalBrandedMentioned / totalBrandedRuns) * 100) : 100;

		// Generate date range
		const sortedDates = Array.from(dailyVisibilityMap.keys()).sort();
		let startDate: Date, endDate: Date;
		if (lookbackParam === "all" && sortedDates.length > 0) {
			startDate = new Date(sortedDates[0]);
			endDate = new Date(sortedDates[sortedDates.length - 1]);
		} else {
			const daysToSubtract = getDaysFromLookback(lookbackParam);
			const currentDateInTimezone = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
			endDate = new Date(currentDateInTimezone);
			startDate = new Date(endDate);
			startDate.setDate(startDate.getDate() - (daysToSubtract - 1));
		}
		const dateRange = generateDateRange(startDate, endDate);

		// Process citation data
		const citationsByDate: Record<string, { brand: number; competitor: number; socialMedia: number; other: number }> = {};
		for (const row of citationData) {
			const dateStr = String(row.date);
			const domain = row.domain;
			if (!citationsByDate[dateStr]) citationsByDate[dateStr] = { brand: 0, competitor: 0, socialMedia: 0, other: 0 };
			if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) citationsByDate[dateStr].brand += Number(row.count);
			else if (competitorDomains.has(domain)) citationsByDate[dateStr].competitor += Number(row.count);
			else if (isSocialMediaDomain(domain)) citationsByDate[dateStr].socialMedia += Number(row.count);
			else citationsByDate[dateStr].other += Number(row.count);
		}

		// Build time series
		const visibilityTimeSeries: VisibilityTimeSeriesPoint[] = dateRange.map((date, dateIndex) => {
			let wBT = 0, wBM = 0, wNBT = 0, wNBM = 0;
			for (let i = 0; i < ROLLING_WINDOW_DAYS; i++) {
				if (dateIndex - i >= 0) {
					const d = dailyVisibilityMap.get(dateRange[dateIndex - i]);
					if (d) { wBT += d.branded.total; wBM += d.branded.mentioned; wNBT += d.nonBranded.total; wNBM += d.nonBranded.mentioned; }
				}
			}
			const t = wBT + wNBT, m = wBM + wNBM;
			if (t === 0) return { date, overall: null, nonBranded: null, branded: null };
			return {
				date,
				overall: Math.round((m / t) * 100),
				nonBranded: wNBT > 0 ? Math.round((wNBM / wNBT) * 100) : null,
				branded: wBT > 0 ? Math.round((wBM / wBT) * 100) : null,
			};
		});

		const citationTimeSeries: CitationTimeSeriesPoint[] = dateRange.map((date, dateIndex) => {
			let bT = 0, cT = 0, sT = 0, oT = 0, dc = 0;
			for (let i = 0; i < ROLLING_WINDOW_DAYS; i++) {
				if (dateIndex - i >= 0) {
					const c = citationsByDate[dateRange[dateIndex - i]];
					if (c) { bT += c.brand; cT += c.competitor; sT += c.socialMedia; oT += c.other; }
					dc++;
				}
			}
			const d = dc || 1;
			return { date, brand: Math.round(bT / d), competitor: Math.round(cT / d), socialMedia: Math.round(sT / d), other: Math.round(oT / d) };
		});

		return {
			totalPrompts: Number(totalPrompts),
			totalRuns,
			averageVisibility,
			nonBrandedVisibility,
			brandedVisibility,
			visibilityTimeSeries,
			citationTimeSeries,
			lastUpdatedAt,
		};
	});
