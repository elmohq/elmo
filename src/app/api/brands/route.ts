import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs, getBrandFromDb, getBrandWithPrompts, createBrand, getBrandMetadata } from "@/lib/metadata";
import { auth0 } from "@/lib/auth0";
import { revalidatePath } from "next/cache";

export async function GET(request: NextRequest) {
	try {
		const userBrands = await getElmoOrgs();

		if (!userBrands || userBrands.length === 0) {
			return NextResponse.json([]);
		}

		const brands = await Promise.all(
			userBrands.map(async (userBrand) => {
				const dbBrand = await getBrandWithPrompts(userBrand.id);
				return dbBrand
					? {
							...dbBrand,
							name: dbBrand.name,
						}
					: null;
			}),
		);

		const validBrands = brands.filter((brand) => brand !== null);

		return NextResponse.json(validBrands);
	} catch (error) {
		console.error("Error fetching brands:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

function validateWebsiteUrl(url: string): { isValid: boolean; formattedUrl?: string; error?: string } {
	if (!url || url.trim() === "") {
		return { isValid: false, error: "Website URL is required" };
	}

	let formattedUrl = url.trim();

	// Add https:// if no protocol is specified
	if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
		formattedUrl = `https://${formattedUrl}`;
	}

	try {
		const urlObj = new URL(formattedUrl);

		// Check if protocol is http or https
		if (!["http:", "https:"].includes(urlObj.protocol)) {
			return { isValid: false, error: "Website URL must use http or https protocol" };
		}

		// Check if hostname exists
		if (!urlObj.hostname || urlObj.hostname.length === 0) {
			return { isValid: false, error: "Website URL must have a valid domain name" };
		}

		return { isValid: true, formattedUrl };
	} catch (error) {
		return { isValid: false, error: "Please enter a valid website URL" };
	}
}

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const brandId = formData.get("brandId") as string;
		const brandName = formData.get("brandName") as string;
		const website = formData.get("website") as string;

		if (!brandId || !brandName || !website) {
			return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
		}

		const brandMetadata = await getBrandMetadata(brandId);
		if (!brandMetadata) {
			return NextResponse.json(
				{ error: "Access denied: You don't have permission to create this brand" },
				{ status: 403 },
			);
		}

		// Validate website URL
		const urlValidation = validateWebsiteUrl(website);
		if (!urlValidation.isValid) {
			return NextResponse.json({ error: urlValidation.error }, { status: 400 });
		}

		const formattedWebsite = urlValidation.formattedUrl!;

		const result = await createBrand({
			id: brandId,
			name: brandName,
			website: formattedWebsite,
		});

		if (!result) {
			return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
		}

		revalidatePath(`/app/${brandId}`);

		return NextResponse.json({ success: true, brand: result });
	} catch (error) {
		console.error("Error creating brand:", error);
		return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
	}
}
