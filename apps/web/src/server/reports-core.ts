import { db } from "@workspace/lib/db/db";
import { type NewReport, type Report, reports } from "@workspace/lib/db/schema";
import { cleanOnboardingUrl } from "@workspace/lib/onboarding";
import { eq } from "drizzle-orm";
import { sendReportJob } from "@/lib/job-scheduler";

export class ReportCreateError extends Error {
	constructor() {
		super("Failed to create report");
		this.name = "ReportCreateError";
	}
}

export class ReportQueueError extends Error {
	constructor() {
		super("Failed to queue report generation");
		this.name = "ReportQueueError";
	}
}

export async function findReport(reportId: string): Promise<Report | undefined> {
	const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
	return report;
}

export async function createReport(input: {
	brandName: string;
	brandWebsite: string;
	manualPrompts?: string[];
}): Promise<Report> {
	const newReport: NewReport = {
		brandName: input.brandName.trim(),
		// Full path is kept — it's what the analysis reads — but credentials
		// are stripped before the URL is stored or handed to any fetcher.
		brandWebsite: cleanOnboardingUrl(input.brandWebsite),
		status: "pending",
	};

	const [created] = await db.insert(reports).values(newReport).returning();
	if (!created) throw new ReportCreateError();

	try {
		const queued = await sendReportJob(
			created.id,
			created.brandName,
			created.brandWebsite,
			input.manualPrompts?.length ? input.manualPrompts : undefined,
		);
		if (!queued) throw new ReportQueueError();
	} catch {
		await db.update(reports).set({ status: "failed", updatedAt: new Date() }).where(eq(reports.id, created.id));
		throw new ReportQueueError();
	}

	return created;
}
