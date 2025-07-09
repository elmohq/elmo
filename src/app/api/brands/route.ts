import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs, getBrandFromDb, createBrand, getBrandMetadata } from "@/lib/metadata";
import { auth0 } from "@/lib/auth0";
import { revalidatePath } from "next/cache";

export async function GET(request: NextRequest) {
	try {
		const session = await auth0.getSession();
		
		if (!session?.user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const userBrands = await getElmoOrgs();
		
		if (!userBrands || userBrands.length === 0) {
			return NextResponse.json([]);
		}

		const brands = await Promise.all(
			userBrands.map(async (userBrand) => {
				const dbBrand = await getBrandFromDb(userBrand.id);
				return dbBrand ? {
					...dbBrand,
					name: dbBrand.name
				} : null;
			})
		);

		const validBrands = brands.filter(brand => brand !== null);

		return NextResponse.json(validBrands);
	} catch (error) {
		console.error("Error fetching brands:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
} 

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const brandId = formData.get("brandId") as string;
		const brandName = formData.get("brandName") as string;
		const website = formData.get("website") as string;

		if (!brandId || !brandName || !website) {
			return NextResponse.json(
				{ error: "Missing required fields" },
				{ status: 400 }
			);
		}

		const brandMetadata = await getBrandMetadata(brandId);
		if (!brandMetadata) {
			return NextResponse.json(
				{ error: "Access denied: You don't have permission to create this brand" },
				{ status: 403 }
			);
		}

		let formattedWebsite = website.trim();
		if (!formattedWebsite.startsWith("http://") && !formattedWebsite.startsWith("https://")) {
			formattedWebsite = `https://${formattedWebsite}`;
		}

		const result = await createBrand({
			id: brandId,
			name: brandName,
			website: formattedWebsite,
		});

		if (!result) {
			return NextResponse.json(
				{ error: "Failed to create brand" },
				{ status: 500 }
			);
		}

		revalidatePath(`/app/${brandId}`);

		return NextResponse.json({ success: true, brand: result });
	} catch (error) {
		console.error("Error creating brand:", error);
		return NextResponse.json(
			{ error: "Failed to create brand" },
			{ status: 500 }
		);
	}
} 