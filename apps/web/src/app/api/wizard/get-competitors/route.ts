import { NextRequest, NextResponse } from "next/server";
import { getCompetitors } from "@workspace/lib/wizard-helpers";

export async function POST(request: NextRequest) {
	try {
		const { products, website } = await request.json();

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json({ error: "Products array is required" }, { status: 400 });
		}

		if (!website || typeof website !== "string") {
			return NextResponse.json({ error: "Website is required" }, { status: 400 });
		}

		const competitors = await getCompetitors(products, website);

		return NextResponse.json({ competitors });
	} catch (error) {
		console.error("Error getting competitors:", error);
		return NextResponse.json({ error: "Failed to get competitors" }, { status: 500 });
	}
}
