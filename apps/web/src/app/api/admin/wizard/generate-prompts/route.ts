import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { analyzeWebsite, getCompetitors, generateCandidatePromptsForReports } from "@workspace/lib/wizard-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		const { website, brandName } = await request.json();

		if (!website) {
			return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
		}

		// Step 1: Analyze website
		const analysisResult = await analyzeWebsite(website);

		// Step 2: Get competitors
		const competitors = await getCompetitors(analysisResult.products, website);

		// Use provided brand name or extract from website
		const name = brandName || extractBrandName(website);

		// Step 3: Generate prompts
		const prompts = await generateCandidatePromptsForReports(
			name,
			website,
			analysisResult.products,
			competitors,
		);

		return NextResponse.json({
			brandName: name,
			products: analysisResult.products,
			domainTraffic: analysisResult.domainTraffic,
			competitors,
			prompts,
		});
	} catch (error) {
		console.error("Error generating prompts:", error);
		return NextResponse.json({ error: "Failed to generate prompts" }, { status: 500 });
	}
}

function extractBrandName(website: string): string {
	try {
		const url = new URL(website.startsWith("http") ? website : `https://${website}`);
		const hostname = url.hostname.replace(/^www\./, "");
		// Get the domain name without TLD
		const parts = hostname.split(".");
		if (parts.length >= 2) {
			return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
		}
		return hostname;
	} catch {
		return website;
	}
}
