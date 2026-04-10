/**
 * /api/v1/reports - External API endpoint for report generation
 * Protected by API key authentication.
 *
 * POST: Create a new report and queue generation.
 * GET: List reports with pagination.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { reports, type NewReport } from "@workspace/lib/db/schema";
import { desc, count, eq } from "drizzle-orm";
import { validateApiKeyFromRequest as validateApiKey } from "@/lib/auth/policies";
import { sendReportJob } from "@/lib/job-scheduler";

export const Route = createFileRoute("/api/v1/reports/")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const body = await request.json();
					const { brandName, brandWebsite, manualPrompts } = body as {
						brandName?: unknown;
						brandWebsite?: unknown;
						manualPrompts?: unknown;
					};

					// Validate required fields
					if (!brandName || typeof brandName !== "string" || !brandName.trim()) {
						return Response.json(
							{ error: "Validation Error", message: "brandName is required and must be a non-empty string" },
							{ status: 400 },
						);
					}

					if (!brandWebsite || typeof brandWebsite !== "string" || !brandWebsite.trim()) {
						return Response.json(
							{ error: "Validation Error", message: "brandWebsite is required and must be a non-empty string" },
							{ status: 400 },
						);
					}

					// Validate URL format
					try {
						new URL(brandWebsite.startsWith("http") ? brandWebsite : `https://${brandWebsite}`);
					} catch {
						return Response.json(
							{ error: "Validation Error", message: "brandWebsite must be a valid URL" },
							{ status: 400 },
						);
					}

					// Parse manual prompts
					let parsedManualPrompts: string[] | undefined;
					if (manualPrompts !== undefined) {
						if (!Array.isArray(manualPrompts) || !manualPrompts.every((p) => typeof p === "string")) {
							return Response.json(
								{ error: "Validation Error", message: "manualPrompts must be an array of strings" },
								{ status: 400 },
							);
						}
						const filtered = (manualPrompts as string[]).map((p) => p.trim()).filter((p) => p.length > 0);
						if (filtered.length > 0) {
							parsedManualPrompts = filtered;
						}
					}

					// Create report
					const newReport: NewReport = {
						brandName: (brandName as string).trim(),
						brandWebsite: (brandWebsite as string).trim(),
						status: "pending",
					};

					const result = await db.insert(reports).values(newReport).returning();
					const createdReport = result[0];
					if (!createdReport) {
						return Response.json({ error: "Internal Server Error", message: "Failed to create report" }, { status: 500 });
					}

					// Queue job
					const success = await sendReportJob(
						createdReport.id,
						createdReport.brandName,
						createdReport.brandWebsite,
						parsedManualPrompts,
					);

					if (!success) {
						await db
							.update(reports)
							.set({ status: "failed", updatedAt: new Date() })
							.where(eq(reports.id, createdReport.id));
						return Response.json(
							{ error: "Internal Server Error", message: "Failed to queue report generation" },
							{ status: 500 },
						);
					}

					return Response.json({
						reportId: createdReport.id,
						status: createdReport.status,
						brandName: createdReport.brandName,
						brandWebsite: createdReport.brandWebsite,
						createdAt: createdReport.createdAt,
					}, { status: 201 });
				} catch (error) {
					console.error("Error creating report:", error);
					return Response.json({ error: "Internal Server Error", message: "Failed to create report" }, { status: 500 });
				}
			},

			GET: async ({ request }) => {
				if (!validateApiKey(request)) {
					return Response.json({ error: "Unauthorized", message: "Valid API key required" }, { status: 401 });
				}

				try {
					const { searchParams } = new URL(request.url);
					const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
					const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
					const offset = (page - 1) * limit;

					const [totalCountResult] = await db.select({ count: count() }).from(reports);
					const totalCount = totalCountResult?.count || 0;
					const totalPages = Math.ceil(totalCount / limit);

					const reportsList = await db
						.select({
							id: reports.id,
							brandName: reports.brandName,
							brandWebsite: reports.brandWebsite,
							status: reports.status,
							createdAt: reports.createdAt,
							completedAt: reports.completedAt,
						})
						.from(reports)
						.orderBy(desc(reports.createdAt))
						.limit(limit)
						.offset(offset);

					return Response.json({
						reports: reportsList,
						pagination: { page, limit, total: totalCount, totalPages },
					});
				} catch (error) {
					console.error("Error listing reports:", error);
					return Response.json({ error: "Internal Server Error" }, { status: 500 });
				}
			},
		},
	},
});
