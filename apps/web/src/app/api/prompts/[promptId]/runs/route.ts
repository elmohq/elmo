import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { promptRuns, prompts } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, desc } from "drizzle-orm";

type Params = {
	promptId: string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { promptId } = await params;

		// Check access control - get all user brands
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

		// Check if user has access to this prompt's brand
		if (!brandIds.includes(prompt[0].brandId)) {
			return NextResponse.json({ error: "Access denied to this prompt" }, { status: 403 });
		}

		// Fetch all prompt runs for this prompt
		const runs = await db
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
			.where(eq(promptRuns.promptId, promptId))
			.orderBy(desc(promptRuns.createdAt));

		return NextResponse.json({
			prompt: prompt[0],
			runs,
		});
	} catch (error) {
		console.error("Error fetching prompt runs:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
