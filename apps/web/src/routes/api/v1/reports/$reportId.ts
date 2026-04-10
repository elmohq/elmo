/**
 * /api/v1/reports/:reportId - External API endpoint for report status/data
 * Protected by API key authentication.
 *
 * GET: Poll report status. When completed, returns per-prompt snapshot data
 *      (mentions with top-K competitors).
 *      Consumers are responsible for computing SoV and other derived metrics.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { reports } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import { computeReportUnstableStats } from "@workspace/lib/report-metrics";

function isValidUUID(id: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(id);
}

function getReportIdFromPath(request: Request): string {
	const segments = new URL(request.url).pathname.split("/").filter(Boolean);
	return decodeURIComponent(segments[segments.length - 1] || "");
}

export const Route = createFileRoute("/api/v1/reports/$reportId")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const reportId = getReportIdFromPath(request);
					if (!isValidUUID(reportId)) {
						return Response.json({ error: "Validation Error", message: "Invalid report ID format" }, { status: 400 });
					}

					const result = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
					if (result.length === 0) {
						return Response.json({ error: "Not Found", message: `Report with ID '${reportId}' not found` }, { status: 404 });
					}

					const report = result[0];

					// For non-completed reports, return status with progress
					if (report.status !== "completed" || !report.rawOutput) {
						return Response.json({
							reportId: report.id,
							status: report.status,
							progress: report.progress,
							brandName: report.brandName,
							brandWebsite: report.brandWebsite,
							createdAt: report.createdAt,
							completedAt: report.completedAt,
						});
					}

					const { searchParams } = new URL(request.url);

					// Top-K params applied to each prompt's snapshot
					const kMentionsParam = Number.parseInt(searchParams.get("kMentions") || "5", 10);
					const kMentions = Number.isNaN(kMentionsParam) ? 5 : Math.max(1, Math.min(50, kMentionsParam));

					// Parse raw output
					const rawOutput = report.rawOutput as {
						competitors: Array<{ name: string; domain: string }>;
						prompts: Array<{ value: string }>;
						promptRuns: Array<{
							promptValue: string;
							runs: Array<{
								modelGroup: string;
								brandMentioned: boolean;
								competitorsMentioned: string[];
							}>;
						}>;
					};

					// Build per-prompt snapshot data
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

						// Sort competitors by count descending, take top K
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

					// Compute unstable derived stats
					const unstable = computeReportUnstableStats(rawOutput);

					return Response.json({
						reportId: report.id,
						status: report.status,
						brandName: report.brandName,
						brandWebsite: report.brandWebsite,
						createdAt: report.createdAt,
						completedAt: report.completedAt,
						prompts: allPromptSnapshots,
						unstable,
					});
				} catch (error) {
					console.error("Error fetching report:", error);
					return Response.json({ error: "Internal Server Error", message: "Failed to fetch report" }, { status: 500 });
				}
			},
		},
	},
});
