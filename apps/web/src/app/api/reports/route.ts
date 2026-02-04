import { NextRequest, NextResponse } from "next/server";
import { hasReportGeneratorAccess } from "@/lib/metadata";
import { db } from "@workspace/lib/db/db";
import { reports, type NewReport } from "@workspace/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { REPORTS_QUEUE_NAME } from "@workspace/lib/dbos";
import { getDbosClient } from "@/lib/dbos-client";

export async function GET() {
	try {
		// Check if user has report generator access
		const hasAccess = await hasReportGeneratorAccess();
		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied. Report generator access required." }, { status: 403 });
		}

		// Fetch all reports ordered by creation date (newest first)
		// Exclude rawOutput to improve performance
		const allReports = await db
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

		return NextResponse.json(allReports);
	} catch (error) {
		console.error("Error fetching reports:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		// Check if user has report generator access
		const hasAccess = await hasReportGeneratorAccess();
		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied. Report generator access required." }, { status: 403 });
		}

		const body = await request.json();
		const { brandName, brandWebsite, manualPrompts } = body;

		// Validate required fields
		if (!brandName || typeof brandName !== "string" || !brandName.trim()) {
			return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
		}

		if (!brandWebsite || typeof brandWebsite !== "string" || !brandWebsite.trim()) {
			return NextResponse.json({ error: "Brand website is required" }, { status: 400 });
		}

		// Validate website URL format
		try {
			new URL(brandWebsite);
		} catch {
			return NextResponse.json({ error: "Invalid website URL format" }, { status: 400 });
		}

		// Parse manual prompts if provided
		const parsedManualPrompts: string[] = [];
		if (manualPrompts && typeof manualPrompts === "string" && manualPrompts.trim()) {
			const lines = manualPrompts.split('\n')
				.map(line => line.trim())
				.filter(line => line.length > 0);
			parsedManualPrompts.push(...lines);
		}

		// Create new report record
		const newReport: NewReport = {
			brandName: brandName.trim(),
			brandWebsite: brandWebsite.trim(),
			status: "pending",
		};

		const result = await db.insert(reports).values(newReport).returning();
		const createdReport = result[0];

		if (!createdReport) {
			return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
		}

		// Enqueue report generation workflow
		try {
			const dbosClient = await getDbosClient();
			await dbosClient.enqueue(
				{
					workflowName: "generateReport",
					queueName: REPORTS_QUEUE_NAME,
				},
				createdReport.id,
				createdReport.brandName,
				createdReport.brandWebsite,
				parsedManualPrompts.length > 0 ? parsedManualPrompts : undefined,
			);

			console.log(`Report workflow queued for report ID: ${createdReport.id}`);
		} catch (queueError) {
			console.error("Error adding report to DBOS queue:", queueError);
			// Update report status to failed if enqueue fails
			await db.update(reports).set({ status: "failed", updatedAt: new Date() }).where(eq(reports.id, createdReport.id));

			return NextResponse.json({ error: "Failed to queue report generation" }, { status: 500 });
		}

		return NextResponse.json(createdReport, { status: 201 });
	} catch (error) {
		console.error("Error creating report:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
