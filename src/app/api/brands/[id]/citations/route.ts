import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, competitors, brands, SYSTEM_TAGS } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and } from "drizzle-orm";
import { getCitationDomainStats, getCitationUrlStats } from "@/lib/tinybird-read-v2";

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
		const toDate = new Date();
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - days);
		
		// Format dates for Tinybird
		const fromDateStr = fromDate.toISOString().split("T")[0];
		const toDateStr = toDate.toISOString().split("T")[0];
		
		// Use UTC for date filtering to match PostgreSQL behavior
		const timezone = "UTC";

		// Get brand info and competitors (needed for categorization)
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
		let enabledPromptIds: string[] = allPrompts.map(p => p.id);
		if (filterTags.length > 0) {
			// Check if any filter tag matches either system tags or user tags
			const matchingPrompts = allPrompts.filter(p => {
				const allPromptTags = [...(p.systemTags || []), ...(p.tags || [])].map(t => t.toLowerCase());
				return filterTags.some(filterTag => allPromptTags.includes(filterTag));
			});

			enabledPromptIds = matchingPrompts.map(p => p.id);
			
			// If no prompts match the filter, return empty results
			if (enabledPromptIds.length === 0) {
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

		// Query Tinybird for citation stats
		const [domainStats, urlStats] = await Promise.all([
			getCitationDomainStats(
				brandId,
				fromDateStr,
				toDateStr,
				timezone,
				enabledPromptIds,
				modelGroupParam || undefined,
			),
			getCitationUrlStats(
				brandId,
				fromDateStr,
				toDateStr,
				timezone,
				enabledPromptIds,
				modelGroupParam || undefined,
			),
		]);

		// Categorize domains
		const domainDistribution = domainStats.map(({ domain, count, example_title }) => {
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
				count: Number(count),
				category,
				exampleTitle: example_title || undefined,
			};
		});

		// Categorize specific URLs (normalize to remove utm_source=openai)
		const urlCounts = new Map<string, { count: number; title?: string; domain: string }>();
		
		for (const { url, domain, title, count } of urlStats) {
			const normalizedUrl = normalizeUrl(url);
			const existing = urlCounts.get(normalizedUrl);
			if (existing) {
				existing.count += Number(count);
				// Keep the title from the first occurrence if not already set
				if (!existing.title && title) {
					existing.title = title;
				}
			} else {
				urlCounts.set(normalizedUrl, {
					count: Number(count),
					title: title || undefined,
					domain,
				});
			}
		}

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
		const totalCitations = brandCitations + competitorCitations + socialMediaCitations + otherCitations;

		const response: CitationStats = {
			totalCitations,
			uniqueDomains: domainDistribution.length,
			brandCitations,
			competitorCitations,
			socialMediaCitations,
			otherCitations,
			domainDistribution,
			specificUrls,
			availableTags,
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching citation stats:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
