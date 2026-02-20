/**
 * Server functions for brand operations.
 * Replaces apps/web/src/app/api/brands/* API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess, listUserOrganizations } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, competitors, type BrandWithPrompts, type Brand } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// Helper functions (migrated from apps/web/src/lib/metadata.ts)
// ============================================================================

async function getBrandWithPromptsFromDb(brandId: string): Promise<BrandWithPrompts | undefined> {
	try {
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, brandId),
		});
		if (!brand) return undefined;

		const brandPrompts = await db.query.prompts.findMany({
			where: eq(prompts.brandId, brandId),
		});
		const brandCompetitors = await db.query.competitors.findMany({
			where: eq(competitors.brandId, brandId),
		});

		return { ...brand, prompts: brandPrompts, competitors: brandCompetitors };
	} catch (error) {
		console.error("Error fetching brand with prompts:", error);
		return undefined;
	}
}

function validateWebsiteUrl(url: string): { isValid: boolean; formattedUrl?: string; error?: string } {
	if (!url || url.trim() === "") {
		return { isValid: false, error: "Website URL is required" };
	}
	let formattedUrl = url.trim();
	if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
		formattedUrl = `https://${formattedUrl}`;
	}
	try {
		const urlObj = new URL(formattedUrl);
		if (!["http:", "https:"].includes(urlObj.protocol)) {
			return { isValid: false, error: "Website URL must use http or https protocol" };
		}
		if (!urlObj.hostname || urlObj.hostname.length === 0) {
			return { isValid: false, error: "Website URL must have a valid domain name" };
		}
		return { isValid: true, formattedUrl };
	} catch {
		return { isValid: false, error: "Please enter a valid website URL" };
	}
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get all brands the current user has access to
 */
export const getBrands = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireAuthSession();
	const userBrands = await listUserOrganizations(session.user.id);

	if (!userBrands || userBrands.length === 0) {
		return [];
	}

	const brandsData = await Promise.all(
		userBrands.map(async (userBrand) => {
			const dbBrand = await getBrandWithPromptsFromDb(userBrand.id);
			return dbBrand ? { ...dbBrand, name: dbBrand.name } : null;
		}),
	);

	return brandsData.filter((brand): brand is BrandWithPrompts => brand !== null);
});

/**
 * Get a single brand by ID
 */
export const getBrand = createServerFn({ method: "GET" })
	.inputValidator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const brand = await getBrandWithPromptsFromDb(data.brandId);
		if (!brand) {
			throw new Error("Brand not found");
		}

		return brand;
	});

/**
 * Create a new brand
 */
export const createBrandFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			brandName: z.string(),
			website: z.string(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const urlValidation = validateWebsiteUrl(data.website);
		if (!urlValidation.isValid) {
			throw new Error(urlValidation.error);
		}

		const result = await db
			.insert(brands)
			.values({
				id: data.brandId,
				name: data.brandName,
				website: urlValidation.formattedUrl!,
				enabled: true,
			})
			.returning();

		if (!result[0]) {
			throw new Error("Failed to create brand");
		}

		return { success: true, brand: result[0] };
	});

/**
 * Update a brand
 */
export const updateBrandFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			name: z.string().optional(),
			website: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const updateData: Partial<Pick<Brand, "name" | "website">> = {};

		if (data.name !== undefined) {
			if (!data.name.trim()) {
				throw new Error("Brand name must be a non-empty string");
			}
			updateData.name = data.name.trim();
		}

		if (data.website !== undefined) {
			const urlValidation = validateWebsiteUrl(data.website);
			if (!urlValidation.isValid) {
				throw new Error(urlValidation.error);
			}
			updateData.website = urlValidation.formattedUrl;
		}

		const result = await db
			.update(brands)
			.set({ ...updateData, updatedAt: new Date() })
			.where(eq(brands.id, data.brandId))
			.returning();

		if (!result[0]) {
			throw new Error("Failed to update brand");
		}

		return result[0];
	});

/**
 * Get competitors for a brand
 */
export const getCompetitors = createServerFn({ method: "GET" })
	.inputValidator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		return db.query.competitors.findMany({
			where: eq(competitors.brandId, data.brandId),
		});
	});

/**
 * Update competitors for a brand (bulk replace)
 */
export const updateCompetitors = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			competitors: z.array(
				z.object({
					name: z.string(),
					domain: z.string(),
				}),
			),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		// Delete existing competitors
		await db.delete(competitors).where(eq(competitors.brandId, data.brandId));

		// Insert new competitors
		if (data.competitors.length > 0) {
			await db.insert(competitors).values(
				data.competitors.map((c) => ({
					brandId: data.brandId,
					name: c.name,
					domain: c.domain,
				})),
			);
		}

		return db.query.competitors.findMany({
			where: eq(competitors.brandId, data.brandId),
		});
	});
