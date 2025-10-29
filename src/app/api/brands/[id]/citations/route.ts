import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, promptRuns, competitors, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { extractCitations, type Citation } from "@/lib/text-extraction";

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

		// Get all prompt runs with their prompts for the brand within the date range
		const runs = await db
			.select({
				id: promptRuns.id,
				promptId: promptRuns.promptId,
				promptValue: prompts.value,
				modelGroup: promptRuns.modelGroup,
				rawOutput: promptRuns.rawOutput,
				createdAt: promptRuns.createdAt,
			})
			.from(promptRuns)
			.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
			.where(
				and(
					eq(prompts.brandId, brandId),
					eq(prompts.enabled, true),
					gte(promptRuns.createdAt, fromDate),
					// Only include runs with web search enabled (citations only come from web searches)
					eq(promptRuns.webSearchEnabled, true)
				)
			)
			.orderBy(promptRuns.createdAt);

		// Extract citations from all runs
		const allCitations: (Citation & { promptId: string; promptValue: string })[] = [];
		const domainCounts = new Map<string, { count: number; exampleTitle?: string }>();
		const urlCounts = new Map<string, { count: number; title?: string; domain: string }>();

		for (const run of runs) {
			const citations = extractCitations(run.rawOutput, run.modelGroup);
			
			for (const citation of citations) {
				allCitations.push({
					...citation,
					promptId: run.promptId,
					promptValue: run.promptValue,
				});

				// Count by domain
				const domainCount = domainCounts.get(citation.domain) || { count: 0 };
				domainCount.count++;
				if (!domainCount.exampleTitle && citation.title) {
					domainCount.exampleTitle = citation.title;
				}
				domainCounts.set(citation.domain, domainCount);

			// Count by URL (normalize to remove query parameters like ?utm_source=openai)
			const normalizedUrl = normalizeUrl(citation.url);
			const urlCount = urlCounts.get(normalizedUrl) || { count: 0, title: citation.title, domain: citation.domain };
			urlCount.count++;
			// Keep the title from the first occurrence if not already set
			if (!urlCount.title && citation.title) {
				urlCount.title = citation.title;
			}
			urlCounts.set(normalizedUrl, urlCount);
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
			totalCitations: allCitations.length,
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

