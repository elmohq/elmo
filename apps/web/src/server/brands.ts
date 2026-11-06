import { createServerFn } from "@tanstack/react-start";
import type { Entitlements } from "@workspace/config/entitlements";
import { getFanoutSupport } from "@workspace/config/fanout-support";
import { targetFilterValue } from "@workspace/config/model-filter";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDeployment } from "@workspace/deployment";
import { isValidSlug, MAX_SLUG_LENGTH, slugify } from "@workspace/lib/app-urls";
import { type BrandTrackingState, brandTrackingState } from "@workspace/lib/brand-state";
import { cleanAndValidateDomain } from "@workspace/lib/citations/domain-categories";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { type Brand, type BrandWithPrompts, brands, competitors, prompts } from "@workspace/lib/db/schema";
import {
	claimBrandSlug,
	claimNewBrandSlug,
	findUnusedBrandId,
	findUnusedBrandSlug,
	isBrandSlugAvailable,
} from "@workspace/lib/db/unique-names";
import {
	assertAllowed,
	assertCanCreateBrand,
	assertCompetitorCap,
	assertEnabledModelsAllowed,
	decideCompetitorCap,
	getOrgEntitlements,
	withQuotaLock,
} from "@workspace/lib/entitlements";
import { isGroundedApiTarget, resolveProviderAccess, selectTargetsForBrand } from "@workspace/lib/providers";
import { defaultPlatformPicks, resolvePromptRunPlan } from "@workspace/lib/run-policy";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
	requireAuthSession,
	requireBrandOrganization,
	requireBrandSession,
	requireOrgAccess,
	requirePlatformPicksEditable,
} from "@/lib/auth/helpers";
import { normalizeBrandUpdate } from "@/lib/brand-settings";
import { validateWebsiteUrl } from "@/lib/brand-website";
import type { TrackedTarget } from "@/lib/model-filter";
import { INVALID_SLUG, TAKEN_SLUG } from "@/lib/slug-errors";

/**
 * Targets rather than model ids: a model can appear twice, since scraped and
 * grounded are different answers. Anything asking "which models is this brand
 * tracking?" reads from here.
 */
function computeTrackedTargets(
	brand: Brand,
	brandPrompts: { premiumModels: string[] }[],
	entitlements: Entitlements,
): TrackedTarget[] {
	try {
		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

		// Ask the run policy rather than re-deriving it, so the page can't disagree
		// with what the worker runs. Grounded targets are assigned per prompt, so
		// the brand's set is the union across its prompts.
		const plan = resolvePromptRunPlan({
			scrapeTargets: configs,
			brand: { enabledModels: brand.enabledModels, delayOverrideHours: brand.delayOverrideHours },
			prompt: { premiumModels: [...new Set(brandPrompts.flatMap((prompt) => prompt.premiumModels))] },
			entitlements,
			defaultDelayHours: getDefaultDelayHours(),
		});

		return plan.targets.map((target) => {
			const premium = isGroundedApiTarget(target.config);
			return {
				value: targetFilterValue(target.config.model, premium),
				model: target.config.model,
				premium,
				tier: premium ? ("premium" as const) : resolveProviderAccess(target.config),
				intervalHours: target.intervalHours,
				replication: target.replication,
				...(target.config.webSearch ? { fanout: getFanoutSupport(target.config) } : {}),
			};
		});
	} catch {
		// A bad SCRAPE_TARGETS already fails boot validation; don't also crash the brand fetch.
		return [];
	}
}

/**
 * Cloud brands start with their plan's default picks written explicitly; null
 * means "follow the deployment configuration". The run policy applies the same
 * defaults when it finds null, so both paths agree for a given plan.
 */
async function initialEnabledModels(organizationId: string): Promise<string[] | null> {
	if (getDeployment().mode !== "cloud") return null;
	const entitlements = await getOrgEntitlements(organizationId);
	if (entitlements.unlimited) return null;
	const picks = defaultPlatformPicks(entitlements, parseScrapeTargets(process.env.SCRAPE_TARGETS));
	return picks.length > 0 ? picks : null;
}

