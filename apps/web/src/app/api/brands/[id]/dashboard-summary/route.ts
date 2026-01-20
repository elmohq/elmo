import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { prompts, competitors, brands } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, sql, count } from "drizzle-orm";
import { generateDateRange, getDaysFromLookback, type LookbackPeriod } from "@/lib/chart-utils";
import { 
	getDashboardSummary, 
	getVisibilityTimeSeries, 
	getDailyCitationStats,
} from "@/lib/tinybird-read-v2";

type Params = {
	id: string;
};

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

// Helper function to extract domain from URL or website string
function extractDomain(urlOrDomain: string): string {
	try {
		const cleaned = urlOrDomain.replace(/^https?:\/\//, '');
		const withoutWww = cleaned.replace(/^www\./, '');
		const domain = withoutWww.split('/')[0];
		return domain.toLowerCase();
	} catch (e) {
		return urlOrDomain.toLowerCase();
	}
}

// List of common social media domains
const SOCIAL_MEDIA_DOMAINS = [
	'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com',
	'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'snapchat.com',
	'tumblr.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'twitch.tv',
];

function isSocialMediaDomain(domain: string): boolean {
	return SOCIAL_MEDIA_DOMAINS.some(sm => domain === sm || domain.endsWith(`.${sm}`));
}

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;
		const { searchParams } = new URL(request.url);

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Parse lookback parameter
		const lookbackParam = (searchParams.get("lookback") || "1m") as LookbackPeriod;
		
		// Use UTC for date grouping to match PostgreSQL behavior
		// PostgreSQL was using: DATE(pr.created_at AT TIME ZONE 'UTC')
		const timezone = "UTC";

		let fromDate: Date | undefined;
		let toDate: Date | undefined;
		let fromDateStr: string | null = null;
		let toDateStr: string | null = null;

		// Handle lookback periods
		if (lookbackParam !== "all") {
			toDate = new Date();
			fromDate = new Date();

			switch (lookbackParam) {
				case "1w":
					fromDate.setDate(fromDate.getDate() - 7);
					break;
				case "1m":
					fromDate.setMonth(fromDate.getMonth() - 1);
					break;
				case "3m":
					fromDate.setMonth(fromDate.getMonth() - 3);
					break;
				case "6m":
					fromDate.setMonth(fromDate.getMonth() - 6);
					break;
				case "1y":
					fromDate.setFullYear(fromDate.getFullYear() - 1);
					break;
			}
			
			fromDateStr = fromDate.toISOString().split("T")[0];
			toDateStr = toDate.toISOString().split("T")[0];
		}

		// Get brand info, competitors, and enabled prompts from PostgreSQL
		// These are needed for categorization and filtering
		const [
			brandResult,
			competitorsList,
			enabledPromptsResult,
			totalPromptsResult,
		] = await Promise.all([
			// Get brand info
			db
				.select({ name: brands.name, website: brands.website })
				.from(brands)
				.where(eq(brands.id, brandId))
				.limit(1),

			// Get competitors for citation categorization
			db.select().from(competitors).where(eq(competitors.brandId, brandId)),

			// Get enabled prompts with their values (to determine branded/non-branded)
			db
				.select({ id: prompts.id, value: prompts.value })
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true))),

			// Get total prompts count
			db
				.select({ count: count() })
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true))),
		]);

		// Process results
		const brandName = brandResult[0]?.name || "";
		const brandWebsite = brandResult[0]?.website || "";
		const brandDomain = extractDomain(brandWebsite);
		const competitorDomains = new Set(competitorsList.map(c => extractDomain(c.domain)));
		const totalPrompts = totalPromptsResult[0]?.count || 0;

		// Extract enabled prompt IDs and determine which are "branded" (contain brand name)
		const enabledPromptIds = enabledPromptsResult.map((p) => p.id);
		const brandedPromptIds = enabledPromptsResult
			.filter((p) => p.value.toLowerCase().includes(brandName.toLowerCase()))
			.map((p) => p.id);

		// Query Tinybird v2 for analytics data
		const [summaryResult, visibilityData, citationData] = await Promise.all([
			// Dashboard summary metrics
			getDashboardSummary(
				brandId,
				fromDateStr,
				toDateStr,
				timezone,
				enabledPromptIds,
			),
			// Visibility time series (grouped by date and branded/non-branded)
			getVisibilityTimeSeries(
				brandId,
				fromDateStr,
				toDateStr,
				timezone,
				brandedPromptIds,
				enabledPromptIds,
			),
			// Daily citation stats by domain
			fromDateStr && toDateStr
				? getDailyCitationStats(
						brandId,
						fromDateStr,
						toDateStr,
						timezone,
						enabledPromptIds,
				  )
				: Promise.resolve([]),
		]);

		// Process summary data
		const summary = summaryResult[0];
		const totalRuns = summary ? Number(summary.total_runs) : 0;
		const lastUpdatedAt = summary?.last_updated || null;

		// Process visibility data to calculate branded/non-branded metrics
		// Group by date, then separate branded vs non-branded
		const dailyVisibilityMap = new Map<string, {
			branded: { total: number; mentioned: number };
			nonBranded: { total: number; mentioned: number };
		}>();

		let totalBrandedRuns = 0;
		let totalBrandedMentioned = 0;
		let totalNonBrandedRuns = 0;
		let totalNonBrandedMentioned = 0;

		for (const row of visibilityData) {
			const dateStr = String(row.date);
			if (!dailyVisibilityMap.has(dateStr)) {
				dailyVisibilityMap.set(dateStr, {
					branded: { total: 0, mentioned: 0 },
					nonBranded: { total: 0, mentioned: 0 },
				});
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

		// Calculate overall visibility metrics
		const totalQualifyingRuns = totalBrandedRuns + totalNonBrandedRuns;
		const totalMentioned = totalBrandedMentioned + totalNonBrandedMentioned;
		
		const averageVisibility = totalQualifyingRuns > 0
			? Math.round((totalMentioned / totalQualifyingRuns) * 100)
			: 0;
		const nonBrandedVisibility = totalNonBrandedRuns > 0
			? Math.round((totalNonBrandedMentioned / totalNonBrandedRuns) * 100)
			: 0;
		const brandedVisibility = totalBrandedRuns > 0
			? Math.round((totalBrandedMentioned / totalBrandedRuns) * 100)
			: 100; // Default for branded prompts

		// Generate date range for time series
		let startDate: Date;
		let endDate: Date;

		const sortedDates = Array.from(dailyVisibilityMap.keys()).sort();
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

		// Process citation data - categorize by domain
		const citationsByDate: Record<string, { brand: number; competitor: number; socialMedia: number; other: number }> = {};
		
		for (const row of citationData) {
			const dateStr = String(row.date);
			const domain = row.domain;
			
			if (!citationsByDate[dateStr]) {
				citationsByDate[dateStr] = { brand: 0, competitor: 0, socialMedia: 0, other: 0 };
			}
			
			if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) {
				citationsByDate[dateStr].brand += Number(row.count);
			} else if (competitorDomains.has(domain)) {
				citationsByDate[dateStr].competitor += Number(row.count);
			} else if (isSocialMediaDomain(domain)) {
				citationsByDate[dateStr].socialMedia += Number(row.count);
			} else {
				citationsByDate[dateStr].other += Number(row.count);
			}
		}

		// Calculate visibility time series with 7-day rolling average
		const ROLLING_WINDOW_DAYS = 7;
		
		const visibilityTimeSeries: VisibilityTimeSeriesPoint[] = dateRange.map((date, dateIndex) => {
			let windowBrandedTotal = 0;
			let windowBrandedMentioned = 0;
			let windowNonBrandedTotal = 0;
			let windowNonBrandedMentioned = 0;
			
			for (let i = 0; i < ROLLING_WINDOW_DAYS; i++) {
				const lookbackIndex = dateIndex - i;
				if (lookbackIndex >= 0) {
					const lookbackDate = dateRange[lookbackIndex];
					const dayData = dailyVisibilityMap.get(lookbackDate);
					if (dayData) {
						windowBrandedTotal += dayData.branded.total;
						windowBrandedMentioned += dayData.branded.mentioned;
						windowNonBrandedTotal += dayData.nonBranded.total;
						windowNonBrandedMentioned += dayData.nonBranded.mentioned;
					}
				}
			}

			const totalWindowRuns = windowBrandedTotal + windowNonBrandedTotal;
			const totalWindowMentioned = windowBrandedMentioned + windowNonBrandedMentioned;

			if (totalWindowRuns === 0) {
				return { date, overall: null, nonBranded: null, branded: null };
			}

			const overall = Math.round((totalWindowMentioned / totalWindowRuns) * 100);
			const nonBranded = windowNonBrandedTotal > 0
				? Math.round((windowNonBrandedMentioned / windowNonBrandedTotal) * 100)
				: null;
			const branded = windowBrandedTotal > 0
				? Math.round((windowBrandedMentioned / windowBrandedTotal) * 100)
				: null;

			return { date, overall, nonBranded, branded };
		});

		// Calculate citation time series with rolling average
		const citationTimeSeries: CitationTimeSeriesPoint[] = dateRange.map((date, dateIndex) => {
			let brandTotal = 0;
			let competitorTotal = 0;
			let socialMediaTotal = 0;
			let otherTotal = 0;
			let daysCounted = 0;

			for (let i = 0; i < ROLLING_WINDOW_DAYS; i++) {
				const lookbackIndex = dateIndex - i;
				if (lookbackIndex >= 0) {
					const lookbackDate = dateRange[lookbackIndex];
					const citationsForDay = citationsByDate[lookbackDate];
					if (citationsForDay) {
						brandTotal += citationsForDay.brand;
						competitorTotal += citationsForDay.competitor;
						socialMediaTotal += citationsForDay.socialMedia;
						otherTotal += citationsForDay.other;
					}
					daysCounted++;
				}
			}

			const divisor = daysCounted || 1;
			return {
				date,
				brand: Math.round(brandTotal / divisor),
				competitor: Math.round(competitorTotal / divisor),
				socialMedia: Math.round(socialMediaTotal / divisor),
				other: Math.round(otherTotal / divisor),
			};
		});

		const response: DashboardSummaryResponse = {
			totalPrompts: Number(totalPrompts),
			totalRuns,
			averageVisibility,
			nonBrandedVisibility,
			brandedVisibility,
			visibilityTimeSeries,
			citationTimeSeries,
			lastUpdatedAt,
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching dashboard summary:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
