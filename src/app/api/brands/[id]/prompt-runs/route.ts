import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { promptRuns, prompts } from "@/lib/db/schema";
import { and, eq, gte, lte, desc } from "drizzle-orm";

type Params = {
	id: string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;
		const { searchParams } = new URL(request.url);

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Parse query parameters
		const fromParam = searchParams.get("from");
		const toParam = searchParams.get("to");
		const lookbackParam = searchParams.get("lookback");
		const webSearchEnabledParam = searchParams.get("webSearchEnabled");

		let fromDate: Date | undefined;
		let toDate: Date | undefined;

		// Handle lookback periods
		if (lookbackParam && lookbackParam !== "all") {
			toDate = new Date();
			fromDate = new Date();
			
			switch (lookbackParam) {
				case "1w":
					fromDate.setDate(fromDate.getDate() - 7);
					break;
				case "1m":
					fromDate.setMonth(fromDate.getMonth() - 1);
					break;
				case "3m":
					fromDate.setMonth(fromDate.getMonth() - 3);
					break;
				case "6m":
					fromDate.setMonth(fromDate.getMonth() - 6);
					break;
				case "1y":
					fromDate.setFullYear(fromDate.getFullYear() - 1);
					break;
				default:
					return NextResponse.json({ error: "Invalid lookback period. Use: 1w, 1m, 3m, 6m, 1y, or all" }, { status: 400 });
			}
		} else if (fromParam || toParam) {
			// Handle explicit date range
			if (fromParam) {
				fromDate = new Date(fromParam);
				if (isNaN(fromDate.getTime())) {
					return NextResponse.json({ error: "Invalid 'from' date format" }, { status: 400 });
				}
			}
			if (toParam) {
				toDate = new Date(toParam);
				if (isNaN(toDate.getTime())) {
					return NextResponse.json({ error: "Invalid 'to' date format" }, { status: 400 });
				}
			}
		}

		// Build query conditions
		const conditions = [eq(prompts.brandId, brandId)];

		// Add time range conditions if specified
		if (fromDate) {
			conditions.push(gte(promptRuns.createdAt, fromDate));
		}
		if (toDate) {
			conditions.push(lte(promptRuns.createdAt, toDate));
		}

		// Add webSearchEnabled filter if specified
		if (webSearchEnabledParam !== null) {
			const webSearchEnabled = webSearchEnabledParam === "true";
			conditions.push(eq(promptRuns.webSearchEnabled, webSearchEnabled));
		}

		// Execute query with all conditions
		const runs = await db
			.select({
				id: promptRuns.id,
				promptId: promptRuns.promptId,
				model: promptRuns.model,
				webSearchEnabled: promptRuns.webSearchEnabled,
				webQueries: promptRuns.webQueries,
				brandMentioned: promptRuns.brandMentioned,
				competitorsMentioned: promptRuns.competitorsMentioned,
				createdAt: promptRuns.createdAt,
			})
			.from(promptRuns)
			.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
			.where(and(...conditions))
			.orderBy(desc(promptRuns.createdAt))
			.execute();

		return NextResponse.json(runs);

	} catch (error) {
		console.error("Error fetching prompt runs:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
} 