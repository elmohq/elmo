/**
 * Metadata only: the answer text lives on the single-run endpoint, without which
 * a window of runs across every model is megabytes of prose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { instant, offsetOf, paginationOf, paging } from "@/lib/api/query";
import { runListSchema } from "@/lib/api/schemas/runs";
import { requirePromptBrandInScope } from "@/lib/api/scope";
import { listPromptRuns } from "@/server/runs-core";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: runListSchema,
				params: z.object({ promptId: z.uuid("Invalid prompt ID format") }),
				query: z.object({ start: instant, end: instant, model: z.string().optional(), ...paging }),
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
