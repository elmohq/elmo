import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/lib/db/db";
import { competitors } from "@workspace/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

interface Params {
	id: string;
	competitorId: string;
}

// GET a specific competitor
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, competitorId } = await params;

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Fetch the specific competitor
		const competitor = await db
			.select()
			.from(competitors)
			.where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)))
			.limit(1);

		if (competitor.length === 0) {
			return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
		}

		return NextResponse.json(competitor[0]);
	} catch (error) {
		console.error("Error fetching competitor:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

// PUT - Update a specific competitor
export async function PUT(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, competitorId } = await params;
		const body = await request.json();

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Check if competitor exists and belongs to the brand
		const existingCompetitor = await db
			.select()
			.from(competitors)
			.where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)))
			.limit(1);

		if (existingCompetitor.length === 0) {
			return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
		}

		const { name, domain } = body;

		// Build update object with only provided fields
		const updateData: Partial<typeof competitors.$inferInsert> = {};

		if (name !== undefined) {
			if (typeof name !== "string" || !name.trim()) {
				return NextResponse.json({ error: "Competitor name must be a non-empty string" }, { status: 400 });
			}
			updateData.name = name.trim();
		}

		if (domain !== undefined) {
			if (typeof domain !== "string") {
				return NextResponse.json({ error: "Domain must be a string" }, { status: 400 });
			}
			updateData.domain = domain.trim();
		}

		// Update the competitor
		const updatedCompetitor = await db
			.update(competitors)
			.set(updateData)
			.where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)))
			.returning();

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/reputation`);

		return NextResponse.json(updatedCompetitor[0]);
	} catch (error) {
		console.error("Error updating competitor:", error);
		return NextResponse.json({ error: "Failed to update competitor" }, { status: 500 });
	}
}

// DELETE a specific competitor
export async function DELETE(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId, competitorId } = await params;

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Check if competitor exists and belongs to the brand
		const existingCompetitor = await db
			.select()
			.from(competitors)
			.where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)))
			.limit(1);

		if (existingCompetitor.length === 0) {
			return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
		}

		// Delete the competitor
		await db.delete(competitors).where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)));

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/reputation`);

		return NextResponse.json({ success: true, message: "Competitor deleted successfully" });
	} catch (error) {
		console.error("Error deleting competitor:", error);
		return NextResponse.json({ error: "Failed to delete competitor" }, { status: 500 });
	}
}
