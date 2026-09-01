/**
 * Metadata only: the answer text lives on the single-run endpoint, without which
 * a window of runs across every model is megabytes of prose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseAnalyticsWindow, parsePaging } from "@/lib/api/analytics-range";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";
import { findPromptBrandId } from "@/server/prompts-core";
import { listPromptRuns } from "@/server/runs-core";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs/")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
				scopes: ["runs:read"],
				handle: async ({ params, request, auth }) => {
					const { promptId } = params;
					const brandId = await findPromptBrandId(promptId);
					if (!brandId || !(await isBrandInScope(auth, brandId))) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}

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
