import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs, getBrandFromDb } from "@/lib/metadata";
import { auth0 } from "@/lib/auth0";

type Params = {
	id: string;
};

export async function GET(
	request: NextRequest,
	{ params }: { params: Params }
) {
	try {
		const session = await auth0.getSession();
		
		if (!session?.user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id: brandId } = params;

		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some(brand => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json(
				{ error: "Access denied to this brand" },
				{ status: 403 }
			);
		}

		const brand = await getBrandFromDb(brandId);

		if (!brand) {
			return NextResponse.json(
				{ error: "Brand not found" },
				{ status: 404 }
			);
		}

		const metadataBrand = userBrands.find(b => b.id === brandId);
		
		return NextResponse.json({
			...brand,
			name: brand.name || metadataBrand?.name || brand.name
		});
	} catch (error) {
		console.error("Error fetching brand:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
