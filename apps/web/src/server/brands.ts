/**
 * Server functions for brand operations.
 * Replaces apps/web/src/app/api/brands/* API routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthSession, requireOrgAccess, listUserOrganizations } from "@/lib/auth/helpers";
import { evaluateRequireCanCreateBrands } from "@/lib/auth/policies";
import { getDeployment } from "@/lib/config/server";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	prompts,
	competitors,
	type BrandWithPrompts,
	type Prompt,
	type Competitor,
} from "@workspace/lib/db/schema";
import { provisionAdditionalLocalOrg } from "@workspace/lib/db/provisioning";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import { MAX_COMPETITORS, getDefaultDelayHours } from "@workspace/lib/constants";
import { cleanAndValidateDomain } from "@/lib/domain-categories";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { normalizeBrandUpdate } from "@/lib/brand-settings";
import { getProvider } from "@workspace/lib/providers";
import type { ModelConfig } from "@workspace/lib/providers";
import { getEntitlements } from "@workspace/lib/config/entitlements";
import {
	type ConfigRow,
	type EffectiveTargetsResult,
	type ExclusionReason,
	configRowsForBrand,
	fetchConfigRowsForBrands,
	getInstanceCatalog,
	mergeConfigRows,
	resolveBrandTargets,
	resolveEffectiveTargets,
} from "@workspace/lib/config/resolve";
import { assertBrandLimit } from "@/server/config-enforcement";

/**
 * The run-config slice of a brand response, resolved from the config hierarchy.
 *
 * `effectiveModels` / `effectiveModelConfigs` keep the legacy response shape
 * (flat model ids; provider/version/webSearch metadata) so the filter bar, the
 * LLMs page, and every other consumer keep working. `excludedTargets` (the B2
 * exclusion reasons) and `resolvedCadenceHours` are new surface for the config
 * UI round.
 */
export interface BrandRunConfig {
	effectiveModels: string[];
	effectiveModelConfigs: ModelConfig[];
	excludedTargets: { model: string; provider: string; reasons: ExclusionReason[] }[];
	resolvedCadenceHours: number;
}

function toBrandRunConfig(result: EffectiveTargetsResult, rows: ConfigRow[]): BrandRunConfig {
	const cadence = mergeConfigRows(rows, {}).cadenceHours;
	return {
		effectiveModels: result.targets.map((t) => t.model),
		effectiveModelConfigs: result.targets.map((t) => ({
			model: t.model,
			provider: t.provider,
			version: t.version,
			webSearch: t.webSearch,
		})),
		excludedTargets: result.excluded.map((e) => ({
			model: e.target.model,
			provider: e.target.provider,
			reasons: e.reasons,
		})),
		// With no row anywhere the registry default and DEFAULT_DELAY_HOURS can
		// differ pre-import; the env value is what the fleet actually runs, so
		// prefer it for display/scheduling parity.
		resolvedCadenceHours: cadence.provenance === "default" ? getDefaultDelayHours() : cadence.value,
	};
}

/** Memoized per-provider credential probe shared across a batch resolve (fail-closed). */
function makeCredentialsReady(): (providerId: string) => boolean {
	const cache = new Map<string, boolean>();
	return (providerId) => {
		let ready = cache.get(providerId);
		if (ready === undefined) {
			try {
				ready = getProvider(providerId).isConfigured();
			} catch {
				ready = false;
			}
			cache.set(providerId, ready);
		}
		return ready;
	};
}

export type BrandWithRunConfig = BrandWithPrompts & BrandRunConfig;

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

