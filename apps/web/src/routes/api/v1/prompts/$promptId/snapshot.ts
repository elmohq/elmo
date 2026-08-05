/**
 * /api/v1/prompts/:promptId/snapshot — aggregated mention + citation stats
 * for a prompt over a date range.
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getOrganizationPromptSnapshotContext } from "@workspace/lib/cloud/api-resources";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler } from "@/lib/api/handler";
import { mapOrganizationResourceError } from "@/lib/api/organization-resources.server";
import { extractDomain, normalizeUrl } from "@/lib/domain-categories";
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

export const Route = createFileRoute("/api/v1/prompts/$promptId/snapshot")({
	server: {
		handlers: {
			GET: createApiHandler({
				cloudOrganizationScoped: true,
				params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
				mapError: mapOrganizationResourceError,
				handle: async ({ params, request, scope }) => {
					const { promptId } = params;
					const { searchParams } = new URL(request.url);

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
						throw new ApiError(
							400,
							"Validation Error",
							"startDate and endDate must be valid dates in YYYY-MM-DD format",
						);
					}
					if (startDate > endDate) {
						throw new ApiError(400, "Validation Error", "startDate must be before or equal to endDate");
					}

					const kMentionsParam = Number.parseInt(searchParams.get("kMentions") || "5", 10);
					const kMentions = Number.isNaN(kMentionsParam) ? 5 : Math.max(1, Math.min(50, kMentionsParam));
					const kCitationsParam = Number.parseInt(searchParams.get("kCitations") || "10", 10);
					const kCitations = Number.isNaN(kCitationsParam) ? 10 : Math.max(1, Math.min(50, kCitationsParam));

					let prompt: { id: string; brandId: string; value: string };
					let brand: { website: string; additionalDomains: string[] };
					let competitorsList: Array<typeof competitors.$inferSelect>;
					if (scope.kind === "organization") {
						const context = await getOrganizationPromptSnapshotContext(scope.organizationId, promptId);
						prompt = context.prompt;
						brand = context.brand;
						competitorsList = context.competitors;
					} else {
						const promptResult = await db
							.select({ id: prompts.id, brandId: prompts.brandId, value: prompts.value })
							.from(prompts)
							.where(eq(prompts.id, promptId))
							.limit(1);
						if (promptResult.length === 0) {
							throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
						}
						prompt = promptResult[0];

						const [brandInfo, instanceCompetitors] = await Promise.all([
							db.select().from(brands).where(eq(brands.id, prompt.brandId)).limit(1),
							db.select().from(competitors).where(eq(competitors.brandId, prompt.brandId)),
						]);
						if (brandInfo.length === 0) {
							throw new ApiError(500, "Internal Server Error", "Brand not found for prompt");
						}
						brand = brandInfo[0];
						competitorsList = instanceCompetitors;
					}
					const brandDomains = new Set(
						[extractDomain(brand.website), ...(brand.additionalDomains || []).map(extractDomain)].filter(Boolean),
					);
					const competitorDomains = new Set(
						competitorsList.flatMap((c) => (c.domains || []).map(extractDomain)).filter(Boolean),
					);

					const isMatchingDomain = (domain: string, domainSet: Set<string>) => {
						for (const d of domainSet) {
							if (domain === d || domain.endsWith(`.${d}`)) return true;
						}
						return false;
					};

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
							if (isMatchingDomain(domain, brandDomains)) {
								brandCitationsTotal += count;
							} else if (isMatchingDomain(domain, competitorDomains)) {
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
		},
	},
});
