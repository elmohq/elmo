import { NextRequest, NextResponse } from "next/server";
import { hasReportGeneratorAccess } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { reports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import jsPDF from "jspdf";

export async function GET(
	request: NextRequest,
	{ params }: { params: { reportId: string } }
) {
	try {
		// Check if user has report generator access
		const hasAccess = await hasReportGeneratorAccess();
		if (!hasAccess) {
			return NextResponse.json(
				{ error: "Access denied. Report generator access required." },
				{ status: 403 }
			);
		}

		const { reportId } = params;

		// Validate reportId
		if (!reportId || typeof reportId !== "string") {
			return NextResponse.json(
				{ error: "Invalid report ID" },
				{ status: 400 }
			);
		}

		// Fetch the report from database
		const report = await db
			.select()
			.from(reports)
			.where(eq(reports.id, reportId))
			.limit(1);

		if (!report || report.length === 0) {
			return NextResponse.json(
				{ error: "Report not found" },
				{ status: 404 }
			);
		}

		const reportData = report[0];

		// Check if report is completed
		if (reportData.status !== "completed") {
			return NextResponse.json(
				{ error: "Report is not completed yet" },
				{ status: 400 }
			);
		}

		// Generate PDF
		const doc = new jsPDF();
		const pageWidth = doc.internal.pageSize.getWidth();
		const pageHeight = doc.internal.pageSize.getHeight();
		const margin = 20;
		const maxLineWidth = pageWidth - 2 * margin;
		const lineHeight = 7;
		
		// Add title
		doc.setFontSize(16);
		doc.setFont("helvetica", "bold");
		doc.text(`Report for ${reportData.brandName}`, margin, margin + 10);
		
		// Add website
		doc.setFontSize(12);
		doc.setFont("helvetica", "normal");
		doc.text(`Website: ${reportData.brandWebsite}`, margin, margin + 25);
		
		// Add creation date
		const createdDate = new Date(reportData.createdAt).toLocaleDateString();
		doc.text(`Created: ${createdDate}`, margin, margin + 35);
		
		// Add content
		doc.setFontSize(10);
		const content = reportData.rawOutput;
		
		// Split content into lines that fit the page width
		const lines = doc.splitTextToSize(content, maxLineWidth);
		
		let yPosition = margin + 50;
		
		for (const line of lines) {
			// Check if we need a new page
			if (yPosition + lineHeight > pageHeight - margin) {
				doc.addPage();
				yPosition = margin;
			}
			
			doc.text(line, margin, yPosition);
			yPosition += lineHeight;
		}

		// Generate PDF buffer
		const pdfBuffer = doc.output("arraybuffer");

		// Create response with PDF
		return new NextResponse(pdfBuffer, {
			status: 200,
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="${reportData.brandName.replace(/[^a-zA-Z0-9]/g, "_")}_report.pdf"`,
				"Content-Length": pdfBuffer.byteLength.toString(),
			},
		});
	} catch (error) {
		console.error("Error generating PDF:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
} 