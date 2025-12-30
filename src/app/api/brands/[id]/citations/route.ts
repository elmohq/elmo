import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, competitors, brands, SYSTEM_TAGS } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { isTinybirdVerifyEnabled, verifyAndLog, type DiagnosticInfo } from "@/lib/tinybird-comparison";
import { getTinybirdCitationDomainStats, getTinybirdCitationUrlStats, getTinybirdCitationDiagnostics, isTinybirdReadEnabled } from "@/lib/tinybird-read";

type Params = {
	id: string;
};

// Helper function to extract domain from URL or website string
function extractDomain(urlOrDomain: string): string {
	try {
		// Remove protocol if present
		const cleaned = urlOrDomain.replace(/^https?:\/\//, '');
		// Remove www prefix
		const withoutWww = cleaned.replace(/^www\./, '');
		// Take first part (domain) before any path
		const domain = withoutWww.split('/')[0];
		return domain.toLowerCase();
	} catch (e) {
		return urlOrDomain.toLowerCase();
	}
}

// List of common social media domains
const SOCIAL_MEDIA_DOMAINS = [
	'facebook.com',
	'twitter.com',
	'x.com',
	'instagram.com',
	'linkedin.com',
	'youtube.com',
	'tiktok.com',
	'pinterest.com',
	'reddit.com',
	'snapchat.com',
	'tumblr.com',
	'whatsapp.com',
	'telegram.org',
	'discord.com',
	'twitch.tv',
];

function isSocialMediaDomain(domain: string): boolean {
	return SOCIAL_MEDIA_DOMAINS.some(sm => domain === sm || domain.endsWith(`.${sm}`));
}

// Helper function to remove utm_source=openai from URLs while preserving other params
function normalizeUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		const params = urlObj.searchParams;
		
		// Only remove utm_source if it equals 'openai'
		if (params.get('utm_source') === 'openai') {
			params.delete('utm_source');
		}
		
		// Reconstruct URL with updated params
		urlObj.search = params.toString();
		return urlObj.toString();
	} catch (e) {
		// If URL parsing fails, return as-is
		return url;
	}
}

export interface CitationStats {
	totalCitations: number;
	uniqueDomains: number;
	brandCitations: number;
	competitorCitations: number;
	socialMediaCitations: number;
	otherCitations: number;
	domainDistribution: {
		domain: string;
		count: number;
		category: 'brand' | 'competitor' | 'social_media' | 'other';
		exampleTitle?: string;
	}[];
	specificUrls: {
		url: string;
		title?: string;
		domain: string;
		count: number;
		category: 'brand' | 'competitor' | 'social_media' | 'other';
	}[];
	availableTags?: string[];
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

		// Parse days parameter (default to 7 days)
		const daysParam = searchParams.get("days");
		const days = daysParam ? Number.parseInt(daysParam, 10) : 7;
		
		// Parse tag filter parameter (comma-separated tag names)
		const tagsParam = searchParams.get("tags");
		const filterTags = tagsParam ? tagsParam.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [];

		// Parse model group filter parameter
		const modelGroupParam = searchParams.get("modelGroup");

