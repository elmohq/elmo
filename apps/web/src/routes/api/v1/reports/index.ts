/**
 * /api/v1/reports - External API endpoint for report generation
 * Protected by API key authentication.
 *
 * POST: Create a new report and queue generation.
 * GET: List reports with pagination.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { reports } from "@workspace/lib/db/schema";
import { cleanOnboardingUrl } from "@workspace/lib/onboarding";
import { count, desc } from "drizzle-orm";
import { z } from "zod";
import { clampedPaging } from "@/lib/api/analytics-range";
import { ApiError, createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { createReport, ReportCreateError, ReportQueueError } from "@/server/reports-core";

const createReportBody = z.object({
	brandName: z
		.string("brandName is required and must be a non-empty string")
		.trim()
		.min(1, "brandName is required and must be a non-empty string"),
	// The report worker fetches this page, so reject anything it can't fetch
	// (non-http(s) schemes) before the row exists and the job is queued.
	brandWebsite: z
		.string("brandWebsite is required and must be a non-empty string")
		.trim()
		.min(1, "brandWebsite is required and must be a non-empty string")
		.refine((website) => cleanOnboardingUrl(website) !== "", "brandWebsite must be a valid domain or http(s) URL"),
	manualPrompts: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/api/v1/reports/")({
	server: {
		handlers: withMethodGuard({
			POST: createApiHandler({
				adminOnly: true,
				body: createReportBody,
				status: 201,
				mapError: (err) =>
					err instanceof ReportCreateError || err instanceof ReportQueueError
						? new ApiError(500, "Internal Server Error", err.message)
						: undefined,
				handle: async ({ body }) => {
					const createdReport = await createReport({
						brandName: body.brandName,
						brandWebsite: body.brandWebsite,
						manualPrompts: (body.manualPrompts ?? []).map((prompt) => prompt.trim()).filter(Boolean),
					});

					return {
						reportId: createdReport.id,
						status: createdReport.status,
						brandName: createdReport.brandName,
						brandWebsite: createdReport.brandWebsite,
						createdAt: createdReport.createdAt,
					};
				},
			}),

			GET: createApiHandler({
				adminOnly: true,
				handle: async ({ request }) => {
					const { searchParams } = new URL(request.url);
					const { page, limit, offset } = clampedPaging(searchParams);

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

					// Both keys hold the same array while callers move to `data`, which
					// every list in this API answers with. `reports` is documented as
					// deprecated and goes in a later release.
					return {
						data: reportsList,
						reports: reportsList,
						pagination: { page, limit, total: totalCount, totalPages },
					};
				},
			}),
		}),
	},
});