async function getBrandWithPromptsFromDb(brandId: string): Promise<BrandWithRunConfig | undefined> {
	try {
		const brand = await db.query.brands.findFirst({
			where: eq(brands.id, brandId),
		});
		if (!brand) return undefined;

		const [brandPrompts, brandCompetitors, resolution] = await Promise.all([
			db.query.prompts.findMany({ where: eq(prompts.brandId, brandId) }),
			db.query.competitors.findMany({ where: eq(competitors.brandId, brandId) }),
			resolveBrandTargets(brand, brand.organizationId, { credentialsReady: makeCredentialsReady() }),
		]);

		return {
			...brand,
			prompts: brandPrompts,
			competitors: brandCompetitors,
			...toBrandRunConfig(resolution, resolution.rows),
		};
	} catch (error) {
		console.error("Error fetching brand with prompts:", error);
		return undefined;
	}
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get all brands the current user has access to.
 *
 * Org scoping is the access-control mechanism: we resolve the orgs the user is
 * a member of and return only brands owned by those orgs (`brands.organization_id
 * IN (...)`). A user in org A never sees org B's brands.
 *
 * Batch resolution (A8d): one config-row fetch for every org+brand, one catalog
 * read, one entitlement lookup per distinct org — then the pure resolver runs
 * per brand with no further awaits.
 */
export const getBrands = createServerFn({ method: "GET" }).handler(async (): Promise<BrandWithRunConfig[]> => {
	const session = await requireAuthSession();
	const userOrgs = await listUserOrganizations(session.user.id);
	const orgIds = userOrgs.map((o) => o.id);

	if (orgIds.length === 0) {
		return [];
	}

	const scopedBrands = await db.query.brands.findMany({
		where: inArray(brands.organizationId, orgIds),
	});
	if (scopedBrands.length === 0) {
		return [];
	}

	const brandIds = scopedBrands.map((b) => b.id);
	const brandOrgIds = [...new Set(scopedBrands.map((b) => b.organizationId))];

	const [allPrompts, allCompetitors, batchRows, catalog, entitlementEntries] = await Promise.all([
		db.query.prompts.findMany({ where: inArray(prompts.brandId, brandIds) }),
		db.query.competitors.findMany({ where: inArray(competitors.brandId, brandIds) }),
		fetchConfigRowsForBrands(brandOrgIds, brandIds),
		getInstanceCatalog(),
		Promise.all(brandOrgIds.map(async (orgId) => [orgId, await getEntitlements(orgId)] as const)),
	]);
	const entitlementsByOrg = new Map(entitlementEntries);

	const promptsByBrand = new Map<string, Prompt[]>();
	for (const prompt of allPrompts) {
		const list = promptsByBrand.get(prompt.brandId);
		if (list) list.push(prompt);
		else promptsByBrand.set(prompt.brandId, [prompt]);
	}
	const competitorsByBrand = new Map<string, Competitor[]>();
	for (const competitor of allCompetitors) {
		const list = competitorsByBrand.get(competitor.brandId);
		if (list) list.push(competitor);
		else competitorsByBrand.set(competitor.brandId, [competitor]);
	}

	const credentialsReady = makeCredentialsReady();

	return scopedBrands.map((brand) => {
		const rows = configRowsForBrand(batchRows, brand.organizationId, brand.id);
		const result = resolveEffectiveTargets({
			catalog,
			entitlements: entitlementsByOrg.get(brand.organizationId)!,
			rows,
			level: "brand",
			credentialsReady,
		});
		return {
			...brand,
			prompts: promptsByBrand.get(brand.id) ?? [],
			competitors: competitorsByBrand.get(brand.id) ?? [],
			...toBrandRunConfig(result, rows),
		};
	});
});

/**
 * Get a single brand by ID
 */
export const getBrand = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
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
	.validator(
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
				// brandId is the org id from the URL (access verified above); the
				// brand belongs to that org.
				organizationId: data.brandId,
				name: data.brandName,
				website: urlValidation.formattedUrl,
				enabled: true,
				...(defaultDomains.length > 0 && { additionalDomains: defaultDomains }),
			})
			.onConflictDoNothing()
			.returning();

		const brand =
			result[0] ??
			(await db.query.brands.findFirst({
				where: eq(brands.id, data.brandId),
			}));

		if (!brand) {
			throw new Error("Failed to create brand");
		}

		return { success: true, brand };
	});

/**
 * Create a new organization + admin membership + brand in one shot for the
 * current user. Used by the local-mode multi-brand "create new brand" flow on
 * the brand switcher. Gated by the canCreateBrands deployment feature so
 * whitelabel (orgs come from Auth0) and demo (read-only) reject it.
 */
export const createBrandWithOrgFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandName: z.string().min(1).max(100),
			website: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const deployment = getDeployment();

		if (evaluateRequireCanCreateBrands(deployment.features.canCreateBrands) === "deny") {
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

		// maxBrands gate (§7), BEFORE provisioning. Counts every brand the caller's
		// orgs own against the primary org's plan — exact under the umbrella-org
		// model (one org holds all brands) and the local legacy layout (one org per
		// brand, all held by the same user). Non-cloud entitlements are unlimited,
		// so this is inert outside cloud.
		const userOrgs = await listUserOrganizations(session.user.id);
		if (userOrgs.length > 0) {
			const entitlements = await getEntitlements(userOrgs[0].id);
			if (entitlements.maxBrands !== null) {
				const [row] = await db
					.select({ count: count() })
					.from(brands)
					.where(
						inArray(
							brands.organizationId,
							userOrgs.map((o) => o.id),
						),
					);
				assertBrandLimit(entitlements, Number(row?.count ?? 0));
			}
		}

		const { orgId } = await provisionAdditionalLocalOrg({
			userId: session.user.id,
			name: trimmedName,
		});

		const defaultDomains = getDefaultBrandDomains();

		await db.insert(brands).values({
			id: orgId,
			organizationId: orgId,
			name: trimmedName,
			website: urlValidation.formattedUrl,
			enabled: true,
			...(defaultDomains.length > 0 && { additionalDomains: defaultDomains }),
		});

		return { brandId: orgId };
	});

/**
 * Update a brand
 */
export const updateBrandFn = createServerFn({ method: "POST" })
	.validator(
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
	.validator(z.object({ brandId: z.string() }))
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
	.validator(
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
			.where(and(eq(brands.id, data.brandId), sql`NOT (${domain} = ANY(${brands.additionalDomains}))`))
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
	.validator(
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
	.validator(
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
