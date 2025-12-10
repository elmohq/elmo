import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import { generateDateRange, getDaysFromLookback, type LookbackPeriod } from "@/lib/chart-utils";

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
		
		let fromDate: Date | undefined;
		let toDate: Date | undefined;

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
		}

		// Build query conditions
		const runConditions = [];
		if (fromDate) runConditions.push(gte(promptRuns.createdAt, fromDate));
		if (toDate) runConditions.push(lte(promptRuns.createdAt, toDate));

		// Run all queries in parallel for speed
		const [
			brandResult,
			totalPromptsResult,
			totalRunsResult,
			competitorsList,
		] = await Promise.all([
			// Get brand info for brand name
			db
				.select({ name: brands.name, website: brands.website })
				.from(brands)
				.where(eq(brands.id, brandId))
				.limit(1),

			// Get total prompts count
			db
				.select({ count: count() })
				.from(prompts)
				.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true))),

			// Get total runs count (for enabled prompts only)
			db
				.select({ count: count() })
				.from(promptRuns)
				.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
				.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true), ...runConditions)),

			// Get competitors for citation categorization
			db.select().from(competitors).where(eq(competitors.brandId, brandId)),
		]);

		// Process results
		const brandName = brandResult[0]?.name || "";
		const brandWebsite = brandResult[0]?.website || "";
		const brandDomain = extractDomain(brandWebsite);
		const competitorDomains = new Set(competitorsList.map(c => extractDomain(c.domain)));
		const totalPrompts = totalPromptsResult[0]?.count || 0;
		const totalRuns = totalRunsResult[0]?.count || 0;

		// Use SQL aggregation for visibility metrics - much faster than fetching all rows
		// This query:
		// 1. Identifies "qualifying" prompts (prompts that have at least one run with brand OR competitor mentions)
		// 2. Calculates visibility as % of runs where brand was mentioned, grouped by date
		// 3. Separates branded vs non-branded prompts (branded = prompt contains brand name)
		const visibilityAggQuery = sql<{
			run_date: string;
			is_branded: boolean;
			total_runs: number;
			brand_mentioned_count: number;
			last_run_at: string;
		}>`
			WITH qualifying_prompts AS (
				-- Find prompts that have at least one run with brand or competitor mentions
				SELECT DISTINCT p.id, p.value
				FROM prompts p
				INNER JOIN prompt_runs pr ON pr.prompt_id = p.id
				WHERE p.brand_id = ${brandId}
					AND p.enabled = true
					${fromDate ? sql`AND pr.created_at >= ${fromDate}` : sql``}
					${toDate ? sql`AND pr.created_at <= ${toDate}` : sql``}
					AND (pr.brand_mentioned = true OR COALESCE(array_length(pr.competitors_mentioned, 1), 0) > 0)
			),
			daily_stats AS (
				SELECT 
					DATE(pr.created_at AT TIME ZONE 'UTC') as run_date,
					LOWER(qp.value) LIKE LOWER('%' || ${brandName} || '%') as is_branded,
					COUNT(*) as total_runs,
					COUNT(*) FILTER (WHERE pr.brand_mentioned = true) as brand_mentioned_count,
					MAX(pr.created_at) as last_run_at
				FROM prompt_runs pr
				INNER JOIN qualifying_prompts qp ON qp.id = pr.prompt_id
				WHERE true
					${fromDate ? sql`AND pr.created_at >= ${fromDate}` : sql``}
					${toDate ? sql`AND pr.created_at <= ${toDate}` : sql``}
				GROUP BY DATE(pr.created_at AT TIME ZONE 'UTC'), is_branded
			)
			SELECT 
				run_date::text,
				is_branded,
				total_runs::int,
				brand_mentioned_count::int,
				last_run_at::text
			FROM daily_stats
			ORDER BY run_date
		`;

		const visibilityAggResult = await db.execute(visibilityAggQuery);
		
		// Aggregate visibility stats from the query results
		let totalQualifyingRuns = 0;
		let totalBrandMentioned = 0;
		let nonBrandedQualifyingRuns = 0;
		let nonBrandedMentioned = 0;
		let lastRunAt: string | null = null;
		
		// Map for time series: date -> { branded: {total, mentioned}, nonBranded: {total, mentioned} }
		const dailyVisibilityMap = new Map<string, {
			branded: { total: number; mentioned: number };
			nonBranded: { total: number; mentioned: number };
		}>();

		for (const row of visibilityAggResult.rows) {
			const r = row as { run_date: string; is_branded: boolean; total_runs: number; brand_mentioned_count: number; last_run_at: string };
			
			totalQualifyingRuns += r.total_runs;
			totalBrandMentioned += r.brand_mentioned_count;
			
			if (!r.is_branded) {
				nonBrandedQualifyingRuns += r.total_runs;
				nonBrandedMentioned += r.brand_mentioned_count;
			}
			
			if (!lastRunAt || r.last_run_at > lastRunAt) {
				lastRunAt = r.last_run_at;
			}
			
			// Store daily data for time series
			if (!dailyVisibilityMap.has(r.run_date)) {
				dailyVisibilityMap.set(r.run_date, {
					branded: { total: 0, mentioned: 0 },
					nonBranded: { total: 0, mentioned: 0 },
				});
			}
			const dayData = dailyVisibilityMap.get(r.run_date)!;
			if (r.is_branded) {
				dayData.branded.total += r.total_runs;
				dayData.branded.mentioned += r.brand_mentioned_count;
			} else {
				dayData.nonBranded.total += r.total_runs;
				dayData.nonBranded.mentioned += r.brand_mentioned_count;
			}
		}

		// Calculate visibility metrics
		const averageVisibility = totalQualifyingRuns > 0 
			? Math.round((totalBrandMentioned / totalQualifyingRuns) * 100) 
			: 0;
		const nonBrandedVisibility = nonBrandedQualifyingRuns > 0 
			? Math.round((nonBrandedMentioned / nonBrandedQualifyingRuns) * 100) 
			: 0;
		const brandedVisibility = 100; // Default for branded prompts

		// Generate time series data
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		let startDate: Date;
		let endDate: Date;

		// Get date range from aggregated results or use lookback period
		const sortedDates = Array.from(dailyVisibilityMap.keys()).sort();
		if (lookbackParam === "all" && sortedDates.length > 0) {
			startDate = new Date(sortedDates[0]);
			endDate = new Date(sortedDates[sortedDates.length - 1]);
		} else {
			const daysToSubtract = getDaysFromLookback(lookbackParam);
			const currentDateInTimezone = new Date().toLocaleDateString("en-CA", { timeZone: userTimezone });
			endDate = new Date(currentDateInTimezone);
			startDate = new Date(endDate);
			startDate.setDate(startDate.getDate() - (daysToSubtract - 1));
		}

		const dateRange = generateDateRange(startDate, endDate);

		// Fetch citations aggregated by domain and date in SQL
		// This reduces data transfer by grouping counts per domain per day instead of individual URLs
		const citationsQuery = sql<{
			run_date: string;
			domain: string;
			citation_count: number;
		}>`
			WITH prompt_runs_filtered AS (
				SELECT 
					pr.id,
					pr."modelGroup" as model_group,
					pr.raw_output::jsonb as raw_output,
					DATE(pr.created_at AT TIME ZONE 'UTC') as run_date
				FROM prompt_runs pr
				INNER JOIN prompts p ON pr.prompt_id = p.id
				WHERE 
					p.brand_id = ${brandId}
					AND p.enabled = true
					${fromDate ? sql`AND pr.created_at >= ${fromDate}` : sql``}
					AND pr.web_search_enabled = true
			),
			openai_citations AS (
				SELECT 
					annotation->>'url' as url,
					prf.run_date
				FROM prompt_runs_filtered prf
				CROSS JOIN LATERAL (
					SELECT output_item
					FROM jsonb_array_elements(
						CASE 
							WHEN jsonb_typeof(raw_output->'output') = 'array' 
							THEN raw_output->'output'
							ELSE '[]'::jsonb
						END
					) AS output_item
					WHERE output_item->>'type' = 'message'
				) AS outputs
				CROSS JOIN LATERAL (
					SELECT content_item
					FROM jsonb_array_elements(
						CASE 
							WHEN jsonb_typeof(outputs.output_item->'content') = 'array' 
							THEN outputs.output_item->'content'
							ELSE '[]'::jsonb
						END
					) AS content_item
					WHERE content_item->>'type' = 'output_text'
				) AS contents
				CROSS JOIN LATERAL (
					SELECT annotation
					FROM jsonb_array_elements(
						CASE 
							WHEN jsonb_typeof(contents.content_item->'annotations') = 'array' 
							THEN contents.content_item->'annotations'
							ELSE '[]'::jsonb
						END
					) AS annotation
					WHERE annotation->>'type' = 'url_citation'
					AND annotation->>'url' IS NOT NULL
				) AS annotations
				WHERE model_group = 'openai'
			),
			google_citations AS (
				SELECT 
					ref->>'url' as url,
					prf.run_date
				FROM prompt_runs_filtered prf
				CROSS JOIN LATERAL (
					SELECT item
					FROM jsonb_array_elements(
						CASE 
							WHEN jsonb_typeof(raw_output->'tasks'->0->'result'->0->'items') = 'array'
							THEN raw_output->'tasks'->0->'result'->0->'items'
							ELSE '[]'::jsonb
						END
					) AS item
					WHERE item->>'type' = 'ai_overview'
				) AS items
				CROSS JOIN LATERAL (
					SELECT ref
					FROM jsonb_array_elements(
						CASE 
							WHEN jsonb_typeof(items.item->'references') = 'array' 
							THEN items.item->'references'
							ELSE '[]'::jsonb
						END
					) AS ref
					WHERE ref->>'url' IS NOT NULL
				) AS refs
				WHERE model_group = 'google'
			),
			all_citations AS (
				SELECT url, run_date FROM openai_citations
				UNION ALL
				SELECT url, run_date FROM google_citations
			),
			-- Extract domain from URL and aggregate counts per domain per day
			domain_citations AS (
				SELECT 
					run_date,
					LOWER(REGEXP_REPLACE(REGEXP_REPLACE(SPLIT_PART(REGEXP_REPLACE(url, '^https?://', ''), '/', 1), '^www\.', ''), ':.*$', '')) as domain,
					COUNT(*) as citation_count
				FROM all_citations
				WHERE url IS NOT NULL AND url != ''
				GROUP BY run_date, 2
			)
			SELECT 
				run_date::text,
				domain,
				citation_count::int
			FROM domain_citations
			WHERE domain IS NOT NULL AND domain != ''
			ORDER BY run_date
		`;

		const citationsResult = await db.execute(citationsQuery);

		// Categorize domains and group by date in JS (simpler logic for domain matching)
		const citationsByDate: Record<string, { brand: number; competitor: number; socialMedia: number; other: number }> = {};
		
		for (const row of citationsResult.rows) {
			const r = row as { run_date: string; domain: string; citation_count: number };
			const domain = r.domain;
			
			if (!citationsByDate[r.run_date]) {
				citationsByDate[r.run_date] = { brand: 0, competitor: 0, socialMedia: 0, other: 0 };
			}
			
			if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) {
				citationsByDate[r.run_date].brand += r.citation_count;
			} else if (competitorDomains.has(domain)) {
				citationsByDate[r.run_date].competitor += r.citation_count;
			} else if (isSocialMediaDomain(domain)) {
				citationsByDate[r.run_date].socialMedia += r.citation_count;
			} else {
				citationsByDate[r.run_date].other += r.citation_count;
			}
		}

		// Calculate visibility time series with 7-day rolling average using pre-aggregated data
		const ROLLING_WINDOW_DAYS = 7;
		
		const visibilityTimeSeries: VisibilityTimeSeriesPoint[] = dateRange.map((date, dateIndex) => {
			// Aggregate counts over rolling window
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

			const totalRuns = windowBrandedTotal + windowNonBrandedTotal;
			const totalMentioned = windowBrandedMentioned + windowNonBrandedMentioned;

			if (totalRuns === 0) {
				return { date, overall: null, nonBranded: null, branded: null };
			}

			const overall = Math.round((totalMentioned / totalRuns) * 100);
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

			// Calculate daily average for rolling window
			const divisor = daysCounted || 1;
			return {
				date,
				brand: Math.round(brandTotal / divisor),
				competitor: Math.round(competitorTotal / divisor),
				socialMedia: Math.round(socialMediaTotal / divisor),
				other: Math.round(otherTotal / divisor),
			};
		});

		// lastRunAt was already captured from the aggregated visibility query

		const response: DashboardSummaryResponse = {
			totalPrompts: Number(totalPrompts),
			totalRuns: Number(totalRuns),
			averageVisibility,
			nonBrandedVisibility,
			brandedVisibility,
			visibilityTimeSeries,
			citationTimeSeries,
			lastUpdatedAt: lastRunAt,
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching dashboard summary:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
