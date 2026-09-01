/**
 * GET /api/v1/prompts/:promptId/runs/:runId — one answer, in full.
 *
 * Addressed through the prompt that produced it, so a run id belonging to one
 * prompt cannot be read under another.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";
import { findRunDetail } from "@/server/runs-core";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs/$runId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				params: z.object({
					promptId: z.guid("Invalid prompt ID format"),
					runId: z.guid("Invalid run ID format"),
				}),
				scopes: ["runs:read"],
				handle: async ({ params, auth }) => {
					const run = await findRunDetail(params.promptId, params.runId);
					// A run in another tenant reads exactly as one that isn't there.
					if (!run || !(await isBrandInScope(auth, run.brandId))) {
						throw new ApiError(404, "Not Found", `Run with ID '${params.runId}' not found`);
					}
					return run;
				},
			}),
		}),
	},
});