/** Picks supplied at creation get the same checks as a later edit. */
async function resolveCreateEnabledModels(
	organizationId: string,
	requested: string[] | undefined,
): Promise<string[] | null> {
	if (!requested || requested.length === 0) return initialEnabledModels(organizationId);
	requirePlatformPicksEditable();
	const models = [...new Set(requested)];
	selectTargetsForBrand(parseScrapeTargets(process.env.SCRAPE_TARGETS), models);
	await assertEnabledModelsAllowed(organizationId, models);
	return models;
}

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

/** Takes entitlements from the caller so the brand list doesn't query them once per brand. */
async function getBrandWithPromptsFromDb(
	brandId: string,
	entitlements?: Entitlements,
): Promise<(BrandWithPrompts & { trackedTargets: TrackedTarget[]; trackingState: BrandTrackingState }) | undefined> {
	try {
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, brandId),
		});
		if (!brand) return undefined;

		const [brandPrompts, brandCompetitors, resolved] = await Promise.all([
			db.query.prompts.findMany({ where: eq(prompts.brandId, brandId) }),
			db.query.competitors.findMany({ where: eq(competitors.brandId, brandId) }),
			entitlements ?? getOrgEntitlements(brand.organizationId),
		]);

		return {
			...brand,
			prompts: brandPrompts,
			competitors: brandCompetitors,
			trackedTargets: computeTrackedTargets(brand, brandPrompts, resolved),
			trackingState: brandTrackingState(brand, resolved),
		};
	} catch (error) {
		console.error("Error fetching brand with prompts:", error);
		return undefined;
	}
}

export const getBrand = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const brand = await getBrandWithPromptsFromDb(data.brandId);
		if (!brand) {
			throw new Error("Brand not found");
		}

		return brand;
	});

export const createBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			brandName: z.string(),
			website: z.string(),
			/** Platform picks from the onboarding wizard; omitted → plan defaults. */
			enabledModels: z.array(z.string().min(1)).max(50).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);
		// This legacy path fills an empty org's first brand (brandId here IS the
		// org id), so the brand count gate applies to that org.
		await assertCanCreateBrand(data.brandId);

		const urlValidation = validateWebsiteUrl(data.website);
		if (!urlValidation.isValid) {
			throw new Error(urlValidation.error);
		}

		const defaultDomains = getDefaultBrandDomains();
		const enabledModels = await resolveCreateEnabledModels(data.brandId, data.enabledModels);
		const created = await claimNewBrandSlug(() =>
			db.transaction(async (tx) => {
				const slug = await findUnusedBrandSlug(data.brandId, slugify(data.brandName, "brand"), tx);
				return (
					tx
						.insert(brands)
						.values({
							id: data.brandId,
							organizationId: data.brandId,
							name: data.brandName,
							slug,
							website: urlValidation.formattedUrl,
							enabled: true,
							...(enabledModels && { enabledModels }),
							...(defaultDomains.length > 0 && { additionalDomains: defaultDomains }),
						})
						// Targeted at the id: the fallback below reads back by id, so
						// swallowing a slug conflict would find nothing and report a failure
						// that isn't one.
						.onConflictDoNothing({ target: brands.id })
						.returning()
				);
			}),
		);

		const brand =
			created[0] ??
			(await db.query.brands.findFirst({
				where: eq(brands.id, data.brandId),
			}));

		if (!brand) {
			throw new Error("Failed to create brand");
		}

		return { success: true, brand };
	});

