import { NextRequest, NextResponse } from "next/server";
import { getKeywords } from "@/lib/wizard-helpers";

export async function POST(request: NextRequest) {
	try {
		const { domain, products } = await request.json();

		if (!domain) {
			return NextResponse.json({ error: "Domain is required" }, { status: 400 });
		}

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json({ error: "Products array is required" }, { status: 400 });
		}

		const keywords = await getKeywords(domain, products);

		return NextResponse.json({ keywords });
	} catch (error) {
		console.error("Error getting keywords:", error);
		return NextResponse.json({ error: "Failed to get keywords" }, { status: 500 });
	}
}
