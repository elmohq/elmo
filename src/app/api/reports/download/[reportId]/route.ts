import { NextRequest, NextResponse } from "next/server";
import { hasReportGeneratorAccess } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { reports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Dynamic import for puppeteer-core and chromium to avoid bundling issues
let puppeteer: any;
let chromium: any;

export const maxDuration = 300;

// Initialize browser dependencies
async function initBrowser() {
	if (!puppeteer) {
		if (process.env.NODE_ENV === "development") {
			// Development: use regular puppeteer with local Chrome
			puppeteer = (await import("puppeteer")).default;
		} else {
			// Production: use puppeteer-core + serverless chromium
			puppeteer = (await import("puppeteer-core")).default;
			chromium = (await import("@sparticuz/chromium")).default;
		}
	}
}

// Launch browser instance
async function getBrowser() {
	await initBrowser();

	if (process.env.NODE_ENV === "development") {
		// Development: use regular puppeteer with local Chrome/Chromium
		return await puppeteer.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	} else {
		// Production: use minimal chromium for Vercel serverless compatibility
		return await puppeteer.launch({
			args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
			defaultViewport: chromium.defaultViewport,
			executablePath: await chromium.executablePath(),
			headless: chromium.headless,
			ignoreHTTPSErrors: true,
		});
	}
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
	try {
		// Check if user has report generator access
		const hasAccess = await hasReportGeneratorAccess();
		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied. Report generator access required." }, { status: 403 });
		}

		const { reportId } = await params;

		// Validate reportId
		if (!reportId || typeof reportId !== "string") {
			return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
		}

		// Fetch the report from database
		const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);

		if (!report || report.length === 0) {
			return NextResponse.json({ error: "Report not found" }, { status: 404 });
		}

		const reportData = report[0];

		// Check if report is completed
		if (reportData.status !== "completed") {
			return NextResponse.json({ error: "Report is not completed yet" }, { status: 400 });
		}

		// Use the new render route that bypasses all layouts
		const renderUrl = `${request.nextUrl.origin}/reports/render/${reportId}`;

		// Launch browser and generate PDF
		const browser = await getBrowser();
		const page = await browser.newPage();

		// Navigate to the render page and wait for it to load
		await page.goto(renderUrl, { waitUntil: "networkidle0", timeout: 60000 });

		// Wait for fonts to load completely
		await page.evaluateHandle(() => {
			return document.fonts.ready;
		});

		// Additional wait to ensure all content is rendered
		await new Promise((resolve) => setTimeout(resolve, 4000));

		// Wait for any images to load (like logos)
		await page.evaluate(() => {
			return Promise.all(
				Array.from(document.images)
					.filter((img) => !img.complete)
					.map(
						(img) =>
							new Promise((resolve) => {
								img.onload = img.onerror = resolve;
							}),
					),
			);
		});

		// Generate PDF with print-optimized settings
		const pdfBuffer = await page.pdf({
			format: "Letter",
			printBackground: true,
			margin: {
				top: "20px",
				right: "10px",
				bottom: "20px",
				left: "10px",
			},
			waitForFonts: true,
		});

		await browser.close();

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
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
