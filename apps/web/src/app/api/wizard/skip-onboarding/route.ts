import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs, updateBrand } from "@/lib/metadata";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
	try {
		const { brandId } = await request.json();

		if (!brandId) {
			return NextResponse.json({ error: "Brand ID is required" }, { status: 400 });
		}

		// Verify user has access to this brand
		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Update the brand to mark onboarding as complete
		const updatedBrand = await updateBrand(brandId, { onboarded: true });

		if (!updatedBrand) {
			return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
		}

		// Revalidate the brand pages
		revalidatePath(`/app/${brandId}`);
		revalidatePath(`/app/${brandId}/settings/brand`);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error skipping onboarding:", error);
		return NextResponse.json({ error: "Failed to skip onboarding" }, { status: 500 });
	}
}
