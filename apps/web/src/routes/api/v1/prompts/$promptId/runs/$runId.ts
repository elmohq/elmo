/** Addressed through the prompt that produced it, so a run id belonging to one
 * prompt cannot be read under another. */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { runSchema } from "@/lib/api/schemas/runs";
import { isBrandInScope } from "@/lib/api/scope";
import { findRunDetail } from "@/server/runs-core";

export const Route = createFileRoute("/api/v1/prompts/$promptId/runs/$runId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: runSchema,
				params: z.object({
					promptId: z.uuid("Invalid prompt ID format"),
					runId: z.uuid("Invalid run ID format"),
				}),
				scopes: ["read"],
				handle: async ({ params, auth }) => {
					const run = await findRunDetail(params.promptId, params.runId);
					if (!run || !(await isBrandInScope(auth, run.brandId))) {
						throw new ApiError(404, "Not Found", `Run with ID '${params.runId}' not found`);
					}
					return run;
				},
			}),
		}),
	},
});
