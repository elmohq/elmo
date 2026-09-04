/**
 * /api/v1/prompts/:promptId/snapshot — aggregated mention + citation stats
 * for a prompt over a date range.
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { extractDomain, inDomainSet, normalizeUrl } from "@workspace/lib/citations/domain-categories";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requirePromptInScope } from "@/lib/api/scope";
import {
	getPromptCitationUrlStats,
	getPromptMentionSummary,
	getPromptTopCompetitorMentions,
} from "@/lib/postgres-read";

function isValidDate(dateStr: string): boolean {
	const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
	if (!dateRegex.test(dateStr)) return false;
	const d = new Date(`${dateStr}T00:00:00Z`);
	return !Number.isNaN(d.getTime());
}

/** Top-K lists are bounded so one request can't ask for the whole history. */
const MAX_TOP_K = 50;
const DEFAULT_TOP_MENTIONS = 5;
const DEFAULT_TOP_CITATIONS = 10;

function boundedTopK(raw: string | null, fallback: number): number {
	const parsed = Number.parseInt(raw || String(fallback), 10);
	return Number.isNaN(parsed) ? fallback : Math.max(1, Math.min(MAX_TOP_K, parsed));
}

function parseSnapshotQuery(url: URL): { startDate: string; endDate: string; kMentions: number; kCitations: number } {
	const { searchParams } = url;
	const startDate = searchParams.get("startDate");
	const endDate = searchParams.get("endDate");

	if (!startDate || !endDate) {
		throw new ApiError(
			400,
			"Validation Error",
			"startDate and endDate query parameters are required (YYYY-MM-DD format)",
		);
	}
	if (!isValidDate(startDate) || !isValidDate(endDate)) {
		throw new ApiError(400, "Validation Error", "startDate and endDate must be valid dates in YYYY-MM-DD format");
	}
	if (startDate > endDate) {
		throw new ApiError(400, "Validation Error", "startDate must be before or equal to endDate");
	}

	return {
		startDate,
		endDate,
		kMentions: boundedTopK(searchParams.get("kMentions"), DEFAULT_TOP_MENTIONS),
		kCitations: boundedTopK(searchParams.get("kCitations"), DEFAULT_TOP_CITATIONS),
	};
}

export const Route = createFileRoute("/api/v1/prompts/$promptId/snapshot")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const { promptId } = params;
					const { startDate, endDate, kMentions, kCitations } = parseSnapshotQuery(new URL(request.url));

					const { prompt, brand } = await requirePromptInScope(auth, promptId);
					const competitorsList = await db.select().from(competitors).where(eq(competitors.brandId, prompt.brandId));

					const brandDomains = new Set(
						[extractDomain(brand.website), ...(brand.additionalDomains || []).map(extractDomain)].filter(Boolean),
					);
					const competitorDomains = new Set(
						competitorsList.flatMap((c) => (c.domains || []).map(extractDomain)).filter(Boolean),
					);

					const timezone = "UTC";
					const [mentionData, topCompetitors, citationUrlStats] = await Promise.all([
						getPromptMentionSummary(promptId, startDate, endDate, timezone),
						getPromptTopCompetitorMentions(promptId, startDate, endDate, timezone, kMentions),
						getPromptCitationUrlStats(promptId, startDate, endDate, timezone),
					]);

					const mentionsTopK = topCompetitors.map((row) => ({
						entity: row.competitor_name,
						count: Number(row.mention_count),
					}));

					const urlCounts = new Map<string, { count: number; title?: string; domain: string }>();
					for (const { url, domain, title, count } of citationUrlStats) {
						const normalizedUrl = normalizeUrl(url);
						const existing = urlCounts.get(normalizedUrl);
						if (existing) {
							existing.count += Number(count);
							if (!existing.title && title) existing.title = title;
						} else {
							urlCounts.set(normalizedUrl, { count: Number(count), title: title || undefined, domain });
						}
					}

					let brandCitationsTotal = 0;
					let competitorCitationsTotal = 0;
					let citationsTotal = 0;
					const allCitationUrls = Array.from(urlCounts.entries())
						.map(([url, { count, title, domain }]) => {
							citationsTotal += count;
							if (inDomainSet(domain, brandDomains)) {
								brandCitationsTotal += count;
							} else if (inDomainSet(domain, competitorDomains)) {
								competitorCitationsTotal += count;
							}
							return { url, title, count };
						})
						.sort((a, b) => b.count - a.count);

					const citedUrlsTopK = allCitationUrls.slice(0, kCitations).map(({ url, title, count }) => ({
						url,
						title: title || null,
						count,
					}));

					return {
						brandId: prompt.brandId,
						promptId: prompt.id,
						promptValue: prompt.value,
						startDate,
						endDate,
						mentions: {
							mentionsTotal: Number(mentionData.brand_mentioned_count) + Number(mentionData.competitor_mentioned_count),
							brandMentionsTotal: Number(mentionData.brand_mentioned_count),
							competitorMentionsTotal: Number(mentionData.competitor_mentioned_count),
							mentionsTopK,
						},
						citations: {
							citationsTotal,
							brandCitationsTotal,
							competitorCitationsTotal,
							citedUrlsTopK,
						},
					};
				},
			}),
		}),
	},
});
