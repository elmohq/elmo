import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { promptRuns, prompts } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, desc, gte, count, and } from "drizzle-orm";

type Params = {
	promptId: string;
};

export interface PromptRunsOnlyResponse {
	prompt: {
		id: string;
		brandId: string;
		value: string;
	};
	runs: {
		id: string;
		promptId: string;
		modelGroup: string;
		model: string;
		webSearchEnabled: boolean;
		rawOutput: any;
		webQueries: string[];
		brandMentioned: boolean;
		competitorsMentioned: string[];
		createdAt: string;
	}[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { promptId } = await params;
		const { searchParams } = new URL(request.url);

		// Parse pagination parameters
		const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
		const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "15")));
		const offset = (page - 1) * limit;

		// Parse time filter (default to last 7 days for performance)
		const days = Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "7")));
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - days);

		// Check access control
		const userBrands = await getElmoOrgs();
		if (!userBrands || userBrands.length === 0) {
			return NextResponse.json({ error: "No accessible brands" }, { status: 403 });
		}

		const brandIds = userBrands.map((brand) => brand.id);

		// First verify the prompt exists and user has access to it
		const prompt = await db
			.select({
				id: prompts.id,
				brandId: prompts.brandId,
				value: prompts.value,
			})
			.from(prompts)
			.where(eq(prompts.id, promptId))
			.limit(1);

		if (prompt.length === 0) {
			return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
		}

		if (!brandIds.includes(prompt[0].brandId)) {
			return NextResponse.json({ error: "Access denied to this prompt" }, { status: 403 });
		}

		// Build time filter condition
		const timeCondition = gte(promptRuns.createdAt, fromDate);

		// Run queries in parallel for speed
		const [totalCountResult, paginatedRuns] = await Promise.all([
			// Get total count for pagination
			db
				.select({ count: count() })
				.from(promptRuns)
				.where(and(eq(promptRuns.promptId, promptId), timeCondition)),

			// Get paginated runs
			db
				.select({
					id: promptRuns.id,
					promptId: promptRuns.promptId,
					modelGroup: promptRuns.modelGroup,
					model: promptRuns.model,
					webSearchEnabled: promptRuns.webSearchEnabled,
					rawOutput: promptRuns.rawOutput,
					webQueries: promptRuns.webQueries,
					brandMentioned: promptRuns.brandMentioned,
					competitorsMentioned: promptRuns.competitorsMentioned,
					createdAt: promptRuns.createdAt,
				})
				.from(promptRuns)
				.where(and(eq(promptRuns.promptId, promptId), timeCondition))
				.orderBy(desc(promptRuns.createdAt))
				.limit(limit)
				.offset(offset)
		]);

		// Process results
		const total = totalCountResult[0]?.count || 0;
		const totalPages = Math.ceil(Number(total) / limit);

		const response: PromptRunsOnlyResponse = {
			prompt: prompt[0],
			runs: paginatedRuns.map((run: any) => ({
				...run,
				createdAt: run.createdAt.toISOString()
			})),
			pagination: {
				page,
				limit,
				total: Number(total),
				totalPages,
				hasNext: page < totalPages,
				hasPrev: page > 1
			}
		};

		return NextResponse.json(response);

	} catch (error) {
		console.error("Error fetching prompt runs:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
