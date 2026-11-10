/**
 * /api/v1/reports/:reportId - External API endpoint for report status/data
 * Protected by API key authentication.
 *
 * GET: Poll report status. When completed, returns per-prompt snapshot data
 *      (mentions with top-K competitors).
 *      Consumers are responsible for computing SoV and other derived metrics.
 */
import { createFileRoute } from "@tanstack/react-router";
import { computeReportUnstableStats } from "@workspace/lib/report-metrics";
import { z } from "zod";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { clampedCount } from "@/lib/api/query";
import { reportSchema } from "@/lib/api/schemas/reports";
import { findReport } from "@/server/reports-core";

export const Route = createFileRoute("/api/v1/reports/$reportId")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: reportSchema,
				adminOnly: true,
				params: z.object({ reportId: z.uuid("Invalid report ID format") }),
				query: z.object({ kMentions: clampedCount(50, 5) }),
				handle: async ({ params, query }) => {
					const { reportId } = params;

					const report = await findReport(reportId);
					if (!report) {
						throw new ApiError(404, "Not Found", `Report with ID '${reportId}' not found`);
					}

					// For non-completed reports, return status with progress
					if (report.status !== "completed" || !report.rawOutput) {
						return {
							reportId: report.id,
							status: report.status,
							progress: report.progress,
							brandName: report.brandName,
							brandAliases: report.brandAliases,
							brandWebsite: report.brandWebsite,
							createdAt: report.createdAt,
							completedAt: report.completedAt,
						};
					}

					// Top-K params applied to each prompt's snapshot
					const { kMentions } = query;

					const rawOutput = report.rawOutput as {
						competitors: Array<{ name: string; domain: string }>;
						prompts: Array<{ value: string }>;
						promptRuns: Array<{
							promptValue: string;
							runs: Array<{
								model: string;
								brandMentioned: boolean;
								competitorsMentioned: string[];
							}>;
						}>;
					};

					const allPromptSnapshots = rawOutput.promptRuns.map((pr) => {
						const totalRuns = pr.runs.length;
						let brandMentionsTotal = 0;
						let competitorMentionsTotal = 0;
						const competitorCounts: Record<string, number> = {};

						for (const run of pr.runs) {
							if (run.brandMentioned) brandMentionsTotal++;
							for (const comp of run.competitorsMentioned) {
								competitorCounts[comp] = (competitorCounts[comp] || 0) + 1;
								competitorMentionsTotal++;
							}
						}

						const mentionsTopK = Object.entries(competitorCounts)
							.map(([entity, count]) => ({ entity, count }))
							.sort((a, b) => b.count - a.count)
							.slice(0, kMentions);

						return {
							promptValue: pr.promptValue,
							totalRuns,
							mentions: {
								mentionsTotal: brandMentionsTotal + competitorMentionsTotal,
								brandMentionsTotal,
								competitorMentionsTotal,
								mentionsTopK,
							},
						};
					});

					const unstable = computeReportUnstableStats(rawOutput);

					return {
						reportId: report.id,
						status: report.status,
						brandName: report.brandName,
						brandAliases: report.brandAliases,
						brandWebsite: report.brandWebsite,
						createdAt: report.createdAt,
						completedAt: report.completedAt,
						prompts: allPromptSnapshots,
						unstable,
					};
				},
			}),
		}),
	},
});
