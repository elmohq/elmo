import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/db";
import { competitors } from "@/lib/db/schema";
import { getElmoOrgs } from "@/lib/metadata";
import { eq, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";

interface Params {
	id: string;
}

// Maximum limit (same as wizard)
const MAX_COMPETITORS = 3;

// GET all competitors for a brand
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Fetch competitors for this brand
		const brandCompetitors = await db
			.select()
			.from(competitors)
			.where(eq(competitors.brandId, brandId))
			.orderBy(competitors.name);

		return NextResponse.json(brandCompetitors);

	} catch (error) {
		console.error("Error fetching competitors:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

// POST - Create a new competitor
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

		const { name, domain } = body;

		if (!name || typeof name !== "string") {
			return NextResponse.json({ error: "Competitor name is required" }, { status: 400 });
		}

		if (!domain || typeof domain !== "string") {
			return NextResponse.json({ error: "Competitor domain is required" }, { status: 400 });
		}

		// Check current competitor count for this brand
		const currentCountResult = await db
			.select({ count: count() })
			.from(competitors)
			.where(eq(competitors.brandId, brandId));

		const currentCount = currentCountResult[0]?.count || 0;

		if (currentCount >= MAX_COMPETITORS) {
			return NextResponse.json({ 
				error: `Maximum limit reached. You can only have ${MAX_COMPETITORS} competitors.` 
			}, { status: 400 });
		}

		// Create new competitor
		const newCompetitor = await db.insert(competitors).values({
			brandId,
			name: name.trim(),
			domain: domain.trim(),
		}).returning();

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/reputation`);

		return NextResponse.json(newCompetitor[0], { status: 201 });

	} catch (error) {
		console.error("Error creating competitor:", error);
		return NextResponse.json({ error: "Failed to create competitor" }, { status: 500 });
	}
}

// PUT - Bulk update competitors (replace all)
export async function PUT(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;
		const body = await request.json();

		// Check access control
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		const { competitors: competitorList } = body;

		if (!Array.isArray(competitorList)) {
			return NextResponse.json({ error: "Competitors must be an array" }, { status: 400 });
		}

		if (competitorList.length > MAX_COMPETITORS) {
			return NextResponse.json({ 
				error: `Maximum limit exceeded. You can only have ${MAX_COMPETITORS} competitors.` 
			}, { status: 400 });
		}

		// Validate competitor data
		for (const competitor of competitorList) {
			if (!competitor.name || typeof competitor.name !== "string" || !competitor.name.trim()) {
				return NextResponse.json({ error: "Each competitor must have a valid name" }, { status: 400 });
			}
			if (!competitor.domain || typeof competitor.domain !== "string" || !competitor.domain.trim()) {
				return NextResponse.json({ error: "Each competitor must have a valid domain" }, { status: 400 });
			}
		}

		// Delete all existing competitors for this brand
		await db.delete(competitors).where(eq(competitors.brandId, brandId));

		// Create new competitors if any provided
		if (competitorList.length > 0) {
			const competitorsToCreate = competitorList.map((competitor: any) => ({
				brandId,
				name: competitor.name.trim(),
				domain: competitor.domain.trim(),
			}));

			await db.insert(competitors).values(competitorsToCreate);
		}

		// Revalidate related pages
		revalidatePath(`/app/${brandId}/reputation`);
		revalidatePath(`/app/${brandId}/settings`);

		return NextResponse.json({ 
			message: "Competitors updated successfully",
			count: competitorList.length
		});

	} catch (error) {
		console.error("Error updating competitors:", error);
		return NextResponse.json({ error: "Failed to update competitors" }, { status: 500 });
	}
} 