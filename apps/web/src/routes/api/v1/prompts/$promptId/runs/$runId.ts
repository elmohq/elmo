/**
 * GET /api/v1/prompts/:promptId/runs/:runId — one answer, in full.
 *
 * A run only means anything as one of a prompt's answers, so it is addressed
 * through the prompt that produced it. A run belonging to some other prompt
 * reads exactly like one that does not exist.
 *
 * `answer.text` is the normalized extraction, never the provider's own payload:
 * that shape belongs to the provider, and exposing it would quietly make it
 * part of this API's contract.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { citations, promptRuns } from "@workspace/lib/db/schema";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { isBrandInScope } from "@/lib/api/scope";

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
					const { promptId, runId } = params;
					const [run] = await db
						.select()
						.from(promptRuns)
						.where(and(eq(promptRuns.id, runId), eq(promptRuns.promptId, promptId)))
						.limit(1);
					if (!run || !(await isBrandInScope(auth, run.brandId))) {
						throw new ApiError(404, "Not Found", `Run with ID '${runId}' not found`);
					}

					const cited = await db
						.select({
							url: citations.url,
							domain: citations.domain,
							title: citations.title,
							citationIndex: citations.citationIndex,
						})
						.from(citations)
						.where(eq(citations.promptRunId, runId))
						.orderBy(asc(citations.citationIndex));

					// Older rows predate the provider column; the model name is the
					// extractor's other accepted key, so it is the right fallback.
					const text = extractTextContent(run.rawOutput, run.provider ?? run.model);

					return {
						id: run.id,
						promptId: run.promptId,
						brandId: run.brandId,
						model: run.model,
						provider: run.provider,
						webSearchEnabled: run.webSearchEnabled,
						brandMentioned: run.brandMentioned,
						competitorsMentioned: run.competitorsMentioned,
						webQueries: run.webQueries,
						citationCount: cited.length,
						createdAt: run.createdAt,
						answer: { text: text || null },
						citations: cited,
					};
				},
			}),
		}),
	},
});
