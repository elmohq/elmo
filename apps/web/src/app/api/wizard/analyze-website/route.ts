import { NextRequest, NextResponse } from "next/server";
import { analyzeWebsite } from "@workspace/lib/wizard-helpers";

export async function POST(request: NextRequest) {
	try {
		const { website } = await request.json();

		if (!website) {
			return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
		}

		const result = await analyzeWebsite(website);

		return NextResponse.json(result);
	} catch (error) {
		console.error("Error analyzing website:", error);
		return NextResponse.json({ error: "Failed to analyze website" }, { status: 500 });
	}
}
