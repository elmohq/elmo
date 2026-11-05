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

/** Trimmed, case-insensitively deduped variants, excluding the brand name itself. */
export function cleanBrandAliases(brandName: string, aliases: readonly string[] = []): string[] {
	const seen = new Set([brandName.trim().toLowerCase()]);
	const cleaned: string[] = [];
	for (const alias of aliases) {
		const trimmed = alias.trim();
		const key = trimmed.toLowerCase();
		if (!trimmed || seen.has(key)) continue;
		seen.add(key);
		cleaned.push(trimmed);
	}
	return cleaned;
}

export async function createReport(input: {
	brandName: string;
	brandAliases?: string[];
	brandWebsite: string;
	manualPrompts?: string[];
}): Promise<Report> {
	const newReport: NewReport = {
		brandName: input.brandName.trim(),
		brandAliases: cleanBrandAliases(input.brandName, input.brandAliases),
		brandWebsite: cleanOnboardingUrl(input.brandWebsite),
		status: "pending",
	};

	const [created] = await db.insert(reports).values(newReport).returning();
	if (!created) throw new ReportCreateError();

	try {
		const queued = await sendReportJob({
			reportId: created.id,
			brandName: created.brandName,
			brandAliases: created.brandAliases,
			brandWebsite: created.brandWebsite,
			manualPrompts: input.manualPrompts?.length ? input.manualPrompts : undefined,
		});
		if (!queued) throw new ReportQueueError();
	} catch {
		await db.update(reports).set({ status: "failed", updatedAt: new Date() }).where(eq(reports.id, created.id));
		throw new ReportQueueError();
	}

	return created;
}
