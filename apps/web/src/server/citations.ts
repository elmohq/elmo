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
import { getCitationDomainStats, getCitationUrlStats, getPerPromptDailyCitationStats } from "@/lib/postgres-read";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { generateDateRange, applyPerPromptCitationLVCF } from "@/lib/chart-utils";
import { type CitationCategory, extractDomain, normalizeUrl, categorizeDomain as categorizeDomainShared, toRoundedPercentages } from "@/lib/domain-categories";

/**
 * Get citation statistics for a brand
 */
export const getCitationsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(7),
			tags: z.string().optional(),
			engine: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		// Calculate date ranges
		const toDate = new Date();
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);
		const fromDateStr = fromDate.toISOString().split("T")[0];
		const toDateStr = toDate.toISOString().split("T")[0];
		const timezone = "UTC";

		// Previous period of equal length for comparisons
		// Current period: [fromDate, toDate] inclusive = (data.days + 1) calendar days
		// Previous period ends the day before fromDate, same span
		const prevEndDate = new Date(fromDate);
		prevEndDate.setDate(prevEndDate.getDate() - 1);
		const prevStartDate = new Date(prevEndDate);
		prevStartDate.setDate(prevStartDate.getDate() - data.days);
		const prevFromDateStr = prevStartDate.toISOString().split("T")[0];
		const prevToDateFmt = prevEndDate.toISOString().split("T")[0];

		// Get brand info, competitors, and all enabled prompts
		const [brandResult, competitorsList, allPrompts] = await Promise.all([
			db.select().from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
			db
				.select({ id: prompts.id, value: prompts.value, tags: prompts.tags, systemTags: prompts.systemTags })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);

		const primaryBrandDomain = extractDomain(brandResult[0]?.website || "");
		const additionalBrandDomains = (brandResult[0]?.additionalDomains || []).map(extractDomain);
		const brandDomains = new Set([primaryBrandDomain, ...additionalBrandDomains].filter(Boolean));
		const competitorDomains = new Set(competitorsList.flatMap((c) => c.domains.map(extractDomain)).filter(Boolean));

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
					googleCitations: 0,
					institutionalCitations: 0,
					otherCitations: 0,
					domainDistribution: [] as { domain: string; count: number; category: CitationCategory; exampleTitle?: string; previousCount: number; changePercent: number | null }[],
					specificUrls: [] as { url: string; title?: string; domain: string; count: number; category: CitationCategory; avgPosition: number | null; promptCount: number; isNew: boolean }[],
					availableTags,
					citationTimeSeries: [] as { date: string; brand: number; competitor: number; socialMedia: number; google: number; institutional: number; other: number }[],
					previousBrandShare: null as number | null,
				competitorOnlyPrompts: [] as { id: string; value: string; competitorCitationCount: number; uniqueCompetitors: number }[],
				whatsChanged: {
					newUrls: [] as { url: string; domain: string; count: number; promptCount: number; category: CitationCategory }[],
					droppedUrls: [] as { url: string; domain: string; previousCount: number; currentCount: number; category: CitationCategory }[],
					titleChanges: [] as { url: string; domain: string; currentTitle: string; previousTitle: string; category: CitationCategory }[],
					newDomains: [] as { domain: string; count: number; category: CitationCategory }[],
					droppedDomains: [] as { domain: string; previousCount: number; category: CitationCategory }[],
				},
				};
			}
		}

		const [domainStats, urlStats, perPromptCitations, prevDomainStats, prevUrlStats] = await Promise.all([
			getCitationDomainStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.engine),
			getCitationUrlStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.engine),
			getPerPromptDailyCitationStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.engine),
			getCitationDomainStats(data.brandId, prevFromDateStr, prevToDateFmt, timezone, enabledPromptIds, data.engine),
			getCitationUrlStats(data.brandId, prevFromDateStr, prevToDateFmt, timezone, enabledPromptIds, data.engine),
		]);

		function categorizeDomain(domain: string): CitationCategory {
			return categorizeDomainShared(domain, brandDomains, competitorDomains);
		}

		// Build previous period domain map for trend comparison
		const prevDomainMap = new Map<string, number>();
		for (const { domain, count } of prevDomainStats) {
			prevDomainMap.set(domain, Number(count));
		}

		const domainDistribution = domainStats.map(({ domain, count, example_title }) => {
			const currentCount = Number(count);
			const previousCount = prevDomainMap.get(domain) || 0;
			const changePercent = previousCount > 0
				? Math.round(((currentCount - previousCount) / previousCount) * 100)
				: null;
			return {
				domain,
				count: currentCount,
				category: categorizeDomain(domain),
				exampleTitle: example_title || undefined,
				previousCount,
				changePercent,
			};
		});

		// Build previous period URL map for comparison
		const prevUrlMap = new Map<string, { count: number; title?: string; domain: string }>();
		for (const { url, domain, title, count } of prevUrlStats) {
			const normalizedUrl = normalizeUrl(url);
			const existing = prevUrlMap.get(normalizedUrl);
			if (existing) {
				existing.count += Number(count);
				if (!existing.title && title) existing.title = title;
			} else {
				prevUrlMap.set(normalizedUrl, { count: Number(count), title: title || undefined, domain });
			}
		}

		// Categorize and normalize specific URLs with new fields
		const urlCounts = new Map<string, { count: number; title?: string; domain: string; avgPosition: number | null; promptCount: number }>();
		for (const { url, domain, title, count, avg_position, prompt_count } of urlStats) {
			const normalizedUrl = normalizeUrl(url);
			const existing = urlCounts.get(normalizedUrl);
			if (existing) {
				existing.count += Number(count);
				if (!existing.title && title) existing.title = title;
			} else {
				urlCounts.set(normalizedUrl, {
					count: Number(count),
					title: title || undefined,
					domain,
					avgPosition: avg_position != null ? Number(avg_position) : null,
					promptCount: Number(prompt_count),
				});
			}
		}

		const specificUrls = Array.from(urlCounts.entries())
			.map(([url, { count, title, domain, avgPosition, promptCount }]) => ({
				url,
				title,
				domain,
				count,
				category: categorizeDomain(domain),
				avgPosition,
				promptCount,
				isNew: !prevUrlMap.has(url),
			}))
			.sort((a, b) => b.count - a.count);

		// Calculate category totals
		const brandCitations = domainDistribution.filter((d) => d.category === "brand").reduce((s, d) => s + d.count, 0);
		const competitorCitations = domainDistribution.filter((d) => d.category === "competitor").reduce((s, d) => s + d.count, 0);
		const socialMediaCitations = domainDistribution.filter((d) => d.category === "social_media").reduce((s, d) => s + d.count, 0);
		const googleCitations = domainDistribution.filter((d) => d.category === "google").reduce((s, d) => s + d.count, 0);
		const institutionalCitations = domainDistribution.filter((d) => d.category === "institutional").reduce((s, d) => s + d.count, 0);
		const otherCitations = domainDistribution.filter((d) => d.category === "other").reduce((s, d) => s + d.count, 0);
		const totalCitations = brandCitations + competitorCitations + socialMediaCitations + googleCitations + institutionalCitations + otherCitations;

		// Previous period brand share for delta
		const prevBrandCitations = prevDomainStats
			.filter((d) => categorizeDomain(d.domain) === "brand")
			.reduce((s, d) => s + Number(d.count), 0);
		const prevTotalCitations = prevDomainStats.reduce((s, d) => s + Number(d.count), 0);
		const previousBrandShare = prevTotalCitations > 0
			? Math.round((prevBrandCitations / prevTotalCitations) * 100)
			: null;

		// Citation time series via per-prompt LVCF with cadence normalization
		const dateRangeStart = new Date(toDateStr);
		dateRangeStart.setDate(dateRangeStart.getDate() - (data.days - 1));
		const dateRange = generateDateRange(dateRangeStart, new Date(toDateStr));
		const smoothedCitations = applyPerPromptCitationLVCF(
			perPromptCitations, dateRange, brandResult[0]?.delayOverrideHours, categorizeDomain,
		);
		const citationTimeSeries = dateRange.map((date) => {
			const c = smoothedCitations.get(date);
			if (!c) return { date, brand: 0, competitor: 0, socialMedia: 0, google: 0, institutional: 0, other: 0 };
			const pct = toRoundedPercentages({
				brand: c.brand, competitor: c.competitor, socialMedia: c.socialMedia,
				google: c.google, institutional: c.institutional, other: c.other,
			});
			return {
				date,
				brand: pct.brand ?? 0,
				competitor: pct.competitor ?? 0,
				socialMedia: pct.socialMedia ?? 0,
				google: pct.google ?? 0,
				institutional: pct.institutional ?? 0,
				other: pct.other ?? 0,
			};
		});

		// What's Changed: new URLs, dropped URLs, title changes
		const MIN_COUNT_FOR_WHATS_CHANGED = 2;

		const newUrls = specificUrls
			.filter((u) => u.isNew && u.count >= MIN_COUNT_FOR_WHATS_CHANGED)
			.slice(0, 10)
			.map((u) => ({ url: u.url, domain: u.domain, count: u.count, promptCount: u.promptCount, category: u.category }));

		const droppedUrls: { url: string; domain: string; previousCount: number; currentCount: number; category: CitationCategory }[] = [];
		for (const [url, prevData] of prevUrlMap.entries()) {
			if (prevData.count < MIN_COUNT_FOR_WHATS_CHANGED) continue;
			const current = urlCounts.get(url);
			const currentCount = current?.count || 0;
			const dropPercent = ((prevData.count - currentCount) / prevData.count) * 100;
			if (dropPercent >= 50) {
				droppedUrls.push({
					url,
					domain: prevData.domain,
					previousCount: prevData.count,
					currentCount,
					category: categorizeDomain(prevData.domain),
				});
			}
		}
		droppedUrls.sort((a, b) => b.previousCount - a.previousCount);

		const titleChanges: { url: string; domain: string; currentTitle: string; previousTitle: string; category: CitationCategory }[] = [];
		for (const [url, currentData] of urlCounts.entries()) {
			const prevData = prevUrlMap.get(url);
			if (!prevData) continue;
			if (currentData.title && prevData.title && currentData.title !== prevData.title) {
				titleChanges.push({
					url,
					domain: currentData.domain,
					currentTitle: currentData.title,
					previousTitle: prevData.title,
					category: categorizeDomain(currentData.domain),
				});
			}
		}

		// Domain-level changes
		const currentDomainSet = new Set(domainDistribution.map((d) => d.domain));
		const newDomains = domainDistribution
			.filter((d) => d.previousCount === 0 && d.count >= MIN_COUNT_FOR_WHATS_CHANGED)
			.sort((a, b) => b.count - a.count)
			.slice(0, 10)
			.map((d) => ({ domain: d.domain, count: d.count, category: d.category }));

		const droppedDomains: { domain: string; previousCount: number; category: CitationCategory }[] = [];
		for (const [domain, prevCount] of prevDomainMap.entries()) {
			if (prevCount < MIN_COUNT_FOR_WHATS_CHANGED) continue;
			if (!currentDomainSet.has(domain)) {
				droppedDomains.push({ domain, previousCount: prevCount, category: categorizeDomain(domain) });
			}
		}
		droppedDomains.sort((a, b) => b.previousCount - a.previousCount);

		// Prompts with competitor citations but no brand citations (computed from already-fetched data)
		const competitorDomainEntries = competitorsList.flatMap((c) =>
			c.domains.map((d) => ({ domain: extractDomain(d), competitorId: c.id })),
		).filter((e) => e.domain);

		function resolveCompetitorId(citationDomain: string): string | undefined {
			const normalized = extractDomain(citationDomain);
			for (const entry of competitorDomainEntries) {
				if (normalized === entry.domain || normalized.endsWith(`.${entry.domain}`)) {
					return entry.competitorId;
				}
			}
			return undefined;
		}

		const promptCitationFlags = new Map<string, { hasBrand: boolean; hasCompetitor: boolean; competitorCount: number; competitorIds: Set<string> }>();
		for (const row of perPromptCitations) {
			const cat = categorizeDomain(row.domain);
			let entry = promptCitationFlags.get(row.prompt_id);
			if (!entry) {
				entry = { hasBrand: false, hasCompetitor: false, competitorCount: 0, competitorIds: new Set() };
				promptCitationFlags.set(row.prompt_id, entry);
			}
			if (cat === "brand") entry.hasBrand = true;
			if (cat === "competitor") {
				entry.hasCompetitor = true;
				entry.competitorCount += Number(row.count);
				const compId = resolveCompetitorId(row.domain);
				if (compId) entry.competitorIds.add(compId);
			}
		}

		const promptLookup = new Map(allPrompts.map((p) => [p.id, p]));
		const competitorOnlyPrompts = Array.from(promptCitationFlags.entries())
			.filter(([, data]) => data.hasCompetitor && !data.hasBrand)
			.map(([id, data]) => {
				const prompt = promptLookup.get(id);
				if (!prompt) return null;
				return { id, value: prompt.value, competitorCitationCount: data.competitorCount, uniqueCompetitors: data.competitorIds.size };
			})
			.filter((p): p is NonNullable<typeof p> => p !== null)
			.sort((a, b) => b.competitorCitationCount - a.competitorCitationCount);

		const competitorSummary = competitorsList.map((c) => ({
			id: c.id,
			name: c.name,
			domains: c.domains,
		}));

		return {
			totalCitations,
			uniqueDomains: domainDistribution.length,
			brandCitations,
			competitorCitations,
			socialMediaCitations,
			googleCitations,
			institutionalCitations,
			otherCitations,
			domainDistribution,
			specificUrls,
			availableTags,
			citationTimeSeries,
			previousBrandShare,
			competitors: competitorSummary,
			competitorOnlyPrompts,
			whatsChanged: {
				newUrls,
				droppedUrls: droppedUrls.slice(0, 10),
				titleChanges: titleChanges.slice(0, 10),
				newDomains,
				droppedDomains: droppedDomains.slice(0, 10),
			},
		};
	});
