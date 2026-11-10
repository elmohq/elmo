/**
 * /api/v1/prompts/:promptId/snapshot — aggregated mention + citation stats
 * for a prompt over a date range.
 *
 * Protected by API key authentication.
 */
import { createFileRoute } from "@tanstack/react-router";
import { extractDomain, inDomainSet } from "@workspace/lib/citations/domain-categories";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { clampedCount } from "@/lib/api/query";
import { promptSnapshotSchema } from "@/lib/api/schemas/snapshots";
import { requirePromptInScope } from "@/lib/api/scope";
import { getCitationUrlStats, getCompetitorTotals, getMentionTotals } from "@/lib/rollup-read";
import { mentionQuality } from "@/lib/sentiment";

function day() {
	return z.iso.date({
		error: (issue) =>
			issue.input === undefined ? "is required (YYYY-MM-DD format)" : "must be a valid date in YYYY-MM-DD format",
	});
}

/** Top-K lists are bounded so one request can't ask for the whole history. */
const MAX_TOP_K = 50;

const snapshotQuery = z.object({
	startDate: day(),
	endDate: day(),
	kMentions: clampedCount(MAX_TOP_K, 5),
	kCitations: clampedCount(MAX_TOP_K, 10),
});

export const Route = createFileRoute("/api/v1/prompts/$promptId/snapshot")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: promptSnapshotSchema,
				params: z.object({ promptId: z.uuid("Invalid prompt ID format") }),
				query: snapshotQuery,
				scopes: ["read"],
				handle: async ({ params, query, auth }) => {
					const { promptId } = params;
					const { startDate, endDate, kMentions, kCitations } = query;
					if (startDate > endDate) {
						throw new ApiError(400, "Validation Error", "startDate must be before or equal to endDate");
					}

					const { prompt, brand } = await requirePromptInScope(auth, promptId);
					const competitorsList = await db.select().from(competitors).where(eq(competitors.brandId, prompt.brandId));

					const brandDomains = new Set(
						[extractDomain(brand.website), ...(brand.additionalDomains || []).map(extractDomain)].filter(Boolean),
					);
					const competitorDomains = new Set(
						competitorsList.flatMap((c) => (c.domains || []).map(extractDomain)).filter(Boolean),
					);

					const scope = {
						brandId: prompt.brandId,
						from: startDate,
						to: endDate,
						timezone: "UTC",
						promptIds: [prompt.id],
					};
					const [mentionData, topCompetitors, citationUrlStats] = await Promise.all([
						getMentionTotals(scope),
						getCompetitorTotals(scope, kMentions),
						getCitationUrlStats(scope),
					]);

					const mentionsTopK = topCompetitors.map((row) => ({ entity: row.competitor, count: row.runs }));

					let brandCitationsTotal = 0;
					let competitorCitationsTotal = 0;
					let citationsTotal = 0;
					const allCitationUrls = citationUrlStats
						.map(({ url, title, domain, count }) => {
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
							mentionsTotal: mentionData.brand_mentioned_runs + mentionData.competitor_mentions,
							brandMentionsTotal: mentionData.brand_mentioned_runs,
							competitorMentionsTotal: mentionData.competitor_mentions,
							mentionsTopK,
						},
						...mentionQuality(mentionData),
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