		// Calculate date range
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - days);

		// Start timing PostgreSQL queries
		const startPg = performance.now();

		// Get brand info and competitors
		const [brandInfo, competitorsList] = await Promise.all([
			db.select().from(brands).where(eq(brands.id, brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, brandId)),
		]);

		if (!brandInfo || brandInfo.length === 0) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}

		const brand = brandInfo[0];
		const brandDomain = extractDomain(brand.website);
		const competitorDomains = new Set(competitorsList.map(c => extractDomain(c.domain)));

		// Get all enabled prompts to collect available tags and for filtering
		const allPrompts = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				tags: prompts.tags,
				systemTags: prompts.systemTags,
			})
			.from(prompts)
			.where(and(eq(prompts.brandId, brandId), eq(prompts.enabled, true)));

		// Collect all unique user tags
		const allUserTags = new Set<string>();
		allPrompts.forEach(p => {
			(p.tags || []).forEach(tag => allUserTags.add(tag));
		});

		// Build available tags list (system tags + user tags)
		const availableTags = [
			SYSTEM_TAGS.BRANDED,
			SYSTEM_TAGS.UNBRANDED,
			...Array.from(allUserTags).sort(),
		];

		// Filter prompts by tag if specified
		let promptIdsToFilter: string[] | null = null;
		if (filterTags.length > 0) {
			// Check if any filter tag matches either system tags or user tags
			const matchingPrompts = allPrompts.filter(p => {
				const allPromptTags = [...(p.systemTags || []), ...(p.tags || [])].map(t => t.toLowerCase());
				return filterTags.some(filterTag => allPromptTags.includes(filterTag));
			});

			promptIdsToFilter = matchingPrompts.map(p => p.id);
			
			// If no prompts match the filter, return empty results
			if (promptIdsToFilter.length === 0) {
				return NextResponse.json({
					totalCitations: 0,
					uniqueDomains: 0,
					brandCitations: 0,
					competitorCitations: 0,
					socialMediaCitations: 0,
					otherCitations: 0,
					domainDistribution: [],
					specificUrls: [],
					availableTags,
				});
			}
		}

	// Build the prompt filter condition for SQL
	const promptFilterCondition = promptIdsToFilter
		? sql`AND p.id IN (${sql.raw(promptIdsToFilter.map(id => `'${id}'`).join(','))})`
		: sql``;

	// Build the model group filter condition for SQL
	const modelGroupCondition = modelGroupParam
		? sql`AND pr."modelGroup" = ${modelGroupParam}`
		: sql``;

	// Extract citations directly from JSON in the database
	// This avoids fetching the entire rawOutput JSON blob
	const citationsQuery = sql<{
		url: string;
		title: string | null;
		model_group: string;
	}>`
		WITH prompt_runs_filtered AS (
			SELECT 
				pr.id,
				pr."modelGroup" as model_group,
				pr.raw_output::jsonb as raw_output
			FROM prompt_runs pr
			INNER JOIN prompts p ON pr.prompt_id = p.id
			WHERE 
				p.brand_id = ${brandId}
				AND p.enabled = true
				AND pr.created_at >= ${fromDate}
				AND pr.web_search_enabled = true
				${promptFilterCondition}
				${modelGroupCondition}
		),
		openai_citations AS (
			SELECT 
				annotation->>'url' as url,
				annotation->>'title' as title,
				model_group
			FROM prompt_runs_filtered
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
				ref->>'title' as title,
				model_group
			FROM prompt_runs_filtered
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
		)
		SELECT url, title, model_group FROM openai_citations
		UNION ALL
		SELECT url, title, model_group FROM google_citations
	`;

	const citations = await db.execute(citationsQuery);

	// Process citations
	let totalCitationCount = 0;
	const domainCounts = new Map<string, { count: number; exampleTitle?: string }>();
	const urlCounts = new Map<string, { count: number; title?: string; domain: string }>();

	for (const row of citations.rows) {
		// Type assertion for the raw SQL result
		const citation = row as { url: string; title: string | null; model_group: string };
		
		try {
			const url = new URL(citation.url);
			const domain = url.hostname.replace(/^www\./, '');
			totalCitationCount++;

			// Count by domain
			const domainCount = domainCounts.get(domain) || { count: 0 };
			domainCount.count++;
			if (!domainCount.exampleTitle && citation.title) {
				domainCount.exampleTitle = citation.title;
			}
			domainCounts.set(domain, domainCount);

			// Count by URL (normalize to remove query parameters like ?utm_source=openai)
			const normalizedUrl = normalizeUrl(citation.url);
			const urlCount = urlCounts.get(normalizedUrl) || { count: 0, title: citation.title || undefined, domain };
			urlCount.count++;
			// Keep the title from the first occurrence if not already set
			if (!urlCount.title && citation.title) {
				urlCount.title = citation.title;
			}
			urlCounts.set(normalizedUrl, urlCount);
		} catch (e) {
			// Invalid URL, skip
			console.warn("Invalid citation URL:", citation.url);
		}
	}

		// Categorize domains
		const domainDistribution = Array.from(domainCounts.entries())
			.map(([domain, { count, exampleTitle }]) => {
				let category: 'brand' | 'competitor' | 'social_media' | 'other';
				
				if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) {
					category = 'brand';
				} else if (competitorDomains.has(domain)) {
					category = 'competitor';
				} else if (isSocialMediaDomain(domain)) {
					category = 'social_media';
				} else {
					category = 'other';
				}

				return {
					domain,
					count,
					category,
					exampleTitle,
				};
			})
			.sort((a, b) => b.count - a.count);

		// Categorize specific URLs
		const specificUrls = Array.from(urlCounts.entries())
			.map(([url, { count, title, domain }]) => {
				let category: 'brand' | 'competitor' | 'social_media' | 'other';
				
				if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) {
					category = 'brand';
				} else if (competitorDomains.has(domain)) {
					category = 'competitor';
				} else if (isSocialMediaDomain(domain)) {
					category = 'social_media';
				} else {
					category = 'other';
				}

				return {
					url,
					title,
					domain,
					count,
					category,
				};
			})
			.sort((a, b) => b.count - a.count);

		// Calculate category totals
		const brandCitations = domainDistribution.filter(d => d.category === 'brand').reduce((sum, d) => sum + d.count, 0);
		const competitorCitations = domainDistribution.filter(d => d.category === 'competitor').reduce((sum, d) => sum + d.count, 0);
		const socialMediaCitations = domainDistribution.filter(d => d.category === 'social_media').reduce((sum, d) => sum + d.count, 0);
		const otherCitations = domainDistribution.filter(d => d.category === 'other').reduce((sum, d) => sum + d.count, 0);

	// End PostgreSQL timing
	const pgTime = performance.now() - startPg;

	const response: CitationStats = {
		totalCitations: totalCitationCount,
		uniqueDomains: domainCounts.size,
		brandCitations,
		competitorCitations,
		socialMediaCitations,
		otherCitations,
		domainDistribution,
		specificUrls,
		availableTags,
	};

		// Dual-read verification against Tinybird (awaited to ensure completion in serverless)
		if (isTinybirdVerifyEnabled() && isTinybirdReadEnabled()) {
			try {
				const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
				const toDateObj = new Date();
				const toDateStr = toDateObj.toISOString().split("T")[0];
				const fromDateStr = fromDate.toISOString().split("T")[0];

				// Use filtered prompt IDs if tag filter is applied, otherwise use all enabled prompt IDs
				const enabledPromptIds = promptIdsToFilter || allPrompts.map(p => p.id);

				// Time ONLY the main query (not diagnostics) for fair comparison
				const startTb = performance.now();
				const tbDomainStats = await getTinybirdCitationDomainStats(
					brandId,
					fromDateStr,
					toDateStr,
					userTimezone,
					enabledPromptIds,
					modelGroupParam || undefined,
				);
				const tbTime = performance.now() - startTb;

				// Run diagnostics separately (not included in timing)
				const tbDiagnostics = await getTinybirdCitationDiagnostics(
					brandId,
					fromDateStr,
					toDateStr,
					userTimezone,
					enabledPromptIds,
					modelGroupParam || undefined,
				);

				// Compare aggregate metrics
				const tbTotalCitations = tbDomainStats.reduce((sum, d) => sum + Number(d.count), 0);
				const tbUniqueDomains = tbDomainStats.length;

				const pgComparable = {
					totalCitations: totalCitationCount,
					uniqueDomains: domainCounts.size,
				};

				const tbComparable = {
					totalCitations: tbTotalCitations,
					uniqueDomains: tbUniqueDomains,
				};

				// Build per-prompt counts for PG from the citations we already processed
				// We need to re-query for this since we didn't track it during processing
				const pgPerPromptQuery = sql<{ prompt_id: string; count: string; earliest: string; latest: string }>`
					WITH prompt_runs_filtered AS (
						SELECT 
							pr.id,
							p.id as prompt_id,
							pr.created_at,
							pr."modelGroup" as model_group,
							pr.raw_output::jsonb as raw_output
						FROM prompt_runs pr
						INNER JOIN prompts p ON pr.prompt_id = p.id
						WHERE 
							p.brand_id = ${brandId}
							AND p.enabled = true
							AND pr.created_at >= ${fromDate}
							AND pr.web_search_enabled = true
							${promptFilterCondition}
							${modelGroupCondition}
					),
					all_citations AS (
						-- OpenAI citations
						SELECT 
							prompt_id,
							created_at
						FROM prompt_runs_filtered
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
						
						UNION ALL
						
						-- Google citations
						SELECT 
							prompt_id,
							created_at
						FROM prompt_runs_filtered
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
					)
					SELECT 
						prompt_id,
						count(*)::text as count,
						min(created_at)::text as earliest,
						max(created_at)::text as latest
					FROM all_citations
					GROUP BY prompt_id
					ORDER BY count DESC
				`;
				
				const pgDiagnosticsResult = await db.execute(pgPerPromptQuery);
				const pgPerPromptCounts: Record<string, number> = {};
				let pgEarliest: string | null = null;
				let pgLatest: string | null = null;
				
				for (const row of pgDiagnosticsResult.rows) {
					const r = row as { prompt_id: string; count: string; earliest: string; latest: string };
					pgPerPromptCounts[r.prompt_id] = parseInt(r.count, 10);
					if (!pgEarliest || r.earliest < pgEarliest) pgEarliest = r.earliest;
					if (!pgLatest || r.latest > pgLatest) pgLatest = r.latest;
				}
				
				// Build TB per-prompt counts
				const tbPerPromptCounts: Record<string, number> = {};
				for (const item of tbDiagnostics.per_prompt_counts) {
					tbPerPromptCounts[item.prompt_id] = Number(item.count);
				}
				
				// Find differences between PG and TB per-prompt counts
				const allPromptIdsSet = new Set([
					...Object.keys(pgPerPromptCounts),
					...Object.keys(tbPerPromptCounts),
				]);
				const differences: Array<{ promptId: string; pgCount: number; tbCount: number; diff: number }> = [];
				for (const promptId of allPromptIdsSet) {
					const pgCount = pgPerPromptCounts[promptId] || 0;
					const tbCount = tbPerPromptCounts[promptId] || 0;
					if (pgCount !== tbCount) {
						differences.push({
							promptId,
							pgCount,
							tbCount,
							diff: tbCount - pgCount,
						});
					}
				}
				// Sort by absolute difference
				differences.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

				const diagnostics: DiagnosticInfo = {
					dateRange: {
						pg: { earliest: pgEarliest, latest: pgLatest },
						tb: { 
							earliest: tbDiagnostics.earliest_date, 
							latest: tbDiagnostics.latest_date 
						},
					},
					recordCounts: {
						pg: totalCitationCount,
						tb: Number(tbDiagnostics.total_count),
					},
					perPromptCounts: {
						pg: pgPerPromptCounts,
						tb: tbPerPromptCounts,
						differences: differences.slice(0, 20), // Top 20 differences
					},
					extra: {
						enabledPromptIdCount: enabledPromptIds.length,
						pgPromptRunCount: pgDiagnosticsResult.rows.length,
						tbPromptRunCount: tbDiagnostics.prompt_run_count,
					},
				};

				await verifyAndLog({
					endpoint: "citations",
					brandId,
					filters: {
						days,
						tags: tagsParam,
						modelGroup: modelGroupParam,
					},
					postgresResult: pgComparable,
					tinybirdResult: tbComparable,
					pgTime,
					tbTime,
					diagnostics,
				});
			} catch (error) {
				console.error("Tinybird verification failed for citations:", error);
			}
		}

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching citation stats:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
