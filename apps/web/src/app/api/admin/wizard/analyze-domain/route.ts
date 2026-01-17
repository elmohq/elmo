import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { analyzeWebsite, getCompetitors } from "@/lib/wizard-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const { website } = await request.json();

		if (!website) {
			return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
		}

		// Step 1: Analyze website
		const analysisResult = await analyzeWebsite(website);

		// Step 2: Get competitors
		const competitors = await getCompetitors(analysisResult.products, website);

		return NextResponse.json({
			products: analysisResult.products,
			domainTraffic: analysisResult.domainTraffic,
			skipDetailedAnalysis: analysisResult.skipDetailedAnalysis,
			competitors,
		});
	} catch (error) {
		console.error("Error analyzing domain:", error);
		return NextResponse.json({ error: "Failed to analyze domain" }, { status: 500 });
	}
}
