import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, sql } from "drizzle-orm";

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

		// Calculate date range
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - days);

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

	const response: CitationStats = {
		totalCitations: totalCitationCount,
		uniqueDomains: domainCounts.size,
		brandCitations,
		competitorCitations,
		socialMediaCitations,
		otherCitations,
		domainDistribution,
		specificUrls,
	};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching citation stats:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

