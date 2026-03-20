/**
 * Server functions for brand operations.
 * Replaces apps/web/src/app/api/brands/* API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess, listUserOrganizations } from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, competitors, type BrandWithPrompts, type Brand } from "@workspace/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { cleanAndValidateDomain } from "@/lib/domain-categories";

function getDefaultBrandDomains(): string[] {
	const raw = process.env.DEFAULT_BRAND_DOMAINS;
	if (!raw) return [];
	return raw
		.split(",")
		.map((d) => d.trim())
		.filter(Boolean)
		.map((d) => cleanAndValidateDomain(d))
		.filter((d): d is string => d !== null);
}

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

		const defaultDomains = getDefaultBrandDomains();

		const result = await db
			.insert(brands)
			.values({
				id: data.brandId,
				name: data.brandName,
				website: urlValidation.formattedUrl!,
				enabled: true,
				...(defaultDomains.length > 0 && { additionalDomains: defaultDomains }),
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
			additionalDomains: z.array(z.string()).optional(),
			aliases: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const updateData: Partial<Pick<Brand, "name" | "website" | "additionalDomains" | "aliases">> = {};

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

		if (data.additionalDomains !== undefined) {
			const cleaned = data.additionalDomains.map((d) => cleanAndValidateDomain(d));
			const invalid = data.additionalDomains.filter((_, i) => !cleaned[i]);
			if (invalid.length > 0) {
				throw new Error(`Invalid domain(s): ${invalid.join(", ")}`);
			}
			updateData.additionalDomains = [...new Set(cleaned.filter(Boolean) as string[])];
		}

		if (data.aliases !== undefined) {
			updateData.aliases = [...new Set(data.aliases.map((a) => a.trim()).filter(Boolean))];
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
					domains: z.array(z.string()).min(1),
					aliases: z.array(z.string()).optional().default([]),
				}),
			),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		// Validate and clean domains
		const cleanedCompetitors = data.competitors.map((c) => {
			const cleanedDomains = c.domains.map((d) => cleanAndValidateDomain(d));
			const invalid = c.domains.filter((_, i) => !cleanedDomains[i]);
			if (invalid.length > 0) {
				throw new Error(`Invalid domain(s) for "${c.name}": ${invalid.join(", ")}`);
			}
			return {
				name: c.name,
				domains: cleanedDomains.filter(Boolean) as string[],
				aliases: c.aliases,
			};
		});

		return db.transaction(async (tx) => {
			await tx.delete(competitors).where(eq(competitors.brandId, data.brandId));

			if (cleanedCompetitors.length > 0) {
				await tx.insert(competitors).values(
					cleanedCompetitors.map((c) => ({
						brandId: data.brandId,
						name: c.name,
						domains: c.domains,
						aliases: c.aliases,
					})),
				);
			}

			return tx.query.competitors.findMany({
				where: eq(competitors.brandId, data.brandId),
			});
		});
	});

/**
 * Add an additional domain to the brand itself
 */
export const addDomainToBrandFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);

		const [result] = await db
			.update(brands)
			.set({
				additionalDomains: sql`array_append(${brands.additionalDomains}, ${domain})`,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(brands.id, data.brandId),
					sql`NOT (${domain} = ANY(${brands.additionalDomains}))`,
				),
			)
			.returning();

		if (result) return result;

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, data.brandId),
		});
		if (!brand) throw new Error("Brand not found");
		return brand;
	});

/**
 * Add a domain to an existing competitor
 */
export const addDomainToCompetitorFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			competitorId: z.string(),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const existing = await db.query.competitors.findFirst({
			where: and(eq(competitors.id, data.competitorId), eq(competitors.brandId, data.brandId)),
		});
		if (!existing) throw new Error("Competitor not found");

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);
		if (existing.domains.includes(domain)) return existing;

		const updatedDomains = [...existing.domains, domain];
		const [result] = await db
			.update(competitors)
			.set({ domains: updatedDomains, updatedAt: new Date() })
			.where(eq(competitors.id, data.competitorId))
			.returning();

		return result;
	});

/**
 * Create a new competitor from a domain
 */
export const createCompetitorFromDomainFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			name: z.string().min(1),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);

		const [currentCount] = await db
			.select({ count: count() })
			.from(competitors)
			.where(eq(competitors.brandId, data.brandId));

		if ((currentCount?.count || 0) >= MAX_COMPETITORS) {
			throw new Error(`Cannot add competitor. Maximum of ${MAX_COMPETITORS} competitors reached.`);
		}

		const [result] = await db
			.insert(competitors)
			.values({
				brandId: data.brandId,
				name: data.name.trim(),
				domains: [domain],
			})
			.returning();

		return result;
	});
