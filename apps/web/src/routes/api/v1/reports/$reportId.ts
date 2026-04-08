/**
 * /api/v1/reports/:reportId - External API endpoint for report status/data
 * Protected by API key authentication.
 *
 * GET: Poll report status. Returns structured JSON with SoV metrics when completed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { reports } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import {
	computeOverallSoV,
	computePromptSoV,
	computeCompetitorSoVs,
	selectRepresentativePrompts,
	type ReportPromptRun,
} from "@workspace/lib/report-metrics";

function isValidUUID(id: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return uuidRegex.test(id);
}

function getReportIdFromPath(request: Request): string {
	const segments = new URL(request.url).pathname.split("/").filter(Boolean);
	return decodeURIComponent(segments[segments.length - 1] || "");
}

function isPromptBranded(promptValue: string, brandName: string, brandWebsite: string): boolean {
	const promptLower = promptValue.toLowerCase();
	const brandNameLower = brandName.toLowerCase();
	try {
		const url = new URL(brandWebsite.startsWith("http") ? brandWebsite : `https://${brandWebsite}`);
		const domain = url.hostname.replace(/^www\./, "").toLowerCase();
		const domainWithoutTld = domain.split(".")[0];
		return promptLower.includes(brandNameLower) || promptLower.includes(domain) || promptLower.includes(domainWithoutTld);
	} catch {
		return promptLower.includes(brandNameLower);
	}
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

					// Parse raw output and compute SoV metrics
					const rawOutput = report.rawOutput as {
						competitors: Array<{ name: string; domain: string }>;
						prompts: Array<{ value: string }>;
						promptRuns: Array<{
							promptValue: string;
							runs: Array<{
								brandMentioned: boolean;
								competitorsMentioned: string[];
							}>;
						}>;
					};

					// Build runs array
					const runs: (ReportPromptRun & { promptValue: string })[] = [];
					rawOutput.promptRuns.forEach((pr, promptIndex) => {
						for (const run of pr.runs) {
							runs.push({
								promptId: `prompt-${promptIndex + 1}`,
								promptValue: pr.promptValue,
								brandMentioned: run.brandMentioned,
								competitorsMentioned: run.competitorsMentioned,
							});
						}
					});

					const overallSoV = computeOverallSoV(runs, rawOutput.competitors);
					const competitorSoVs = computeCompetitorSoVs(runs, rawOutput.competitors);

					// Compute per-prompt SoV
					const promptSoVs = rawOutput.prompts.map((prompt, index) => {
						const promptId = `prompt-${index + 1}`;
						return {
							...computePromptSoV(promptId, runs, rawOutput.competitors),
							value: prompt.value,
							isBranded: isPromptBranded(prompt.value, report.brandName, report.brandWebsite),
						};
					});

					// Select representative prompts
					const selectedPrompts = selectRepresentativePrompts(
						promptSoVs,
						(id: string) => {
							const idx = parseInt(id.replace("prompt-", "")) - 1;
							const prompt = rawOutput.prompts[idx];
							return prompt ? isPromptBranded(prompt.value, report.brandName, report.brandWebsite) : false;
						},
					);

					const promptsWithMentions = promptSoVs.filter((p) => p.brandMentionCount > 0).length;

					return Response.json({
						reportId: report.id,
						status: report.status,
						brandName: report.brandName,
						brandWebsite: report.brandWebsite,
						createdAt: report.createdAt,
						completedAt: report.completedAt,
						data: {
							overallSoV,
							competitors: competitorSoVs.map((c) => ({
								name: c.name,
								sov: c.sov,
								mentionCount: c.mentionCount,
							})),
							prompts: promptSoVs.map((p) => ({
								value: p.value,
								isBranded: p.isBranded,
								sov: p.sov,
								totalRuns: p.totalRuns,
								brandMentionCount: p.brandMentionCount,
								competitorMentions: p.competitorMentions,
								category: selectedPrompts.find((s) => s.promptId === p.promptId)?.category ?? "neutral",
							})),
							summary: {
								totalPromptsTested: rawOutput.prompts.length,
								promptsWithBrandMentions: promptsWithMentions,
								topCompetitors: competitorSoVs.slice(0, 5).map((c) => ({
									name: c.name,
									sov: c.sov,
								})),
							},
						},
					});
				} catch (error) {
					console.error("Error fetching report:", error);
					return Response.json({ error: "Internal Server Error", message: "Failed to fetch report" }, { status: 500 });
				}
			},
		},
	},
});
