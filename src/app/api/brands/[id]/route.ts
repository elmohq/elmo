import { NextRequest, NextResponse } from "next/server";
import { getElmoOrgs, getBrandFromDb, getBrandWithPrompts, updateBrand } from "@/lib/metadata";
import { auth0 } from "@/lib/auth0";
import { revalidatePath } from "next/cache";
import { getTinybirdBrandEarliestRunDate } from "@/lib/tinybird-read";

// URL validation function
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

type Params = {
	id: string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;

		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		// Fetch brand data and earliest run date in parallel
		const [brand, earliestDataDate] = await Promise.all([
			getBrandWithPrompts(brandId),
			getTinybirdBrandEarliestRunDate(brandId),
		]);

		if (!brand) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}

		const metadataBrand = userBrands.find((b) => b.id === brandId);

		return NextResponse.json({
			...brand,
			name: brand.name || metadataBrand?.name || brand.name,
			earliestDataDate,
		});
	} catch (error) {
		console.error("Error fetching brand:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function PUT(request: NextRequest, { params }: { params: Promise<Params> }) {
	try {
		const { id: brandId } = await params;
		const body = await request.json();

		const userBrands = await getElmoOrgs();
		const hasAccess = userBrands.some((brand) => brand.id === brandId);

		if (!hasAccess) {
			return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
		}

		const existingBrand = await getBrandFromDb(brandId);
		if (!existingBrand) {
			return NextResponse.json({ error: "Brand not found" }, { status: 404 });
		}

		// Validate and format website URL if provided
		let updateData: { website?: string; name?: string } = {};

		if (body.name !== undefined) {
			if (typeof body.name !== "string" || !body.name.trim()) {
				return NextResponse.json({ error: "Brand name must be a non-empty string" }, { status: 400 });
			}
			updateData.name = body.name.trim();
		}

		if (body.website !== undefined) {
			// Validate website URL
			const urlValidation = validateWebsiteUrl(body.website);
			if (!urlValidation.isValid) {
				return NextResponse.json({ error: urlValidation.error }, { status: 400 });
			}
			updateData.website = urlValidation.formattedUrl;
		}

		const updatedBrand = await updateBrand(brandId, updateData);

		if (!updatedBrand) {
			return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
		}

		revalidatePath(`/app/${brandId}`);
		revalidatePath(`/app/${brandId}/settings`);

		const metadataBrand = userBrands.find((b) => b.id === brandId);

		return NextResponse.json({
			...updatedBrand,
			name: updatedBrand.name || metadataBrand?.name || updatedBrand.name,
		});
	} catch (error) {
		console.error("Error updating brand:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
