import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { prompts, brands } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
	try {
		// Check access control - get all user brands
		const userBrands = await getElmoOrgs();

		if (!userBrands || userBrands.length === 0) {
			return NextResponse.json([]);
		}

		const brandIds = userBrands.map((brand) => brand.id);

		// Fetch all prompts for user's brands with brand information
		const allPrompts = await db
			.select({
				id: prompts.id,
				brandId: prompts.brandId,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				value: prompts.value,
				enabled: prompts.enabled,
				createdAt: prompts.createdAt,
				brandName: brands.name,
			})
			.from(prompts)
			.innerJoin(brands, eq(prompts.brandId, brands.id))
			.where(inArray(prompts.brandId, brandIds))
			.orderBy(prompts.createdAt);

		return NextResponse.json(allPrompts);
	} catch (error) {
		console.error("Error fetching all prompts:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
