/**
 * GET /api/v1/prompts/:promptId/runs — the answers behind a prompt.
 *
 * Metadata only, newest first. The answer text lives on `GET /runs/:runId`,
 * which keeps this list small enough to page through: a window of runs across
 * every platform would otherwise be megabytes of prose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { parseAnalyticsWindow, parsePaging } from "@/lib/api/analytics-range";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
				scopes: ["runs:read"],
				handle: async ({ params, request, auth }) => {
					const { promptId } = params;
					const [prompt] = await db
						.select({ id: prompts.id, brandId: prompts.brandId })
						.from(prompts)
						.where(eq(prompts.id, promptId))
						.limit(1);
					if (!prompt || !(await isBrandInScope(auth, prompt.brandId))) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}

					const url = new URL(request.url);
					const { startDate, endDate } = parseAnalyticsWindow(url);
					const { page, limit, offset } = parsePaging(url);
					const model = url.searchParams.get("model");

					const where = and(
						eq(promptRuns.promptId, promptId),
						gte(promptRuns.createdAt, new Date(`${startDate}T00:00:00Z`)),
						lte(promptRuns.createdAt, new Date(`${endDate}T23:59:59.999Z`)),
						model ? eq(promptRuns.model, model) : undefined,
					);

					const [totals] = await db.select({ count: count() }).from(promptRuns).where(where);
					const rows = await db
						.select({
							id: promptRuns.id,
							promptId: promptRuns.promptId,
							brandId: promptRuns.brandId,
							model: promptRuns.model,
							provider: promptRuns.provider,
							webSearchEnabled: promptRuns.webSearchEnabled,
							brandMentioned: promptRuns.brandMentioned,
							competitorsMentioned: promptRuns.competitorsMentioned,
							webQueries: promptRuns.webQueries,
							createdAt: promptRuns.createdAt,
						})
						.from(promptRuns)
						.where(where)
						.orderBy(desc(promptRuns.createdAt))
						.limit(limit)
						.offset(offset);

					const counts = rows.length
						? await db
								.select({ promptRunId: citations.promptRunId, value: count() })
								.from(citations)
								.where(
									inArray(
										citations.promptRunId,
										rows.map((row) => row.id),
									),
								)
								.groupBy(citations.promptRunId)
						: [];
					const citationCounts = new Map(counts.map((row) => [row.promptRunId, Number(row.value)]));

					return {
						data: rows.map((row) => ({ ...row, citationCount: citationCounts.get(row.id) ?? 0 })),
						pagination: {
							page,
							limit,
							total: totals?.count ?? 0,
							totalPages: Math.max(1, Math.ceil((totals?.count ?? 0) / limit)),
						},
					};
				},
			}),
		}),
	},
});