/** A brand in an existing organization, with an id of its own rather than the org's. */
export const createBrandInOrgFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandName: z.string().min(1).max(100),
			website: z.string().min(1),
			organizationId: z.string(),
			/** Platform picks from the creation wizard; omitted → plan defaults. */
			enabledModels: z.array(z.string().min(1)).max(50).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const deployment = getDeployment();

		if (!deployment.features.canCreateBrands) {
			throw new Error("Brand creation is not allowed in this deployment");
		}

		const urlValidation = validateWebsiteUrl(data.website);
		if (!urlValidation.isValid) {
			throw new Error(urlValidation.error);
		}

		const trimmedName = data.brandName.trim();
		if (!trimmedName) {
			throw new Error("Brand name must be a non-empty string");
		}

		const orgId = data.organizationId;
		await requireOrgAccess(session.user.id, orgId);
		await assertCanCreateBrand(orgId);

		const baseSlug = slugify(trimmedName, "brand");
		const defaultDomains = getDefaultBrandDomains();
		const enabledModels = await resolveCreateEnabledModels(orgId, data.enabledModels);

		return claimNewBrandSlug(() =>
			db.transaction(async (tx) => {
				const brandId = await findUnusedBrandId(baseSlug, tx);
				const slug = await findUnusedBrandSlug(orgId, baseSlug, tx);

				await tx.insert(brands).values({
					id: brandId,
					organizationId: orgId,
					name: trimmedName,
					slug,
					website: urlValidation.formattedUrl,
					enabled: true,
					...(enabledModels && { enabledModels }),
					...(defaultDomains.length > 0 && { additionalDomains: defaultDomains }),
				});

				return { brandId, brandSlug: slug };
			}),
		);
	});

export const updateBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			name: z.string().optional(),
			website: z.string().optional(),
			slug: z.string().trim().toLowerCase().max(MAX_SLUG_LENGTH).optional(),
			additionalDomains: z.array(z.string()).optional(),
			aliases: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const org = await requireBrandOrganization(session.user.id, data.brandId);

		if (data.slug !== undefined && !isValidSlug(data.slug)) throw new Error(INVALID_SLUG);

		const normalized = normalizeBrandUpdate({
			name: data.name,
			website: data.website,
			additionalDomains: data.additionalDomains,
			aliases: data.aliases,
		});
		if (!normalized.ok) {
			throw new Error(normalized.error);
		}
		const updateData = normalized.updates;

		const result = await claimBrandSlug(
			() =>
				db.transaction(async (tx) => {
					if (
						data.slug !== undefined &&
						!(await isBrandSlugAvailable(org.id, data.slug, { excludeBrandId: data.brandId, conn: tx }))
					) {
						throw new Error(TAKEN_SLUG);
					}
					return tx
						.update(brands)
						.set({ ...updateData, ...(data.slug !== undefined && { slug: data.slug }), updatedAt: new Date() })
						.where(eq(brands.id, data.brandId))
						.returning();
				}),
			TAKEN_SLUG,
		);

		if (!result[0]) {
			throw new Error("Failed to update brand");
		}

		return result[0];
	});

export const getCompetitors = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		return db.query.competitors.findMany({
			where: eq(competitors.brandId, data.brandId),
		});
	});

export const updateCompetitors = createServerFn({ method: "POST" })
	.validator(
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
		await requireBrandSession(data.brandId);

		// A bulk replace, so the list submitted is the list the brand ends up with.
		assertAllowed(decideCompetitorCap(data.competitors.length));

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

export const addDomainToBrandFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);

		const [result] = await db
			.update(brands)
			.set({
				additionalDomains: sql`array_append(${brands.additionalDomains}, ${domain})`,
				updatedAt: new Date(),
			})
			.where(and(eq(brands.id, data.brandId), sql`NOT (${domain} = ANY(${brands.additionalDomains}))`))
			.returning();

		if (result) return result;

		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, data.brandId),
		});
		if (!brand) throw new Error("Brand not found");
		return brand;
	});

export const addDomainToCompetitorFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			competitorId: z.string(),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

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

export const createCompetitorFromDomainFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			name: z.string().min(1),
			domain: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const org = await requireBrandOrganization(session.user.id, data.brandId);

		const domain = cleanAndValidateDomain(data.domain);
		if (!domain) throw new Error(`Invalid domain: ${data.domain}`);

		// Check and insert under one lock: otherwise two requests on a brand's
		// last competitor slot both pass the check.
		return await withQuotaLock(org.id, async (tx) => {
			await assertCompetitorCap(data.brandId, 1, tx);

			const [result] = await tx
				.insert(competitors)
				.values({
					brandId: data.brandId,
					name: data.name.trim(),
					domains: [domain],
				})
				.returning();

			return result;
		});
	});
