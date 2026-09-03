/** Server functions for report operations. */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { reports } from "@workspace/lib/db/schema";
import { cleanOnboardingUrl } from "@workspace/lib/onboarding";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { hasReportAccess, requireAuthSession } from "@/lib/auth/helpers";
import { createReport, findReport } from "@/server/reports-core";

async function requireReportAccess() {
	const session = await requireAuthSession();
	if (!hasReportAccess(session)) throw new Error("Access denied. Report generator access required.");
}

export const getReportsFn = createServerFn({ method: "GET" }).handler(async () => {
	await requireReportAccess();

	return db
		.select({
			id: reports.id,
			brandName: reports.brandName,
			brandWebsite: reports.brandWebsite,
			status: reports.status,
			createdAt: reports.createdAt,
			completedAt: reports.completedAt,
			updatedAt: reports.updatedAt,
		})
		.from(reports)
		.orderBy(desc(reports.createdAt));
});

export const getReportByIdFn = createServerFn({ method: "GET" })
	.validator(z.object({ reportId: z.string() }))
	.handler(async ({ data }) => {
		await requireReportAccess();

		const report = await findReport(data.reportId);
		if (!report) throw new Error("Report not found");
		return { ...report, rawOutput: report.rawOutput as {} | null };
	});

export const createReportFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandName: z.string().min(1),
			// The report worker fetches this page, so reject anything it can't
			// fetch (non-http(s) schemes) here rather than after the row exists.
			brandWebsite: z
				.string()
				.min(1)
				.refine((website) => cleanOnboardingUrl(website) !== "", "Enter a valid domain or http(s) website URL"),
			manualPrompts: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		await requireReportAccess();

		const manualPrompts = (data.manualPrompts ?? "")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		const createdReport = await createReport({
			brandName: data.brandName,
			brandWebsite: data.brandWebsite,
			manualPrompts,
		});

		return { ...createdReport, rawOutput: createdReport.rawOutput as {} | null };
	});
