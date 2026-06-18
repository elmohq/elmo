/**
 * Server function for the Domain Rating (DR) ↔ citation correlation section.
 *
 * Mirrors the citations page's filters, re-derives the same set of cited domains
 * (via getCitationDomainStats + the shared prompt-filter helper), serves cached
 * DRs immediately, and warms a bounded batch of misses per call. The client
 * polls while `pending > 0` so the cache fills in without blocking on hundreds
 * of one-domain-per-request Ahrefs calls.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { computeDrCorrelation } from "@workspace/lib/dr-correlation";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { hasTagFilter, resolveEnabledPromptIds } from "@/lib/citation-filters";
import { getCitationDomainStats } from "@/lib/postgres-read";
import { loadDomainRatings, warmDomainRatings } from "@/lib/domain-rating-cache";
import { type CitationCategory, extractDomain } from "@/lib/domain-categories";
import { categorizeDomain as categorizeDomainShared } from "@/lib/domain-categories.server";

export const getDomainRatingsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(7),
			tags: z.string().optional(),
			model: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const toDate = new Date();
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);
		const fromDateStr = fromDate.toISOString().split("T")[0];
		const toDateStr = toDate.toISOString().split("T")[0];
		const timezone = "UTC";

		const [brandResult, competitorsList, allPrompts] = await Promise.all([
			db.select().from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
			db
				.select({ id: prompts.id, tags: prompts.tags, systemTags: prompts.systemTags })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);

		const primaryBrandDomain = extractDomain(brandResult[0]?.website || "");
		const additionalBrandDomains = (brandResult[0]?.additionalDomains || []).map(extractDomain);
		const brandDomains = new Set([primaryBrandDomain, ...additionalBrandDomains].filter(Boolean));
		const competitorDomains = new Set(competitorsList.flatMap((c) => c.domains.map(extractDomain)).filter(Boolean));
		const categorizeDomain = (domain: string): CitationCategory =>
			categorizeDomainShared(domain, brandDomains, competitorDomains);

		const enabledPromptIds = resolveEnabledPromptIds(allPrompts, data.tags);
		const emptyResult = {
			total: 0,
			resolved: 0,
			pending: 0,
			brandRating: null as number | null,
			correlation: computeDrCorrelation<CitationCategory>([]),
		};
		if (hasTagFilter(data.tags) && enabledPromptIds.length === 0) return emptyResult;

		const domainStats = await getCitationDomainStats(
			data.brandId,
			fromDateStr,
			toDateStr,
			timezone,
			enabledPromptIds,
			data.model,
		);

		// Canonical universe: counts aggregated by normalized domain (matches how
		// the cache keys ratings, so lookups never miss on www/protocol variants).
		const countByDomain = new Map<string, { count: number; category: CitationCategory }>();
		for (const { domain, count } of domainStats) {
			const norm = extractDomain(domain);
			if (!norm) continue;
			const existing = countByDomain.get(norm);
			if (existing) existing.count += Number(count);
			else countByDomain.set(norm, { count: Number(count), category: categorizeDomain(norm) });
		}
		const allDomains = [...countByDomain.keys()];
		if (allDomains.length === 0) return emptyResult;

		let { ratings, missing } = await loadDomainRatings(allDomains);
		if (missing.length > 0) {
			await warmDomainRatings(missing);
			({ ratings, missing } = await loadDomainRatings(allDomains));
		}

		const correlation = computeDrCorrelation<CitationCategory>(
			allDomains.map((domain) => {
				const entry = countByDomain.get(domain) as { count: number; category: CitationCategory };
				return { domain, count: entry.count, category: entry.category, rating: ratings.get(domain) ?? null };
			}),
		);

		return {
			total: allDomains.length,
			resolved: allDomains.length - missing.length,
			pending: missing.length,
			brandRating: ratings.get(primaryBrandDomain) ?? null,
			correlation,
		};
	});

export type DomainRatingsResult = Awaited<ReturnType<typeof getDomainRatingsFn>>;
