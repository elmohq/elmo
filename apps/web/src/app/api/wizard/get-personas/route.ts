import { NextRequest, NextResponse } from "next/server";
import { getPersonas } from "@/lib/wizard-helpers";

export async function POST(request: NextRequest) {
	try {
		const { products, website } = await request.json();

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json({ error: "Products array is required" }, { status: 400 });
		}

		if (!website || typeof website !== "string") {
			return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
		}

		const personaGroups = await getPersonas(products, website);

		return NextResponse.json({ personaGroups });
	} catch (error) {
		console.error("Error getting personas:", error);
		return NextResponse.json({ error: "Failed to get personas" }, { status: 500 });
	}
}
