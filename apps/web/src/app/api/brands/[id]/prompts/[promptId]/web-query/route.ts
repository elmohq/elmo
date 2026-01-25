import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs } from "@/lib/metadata";
import { queryTinybird } from "@/lib/tinybird-read-v2";

type Params = {
	id: string;
	promptId: string;
};

export interface WebQueryResponse {
	// Overall most common web query
	webQuery: string | null;
	// Per-model most common web queries
	modelWebQueries: Record<string, string>;
}

interface WebQueryCount {
	model_group: string;
	web_query: string;
	query_count: number;
}

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, promptId } = await params;
		const { searchParams } = new URL(request.url);
		const timezone = searchParams.get("timezone") || "UTC";
		const lookback = searchParams.get("lookback") || "1m";
		const modelGroup = searchParams.get("modelGroup"); // optional filter

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((b) => b.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied" }, { status: 403 });
		}

		// Calculate date range based on lookback
		const now = new Date();
		const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
		let fromDateStr: string | null = null;
		const toDateStr = todayStr;

		if (lookback && lookback !== "all") {
			const fromDate = new Date(now);
			switch (lookback) {
				case "1w":
					fromDate.setDate(fromDate.getDate() - 6);
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
			}
			fromDateStr = fromDate.toLocaleDateString("en-CA", { timeZone: timezone });
		}

		// Build date filter
		const dateFilter = fromDateStr
			? `AND toDate(created_at, {timezone:String}) >= toDate({fromDate:String}) AND toDate(created_at, {timezone:String}) <= toDate({toDate:String})`
			: "";

		// Build model filter
		const modelFilter = modelGroup ? `AND model_group = {modelGroup:String}` : "";

		// Query to get count of each web query per model, ordered by count descending
		// This gives us the most common web query for each model
		const webQueryData = await queryTinybird<WebQueryCount>(
			`
			SELECT
				model_group,
				arrayJoin(web_queries) as web_query,
				count() as query_count
			FROM prompt_runs_v2 FINAL
			WHERE prompt_id = {promptId:String}
				AND length(web_queries) > 0
				${dateFilter}
				${modelFilter}
			GROUP BY model_group, web_query
			ORDER BY model_group, query_count DESC
			`,
			{
				promptId,
				timezone,
				...(fromDateStr ? { fromDate: fromDateStr, toDate: toDateStr } : {}),
				...(modelGroup ? { modelGroup } : {}),
			},
		);

		// Process results - for each model, take the first (most common) web query
		let webQuery: string | null = null;
		const modelWebQueries: Record<string, string> = {};
		let maxOverallCount = 0;

		for (const row of webQueryData) {
			// Set per-model mapping (first one per model is most common due to ORDER BY)
			if (!modelWebQueries[row.model_group]) {
				modelWebQueries[row.model_group] = row.web_query;
			}
			
			// Track overall most common across all models
			if (row.query_count > maxOverallCount) {
				maxOverallCount = row.query_count;
				webQuery = row.web_query;
			}
		}

		const response: WebQueryResponse = {
			webQuery,
			modelWebQueries,
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching web query:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
