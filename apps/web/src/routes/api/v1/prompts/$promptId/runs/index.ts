/**
 * Metadata only: the answer text lives on the single-run endpoint, without which
 * a window of runs across every model is megabytes of prose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseAnalyticsWindow, parsePaging } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requirePromptBrandInScope } from "@/lib/api/scope";
import { listPromptRuns } from "@/server/runs-core";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
				scopes: ["read"],
				handle: async ({ params, request, auth }) => {
					const { promptId } = params;
					await requirePromptBrandInScope(auth, promptId);

					const url = new URL(request.url);
					const { page, limit, offset } = parsePaging(url);
					const { data, total } = await listPromptRuns({
						promptId,
						window: parseAnalyticsWindow(url),
						limit,
						offset,
						model: url.searchParams.get("model") ?? undefined,
					});

					return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
				},
			}),
		}),
	},
});
