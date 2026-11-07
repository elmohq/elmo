/**
 * Metadata only: the answer text lives on the single-run endpoint, without which
 * a window of runs across every model is megabytes of prose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { limit, modelFilter, offsetOf, page, paginationOf, windowEnd, windowStart } from "@/lib/api/query";
import { requirePromptBrandInScope } from "@/lib/api/scope";
import { listPromptRuns } from "@/server/runs-core";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
				query: z.object({ start: windowStart, end: windowEnd, model: modelFilter, page, limit }),
				scopes: ["read"],
				handle: async ({ params, query, auth }) => {
					const { promptId } = params;
					await requirePromptBrandInScope(auth, promptId);

					const { data, total } = await listPromptRuns({
						promptId,
						window: resolveAnalyticsWindow(query.start, query.end),
						limit: query.limit,
						offset: offsetOf(query),
						model: query.model,
					});

					return { data, pagination: paginationOf(query, total) };
				},
			}),
		}),
	},
});
