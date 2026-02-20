/**
 * Server functions for citation data.
 * Replaces apps/web/src/app/api/brands/[id]/citations/route.ts
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getCitationDomainStats, getCitationUrlStats } from "@/lib/tinybird-read-v2";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";

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

function normalizeUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		if (urlObj.searchParams.get("utm_source") === "openai") {
			urlObj.searchParams.delete("utm_source");
		}
		urlObj.search = urlObj.searchParams.toString();
		return urlObj.toString();
	} catch {
		return url;
	}
}

type CitationCategory = "brand" | "competitor" | "social_media" | "other";

/**
 * Get citation statistics for a brand
 */
export const getCitationsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(7),
			tags: z.string().optional(),
			modelGroup: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		// Calculate date range
		const toDate = new Date();
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);
		const fromDateStr = fromDate.toISOString().split("T")[0];
		const toDateStr = toDate.toISOString().split("T")[0];
		const timezone = "UTC";

		// Get brand info, competitors, and all enabled prompts
		const [brandResult, competitorsList, allPrompts] = await Promise.all([
			db.select().from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
			db
				.select({ id: prompts.id, value: prompts.value, tags: prompts.tags, systemTags: prompts.systemTags })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);

		const brandDomain = extractDomain(brandResult[0]?.website || "");
		const competitorDomains = new Set(competitorsList.map((c) => extractDomain(c.domain)));

		// Collect available tags
		const allUserTags = new Set<string>();
		for (const p of allPrompts) {
			for (const tag of p.tags || []) allUserTags.add(tag);
		}
		const userTagsWithoutSystemTags = Array.from(allUserTags)
			.filter((tag) => tag.toLowerCase() !== SYSTEM_TAGS.BRANDED && tag.toLowerCase() !== SYSTEM_TAGS.UNBRANDED)
			.sort();
		const availableTags = [SYSTEM_TAGS.BRANDED, SYSTEM_TAGS.UNBRANDED, ...userTagsWithoutSystemTags];

		// Filter prompt IDs by tags if specified
		let enabledPromptIds = allPrompts.map((p) => p.id);
		const tagFilter = data.tags?.split(",").filter(Boolean) || [];
		if (tagFilter.length > 0) {
			const filterByBranded = tagFilter.includes(SYSTEM_TAGS.BRANDED);
			const filterByUnbranded = tagFilter.includes(SYSTEM_TAGS.UNBRANDED);
			const nonSystemFilterTags = tagFilter.filter(
				(t) => t !== SYSTEM_TAGS.BRANDED && t !== SYSTEM_TAGS.UNBRANDED,
			);

			const matchingPrompts = allPrompts.filter((p) => {
				const systemTags = p.systemTags || [];
				const userTags = p.tags || [];

				if (filterByBranded || filterByUnbranded) {
					const effectiveStatus = getEffectiveBrandedStatus(systemTags, userTags);
					if (filterByBranded && effectiveStatus.isBranded) return true;
					if (filterByUnbranded && !effectiveStatus.isBranded) return true;
				}

				if (nonSystemFilterTags.length > 0) {
					const allTagsLower = [...systemTags, ...userTags].map((t) => t.toLowerCase());
					if (nonSystemFilterTags.some((ft) => allTagsLower.includes(ft))) return true;
				}

				if ((filterByBranded || filterByUnbranded) && nonSystemFilterTags.length === 0) return false;
				return false;
			});

			enabledPromptIds = matchingPrompts.map((p) => p.id);

			if (enabledPromptIds.length === 0) {
				return {
					totalCitations: 0,
					uniqueDomains: 0,
					brandCitations: 0,
					competitorCitations: 0,
					socialMediaCitations: 0,
					otherCitations: 0,
					domainDistribution: [],
					specificUrls: [],
					availableTags,
				};
			}
		}

		// Query Tinybird for citation stats
		const [domainStats, urlStats] = await Promise.all([
			getCitationDomainStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.modelGroup),
			getCitationUrlStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.modelGroup),
		]);

		// Categorize domains
		function categorizeDomain(domain: string): CitationCategory {
			if (domain === brandDomain || domain.endsWith(`.${brandDomain}`)) return "brand";
			if (competitorDomains.has(domain)) return "competitor";
			if (isSocialMediaDomain(domain)) return "social_media";
			return "other";
		}

		const domainDistribution = domainStats.map(({ domain, count, example_title }) => ({
			domain,
			count: Number(count),
			category: categorizeDomain(domain),
			exampleTitle: example_title || undefined,
		}));

		// Categorize and normalize specific URLs
		const urlCounts = new Map<string, { count: number; title?: string; domain: string }>();
		for (const { url, domain, title, count } of urlStats) {
			const normalizedUrl = normalizeUrl(url);
			const existing = urlCounts.get(normalizedUrl);
			if (existing) {
				existing.count += Number(count);
				if (!existing.title && title) existing.title = title;
			} else {
				urlCounts.set(normalizedUrl, { count: Number(count), title: title || undefined, domain });
			}
		}

		const specificUrls = Array.from(urlCounts.entries())
			.map(([url, { count, title, domain }]) => ({
				url,
				title,
				domain,
				count,
				category: categorizeDomain(domain),
			}))
			.sort((a, b) => b.count - a.count);

		// Calculate category totals
		const brandCitations = domainDistribution.filter((d) => d.category === "brand").reduce((s, d) => s + d.count, 0);
		const competitorCitations = domainDistribution.filter((d) => d.category === "competitor").reduce((s, d) => s + d.count, 0);
		const socialMediaCitations = domainDistribution.filter((d) => d.category === "social_media").reduce((s, d) => s + d.count, 0);
		const otherCitations = domainDistribution.filter((d) => d.category === "other").reduce((s, d) => s + d.count, 0);
		const totalCitations = brandCitations + competitorCitations + socialMediaCitations + otherCitations;

		return {
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
	});
