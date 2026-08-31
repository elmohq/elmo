/**
 * GET /api/v1/prompts/:promptId/runs — the answers behind a prompt.
 *
 * Metadata only, newest first. The answer text lives on `GET /runs/:runId`,
 * which keeps this list small enough to page through: a window of runs across
 * every platform would otherwise be megabytes of prose.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pageEnvelope, parseAnalyticsWindow, parsePaging } from "@/lib/api/analytics-range";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";
import { findPromptBrandId } from "@/server/prompts-core";
import { listPromptRuns } from "@/server/runs-core";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: z.object({ promptId: z.guid("Invalid prompt ID format") }),
				scopes: ["runs:read"],
				handle: async ({ params, request, auth }) => {
					const { promptId } = params;
					// A prompt in another tenant reads exactly as one that isn't there.
					const brandId = await findPromptBrandId(promptId);
					if (!brandId || !(await isBrandInScope(auth, brandId))) {
						throw new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
					}

					const url = new URL(request.url);
					const window = parseAnalyticsWindow(url);
					const { page, limit, offset } = parsePaging(url);
					const model = url.searchParams.get("model") ?? undefined;

					const { data, total } = await listPromptRuns({ promptId, window, limit, offset, model });
					return { data, pagination: pageEnvelope(page, limit, total) };
				},
			}),
		}),
	},
});
