import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type Params = {
	id: string;
};

// GET all prompts for a brand
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Fetch prompts for this brand
		const brandPrompts = await db
			.select()
			.from(prompts)
			.where(eq(prompts.brandId, brandId))
			.orderBy(prompts.groupCategory, prompts.createdAt);

		return NextResponse.json(brandPrompts);

	} catch (error) {
		console.error("Error fetching prompts:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

// POST - Create a new prompt
export async function POST(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;
		const body = await request.json();

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		const { value, reputation, groupCategory, groupPrefix, enabled = true } = body;

		if (!value || typeof value !== "string") {
			return NextResponse.json({ error: "Prompt value is required" }, { status: 400 });
		}

		if (typeof reputation !== "boolean") {
			return NextResponse.json({ error: "Reputation field is required" }, { status: 400 });
		}

		// Create new prompt
		const newPrompt = await db.insert(prompts).values({
			brandId,
			value: value.trim(),
			reputation,
			groupCategory: groupCategory || null,
			groupPrefix: groupPrefix || null,
			enabled,
		}).returning();

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/prompts`);
		revalidatePath(`/app/${brandId}/reputation`);

		return NextResponse.json(newPrompt[0], { status: 201 });

	} catch (error) {
		console.error("Error creating prompt:", error);
		return NextResponse.json({ error: "Failed to create prompt" }, { status: 500 });
	}
} 