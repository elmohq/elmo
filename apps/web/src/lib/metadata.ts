import { db } from "@workspace/lib/db/db";
import { brands, prompts, competitors, type Brand, type NewBrand, type BrandWithPrompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import {
	getOrganizations,
	clearAuthCache,
	isAdmin as configIsAdmin,
	hasReportGeneratorAccess as configHasReportGeneratorAccess,
} from "./config";

/**
 * Organization metadata type (backwards compatible alias)
 */
export type ElmoBrandMetadata = {
	id: string;
	name: string;
};

/**
 * Get organizations the current user has access to
 * 
 * This function delegates to the config module which handles
 * different deployment modes (whitelabel, local, demo).
 */
export async function getElmoOrgs(forceRefresh = false): Promise<ElmoBrandMetadata[]> {
	if (forceRefresh) {
		await clearAuthCache();
	}
	return getOrganizations();
}

/**
 * Clear the app metadata cache
 * 
 * @deprecated Use clearAuthCache() from @/lib/config instead
 */
export async function clearAppMetadataCache(): Promise<void> {
	return clearAuthCache();
}

export async function getBrandFromDb(brandId: string): Promise<Brand | undefined> {
	try {
		const result = await db.query.brands.findFirst({
			where: eq(brands.id, brandId),
		});
		return result;
	} catch (error) {
		console.error("Error fetching brand from database:", error);
		return undefined;
	}
}

export async function getBrandWithPrompts(brandId: string): Promise<BrandWithPrompts | undefined> {
	try {
		// Get the brand
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, brandId),
		});

		if (!brand) {
			return undefined;
		}

		// Get the prompts for this brand
		const brandPrompts = await db.query.prompts.findMany({
			where: eq(prompts.brandId, brandId),
		});

		// Get the competitors for this brand
		const brandCompetitors = await db.query.competitors.findMany({
			where: eq(competitors.brandId, brandId),
		});

		return {
			...brand,
			prompts: brandPrompts,
			competitors: brandCompetitors,
		};
	} catch (error) {
		console.error("Error fetching brand with prompts from database:", error);
		return undefined;
	}
}

export async function getAllBrandsWithPrompts(): Promise<BrandWithPrompts[]> {
	try {
		// Get all brands
		const allBrands = await db.query.brands.findMany();

		if (allBrands.length === 0) {
			return [];
		}

		// Get all prompts
		const allPrompts = await db.query.prompts.findMany();

		// Get all competitors
		const allCompetitors = await db.query.competitors.findMany();

		// Group prompts by brandId
		const promptsByBrand = allPrompts.reduce(
			(acc, prompt) => {
				if (!acc[prompt.brandId]) {
					acc[prompt.brandId] = [];
				}
				acc[prompt.brandId].push(prompt);
				return acc;
			},
			{} as Record<string, typeof allPrompts>,
		);

		// Group competitors by brandId
		const competitorsByBrand = allCompetitors.reduce(
			(acc, competitor) => {
				if (!acc[competitor.brandId]) {
					acc[competitor.brandId] = [];
				}
				acc[competitor.brandId].push(competitor);
				return acc;
			},
			{} as Record<string, typeof allCompetitors>,
		);

		// Combine brands with their prompts and competitors
		return allBrands.map((brand) => ({
			...brand,
			prompts: promptsByBrand[brand.id] || [],
			competitors: competitorsByBrand[brand.id] || [],
		}));
	} catch (error) {
		console.error("Error fetching brands with prompts from database:", error);
		return [];
	}
}

export async function createBrand(brandData: { id: string; name: string; website: string }): Promise<Brand | null> {
	try {
		const newBrand: NewBrand = {
			id: brandData.id,
			name: brandData.name,
			website: brandData.website,
			enabled: true,
		};

		const result = await db.insert(brands).values(newBrand).returning();
		return result[0] || null;
	} catch (error) {
		console.error("Error creating brand in database:", error);
		return null;
	}
}

export async function updateBrand(
	brandId: string,
	brandData: Partial<Pick<Brand, "name" | "website" | "enabled" | "onboarded" | "delayOverrideMs">>,
): Promise<Brand | null> {
	try {
		const result = await db
			.update(brands)
			.set({ ...brandData, updatedAt: new Date() })
			.where(eq(brands.id, brandId))
			.returning();
		return result[0] || null;
	} catch (error) {
		console.error("Error updating brand in database:", error);
		return null;
	}
}

export async function getBrandMetadata(brandId: string): Promise<undefined | ElmoBrandMetadata> {
	const orgs = await getElmoOrgs();
	return orgs.find((org) => org.id === brandId);
}

/**
 * Check if the current user has report generator access
 */
export async function hasReportGeneratorAccess(): Promise<boolean> {
	return configHasReportGeneratorAccess();
}

/**
 * Check if the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
	return configIsAdmin();
}
