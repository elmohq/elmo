/**
 * GET /api/v1/prompts/:promptId/runs — the answers behind a prompt.
 *
 * Metadata only, newest first. The answer text lives on `GET /runs/:runId`,
 * which keeps this list small enough to page through: a window of runs across
 * every platform would otherwise be megabytes of prose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseAnalyticsWindow, parsePaging } from "@/lib/api/analytics-range";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";
import { countPromptRuns, getPromptRuns } from "@/lib/postgres-read";

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
					const { startDate, endDate, timezone } = parseAnalyticsWindow(url);
					const { page, limit, offset } = parsePaging(url);
					const model = url.searchParams.get("model") ?? undefined;

					// Both go through the read layer's timezone-aware, half-open window,
					// so a run just after local midnight lands on the day the caller
					// asked about rather than the day UTC happens to be on.
					const [rows, total] = await Promise.all([
						getPromptRuns(promptId, startDate, endDate, timezone, limit, offset, model),
						countPromptRuns(promptId, startDate, endDate, timezone, model),
					]);

					return {
						data: rows.map((row) => ({
							id: row.id,
							promptId: row.prompt_id,
							brandId: row.brand_id,
							model: row.model,
							provider: row.provider,
							webSearchEnabled: row.web_search_enabled,
							brandMentioned: row.brand_mentioned,
							competitorsMentioned: row.competitors_mentioned,
							webQueries: row.web_queries,
							citationCount: row.citation_count,
							createdAt: row.created_at,
						})),
						pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
					};
				},
			}),
		}),
	},
});
