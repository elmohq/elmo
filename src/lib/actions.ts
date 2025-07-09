"use server";

import { createBrand, getBrandMetadata } from "./metadata";
import { revalidatePath } from "next/cache";

export async function createBrandAction(formData: FormData) {
	const brandId = formData.get("brandId") as string;
	const brandName = formData.get("brandName") as string;
	const website = formData.get("website") as string;

	if (!brandId || !brandName || !website) {
		throw new Error("Missing required fields");
	}

	// Validate that the user has access to this brand
	const brandMetadata = await getBrandMetadata(brandId);
	if (!brandMetadata) {
		throw new Error("Access denied: You don't have permission to create this brand");
	}

	// Add https:// if no protocol is specified
	let formattedWebsite = website.trim();
	if (!formattedWebsite.startsWith("http://") && !formattedWebsite.startsWith("https://")) {
		formattedWebsite = `https://${formattedWebsite}`;
	}

	try {
		const result = await createBrand({
			id: brandId,
			name: brandName,
			website: formattedWebsite,
		});

		if (!result) {
			throw new Error("Failed to create brand");
		}

		// Revalidate the page to show the new state
		revalidatePath(`/app/${brandId}`);
		
		return { success: true, brand: result };
	} catch (error) {
		console.error("Error creating brand:", error);
		throw new Error("Failed to create brand");
	}
} 