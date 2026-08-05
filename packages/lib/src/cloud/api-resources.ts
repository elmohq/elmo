import { and, count, desc, eq } from "drizzle-orm";
import { MAX_COMPETITORS } from "../constants";
import { db } from "../db/db";
import { brands, competitors, prompts } from "../db/schema";
import {
	assertCapacity,
	assertCapacityChange,
	EntitlementAccessError,
	withOrganizationEntitlementTransaction,
} from "./capacity";
import { type PromptMutation, saveOrganizationPromptsInTransaction } from "./prompt-mutations";
import { initializeDefaultBrandTracking } from "./tracking-defaults";

// Keep cloud API persistence behind one organization-aware boundary: callers
// cannot obtain an unscoped query, and every write re-resolves access and plan
// capacity after taking the organization advisory lock.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbConnection = typeof db | DbTransaction;

export class OrganizationResourceNotFoundError extends Error {
	constructor(
		public readonly resource: "brand" | "prompt" | "competitor",
		public readonly resourceId: string,
	) {
		super(`${resource[0]?.toUpperCase()}${resource.slice(1)} with ID '${resourceId}' not found`);
		this.name = "OrganizationResourceNotFoundError";
	}
}

export class OrganizationResourceConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "OrganizationResourceConflictError";
	}
}

export function assertOrganizationCompetitorLimit(currentTotal: number, adding: number): void {
	if (currentTotal + adding > MAX_COMPETITORS) {
		throw new OrganizationResourceConflictError(
			`Brand may have at most ${MAX_COMPETITORS} competitors (currently ${currentTotal}, adding ${adding}).`,
		);
	}
}

export type OrganizationResourcePage<T> = {
	items: T[];
	total: number;
};

export type CreateOrganizationApiBrandInput = {
	organizationId: string;
	id: string;
	name: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	competitors: Array<{ name: string; domains: string[]; aliases: string[] }>;
	prompts: Array<{ value: string; enabled: boolean; tags: string[] }>;
};

export type UpdateOrganizationApiBrandInput = {
	organizationId: string;
	brandId: string;
	name?: string;
	website?: string;
	additionalDomains?: string[];
	aliases?: string[];
	enabled?: boolean;
};

export type CreateOrganizationApiPromptInput = {
	organizationId: string;
	brandId: string;
	value: string;
	tags: string[];
};

export type UpdateOrganizationApiPromptInput = {
	organizationId: string;
	promptId: string;
	value?: string;
	enabled?: boolean;
	tags?: string[];
};

export type CreateOrganizationApiCompetitorInput = {
	organizationId: string;
	brandId: string;
	name: string;
	domains: string[];
	aliases: string[];
};

export type UpdateOrganizationApiCompetitorInput = {
	organizationId: string;
	competitorId: string;
	name?: string;
	domains?: string[];
	aliases?: string[];
};

async function findOrganizationBrand(conn: DbConnection, organizationId: string, brandId: string) {
	const [brand] = await conn
		.select()
		.from(brands)
		.where(and(eq(brands.organizationId, organizationId), eq(brands.id, brandId)))
		.limit(1);
	return brand;
}

async function findOrganizationPrompt(conn: DbConnection, organizationId: string, promptId: string) {
	const [prompt] = await conn
		.select({
			id: prompts.id,
			brandId: prompts.brandId,
			value: prompts.value,
			enabled: prompts.enabled,
			tags: prompts.tags,
			systemTags: prompts.systemTags,
			createdAt: prompts.createdAt,
			updatedAt: prompts.updatedAt,
		})
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.id, promptId)))
		.limit(1);
	return prompt;
}

async function findOrganizationCompetitor(conn: DbConnection, organizationId: string, competitorId: string) {
	const [competitor] = await conn
		.select({
			id: competitors.id,
			brandId: competitors.brandId,
			name: competitors.name,
			domains: competitors.domains,
			aliases: competitors.aliases,
			createdAt: competitors.createdAt,
			updatedAt: competitors.updatedAt,
		})
		.from(competitors)
		.innerJoin(brands, eq(brands.id, competitors.brandId))
		.where(and(eq(brands.organizationId, organizationId), eq(competitors.id, competitorId)))
		.limit(1);
	return competitor;
}

export async function listOrganizationApiBrands(input: {
	organizationId: string;
	limit: number;
	offset: number;
}): Promise<OrganizationResourcePage<typeof brands.$inferSelect>> {
	const [{ value: total = 0 } = { value: 0 }] = await db
		.select({ value: count() })
		.from(brands)
		.where(eq(brands.organizationId, input.organizationId));
	const items = await db
		.select()
		.from(brands)
		.where(eq(brands.organizationId, input.organizationId))
		.orderBy(desc(brands.createdAt))
		.limit(input.limit)
		.offset(input.offset);
	return { items, total };
}

export async function getOrganizationApiBrand(organizationId: string, brandId: string) {
	const brand = await findOrganizationBrand(db, organizationId, brandId);
	if (!brand) throw new OrganizationResourceNotFoundError("brand", brandId);
	return brand;
}

export async function listOrganizationApiPrompts(input: {
	organizationId: string;
	brandId?: string;
	limit: number;
	offset: number;
}): Promise<OrganizationResourcePage<typeof prompts.$inferSelect>> {
	const predicate = and(
		eq(brands.organizationId, input.organizationId),
		...(input.brandId ? [eq(prompts.brandId, input.brandId)] : []),
	);
	const [{ value: total = 0 } = { value: 0 }] = await db
		.select({ value: count() })
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(predicate);
	const items = await db
		.select({
			id: prompts.id,
			brandId: prompts.brandId,
			value: prompts.value,
			enabled: prompts.enabled,
			tags: prompts.tags,
			systemTags: prompts.systemTags,
			createdAt: prompts.createdAt,
			updatedAt: prompts.updatedAt,
		})
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(predicate)
		.orderBy(desc(prompts.createdAt))
		.limit(input.limit)
		.offset(input.offset);
	return { items, total };
}

export async function getOrganizationApiPrompt(organizationId: string, promptId: string) {
	const prompt = await findOrganizationPrompt(db, organizationId, promptId);
	if (!prompt) throw new OrganizationResourceNotFoundError("prompt", promptId);
	return prompt;
}

export async function listOrganizationApiCompetitors(input: {
	organizationId: string;
	brandId?: string;
	limit: number;
	offset: number;
}): Promise<OrganizationResourcePage<typeof competitors.$inferSelect>> {
	const predicate = and(
		eq(brands.organizationId, input.organizationId),
		...(input.brandId ? [eq(competitors.brandId, input.brandId)] : []),
	);
	const [{ value: total = 0 } = { value: 0 }] = await db
		.select({ value: count() })
		.from(competitors)
		.innerJoin(brands, eq(brands.id, competitors.brandId))
		.where(predicate);
	const items = await db
		.select({
			id: competitors.id,
			brandId: competitors.brandId,
			name: competitors.name,
			domains: competitors.domains,
			aliases: competitors.aliases,
			createdAt: competitors.createdAt,
			updatedAt: competitors.updatedAt,
		})
		.from(competitors)
		.innerJoin(brands, eq(brands.id, competitors.brandId))
		.where(predicate)
		.orderBy(desc(competitors.createdAt))
		.limit(input.limit)
		.offset(input.offset);
	return { items, total };
}

export async function getOrganizationApiCompetitor(organizationId: string, competitorId: string) {
	const competitor = await findOrganizationCompetitor(db, organizationId, competitorId);
	if (!competitor) throw new OrganizationResourceNotFoundError("competitor", competitorId);
	return competitor;
}

export async function getOrganizationPromptSnapshotContext(organizationId: string, promptId: string) {
	const [context] = await db
		.select({
			prompt: { id: prompts.id, brandId: prompts.brandId, value: prompts.value },
			brand: {
				id: brands.id,
				website: brands.website,
				additionalDomains: brands.additionalDomains,
			},
		})
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.id, promptId)))
		.limit(1);
	if (!context) throw new OrganizationResourceNotFoundError("prompt", promptId);
	return {
		...context,
		competitors: await db.select().from(competitors).where(eq(competitors.brandId, context.prompt.brandId)),
	};
}

export async function createOrganizationApiBrand(input: CreateOrganizationApiBrandInput) {
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			const [{ value: currentEnabled = 0 } = { value: 0 }] = await tx
				.select({ value: count() })
				.from(brands)
				.where(and(eq(brands.organizationId, input.organizationId), eq(brands.enabled, true)));
			assertCapacity({ resolved, resource: "brands", requestedTotal: currentEnabled + 1 });

			const [brand] = await tx
				.insert(brands)
				.values({
					id: input.id,
					organizationId: input.organizationId,
					name: input.name,
					website: input.website,
					additionalDomains: input.additionalDomains,
					aliases: input.aliases,
					enabled: true,
					onboarded: true,
				})
				.onConflictDoNothing({ target: brands.id })
				.returning();
			if (!brand) throw new OrganizationResourceConflictError(`Brand "${input.id}" already exists.`);
			if (resolved.mode !== "cloud" || resolved.access !== "allowed") {
				throw new EntitlementAccessError("active cloud plan required");
			}
			await initializeDefaultBrandTracking({
				tx,
				resolved,
				organizationId: input.organizationId,
				brandId: brand.id,
			});

			assertOrganizationCompetitorLimit(0, input.competitors.length);
			if (input.competitors.length > 0) {
				await tx.insert(competitors).values(
					input.competitors.map((competitor) => ({
						brandId: brand.id,
						name: competitor.name,
						domains: competitor.domains,
						aliases: competitor.aliases,
					})),
				);
			}
			await saveOrganizationPromptsInTransaction({
				tx,
				resolved,
				organizationId: input.organizationId,
				brandId: brand.id,
				mutations: input.prompts,
				dedupeNewValues: true,
			});
			return brand;
		},
	});
}

export async function updateOrganizationApiBrand(input: UpdateOrganizationApiBrandInput) {
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			const existing = await findOrganizationBrand(tx, input.organizationId, input.brandId);
			if (!existing) throw new OrganizationResourceNotFoundError("brand", input.brandId);
			const [{ value: currentEnabled = 0 } = { value: 0 }] = await tx
				.select({ value: count() })
				.from(brands)
				.where(and(eq(brands.organizationId, input.organizationId), eq(brands.enabled, true)));
			const requestedEnabled =
				input.enabled === undefined || input.enabled === existing.enabled
					? currentEnabled
					: currentEnabled + (input.enabled ? 1 : -1);
			assertCapacityChange({
				resolved,
				resource: "brands",
				currentTotal: currentEnabled,
				requestedTotal: requestedEnabled,
			});
			const [updated] = await tx
				.update(brands)
				.set({
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.website !== undefined ? { website: input.website } : {}),
					...(input.additionalDomains !== undefined ? { additionalDomains: input.additionalDomains } : {}),
					...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
					...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
					updatedAt: new Date(),
				})
				.where(and(eq(brands.organizationId, input.organizationId), eq(brands.id, input.brandId)))
				.returning();
			if (!updated) throw new OrganizationResourceNotFoundError("brand", input.brandId);
			return updated;
		},
	});
}

export async function createOrganizationApiPrompt(input: CreateOrganizationApiPromptInput) {
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			const brand = await findOrganizationBrand(tx, input.organizationId, input.brandId);
			if (!brand) throw new OrganizationResourceNotFoundError("brand", input.brandId);
			const result = await saveOrganizationPromptsInTransaction({
				tx,
				resolved,
				organizationId: input.organizationId,
				brandId: input.brandId,
				mutations: [{ value: input.value, tags: input.tags, enabled: true }],
			});
			const insertedId = result.insertedPromptIds[0];
			const inserted = insertedId ? result.prompts.find((prompt) => prompt.id === insertedId) : undefined;
			if (!inserted) throw new OrganizationResourceConflictError("Failed to create prompt.");
			return inserted;
		},
	});
}

export async function updateOrganizationApiPrompt(input: UpdateOrganizationApiPromptInput) {
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			const existing = await findOrganizationPrompt(tx, input.organizationId, input.promptId);
			if (!existing) throw new OrganizationResourceNotFoundError("prompt", input.promptId);
			const mutation: PromptMutation = {
				id: existing.id,
				value: input.value ?? existing.value,
				enabled: input.enabled ?? existing.enabled,
				tags: input.tags ?? existing.tags,
			};
			const result = await saveOrganizationPromptsInTransaction({
				tx,
				resolved,
				organizationId: input.organizationId,
				brandId: existing.brandId,
				mutations: [mutation],
			});
			const updated = result.prompts.find((prompt) => prompt.id === existing.id);
			if (!updated) throw new OrganizationResourceNotFoundError("prompt", input.promptId);
			return updated;
		},
	});
}

export async function rejectOrganizationApiPromptDeletion(organizationId: string, promptId: string): Promise<never> {
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId,
		run: async ({ tx }) => {
			const existing = await findOrganizationPrompt(tx, organizationId, promptId);
			if (!existing) throw new OrganizationResourceNotFoundError("prompt", promptId);
			throw new OrganizationResourceConflictError(
				"Cloud prompts retain tracking and provider audit history. Set enabled to false with PATCH instead.",
			);
		},
	});
}

export async function createOrganizationApiCompetitor(input: CreateOrganizationApiCompetitorInput) {
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.organizationId,
		run: async ({ tx }) => {
			const brand = await findOrganizationBrand(tx, input.organizationId, input.brandId);
			if (!brand) throw new OrganizationResourceNotFoundError("brand", input.brandId);
			const [{ value: current = 0 } = { value: 0 }] = await tx
				.select({ value: count() })
				.from(competitors)
				.where(eq(competitors.brandId, brand.id));
			assertOrganizationCompetitorLimit(current, 1);
			const [inserted] = await tx
				.insert(competitors)
				.values({
					brandId: brand.id,
					name: input.name,
					domains: input.domains,
					aliases: input.aliases,
				})
				.returning();
			if (!inserted) throw new OrganizationResourceConflictError("Failed to create competitor.");
			return inserted;
		},
	});
}

export async function updateOrganizationApiCompetitor(input: UpdateOrganizationApiCompetitorInput) {
	return withOrganizationEntitlementTransaction({
		mode: "cloud",
		organizationId: input.organizationId,
		run: async ({ tx }) => {
			const existing = await findOrganizationCompetitor(tx, input.organizationId, input.competitorId);
			if (!existing) throw new OrganizationResourceNotFoundError("competitor", input.competitorId);
			const [updated] = await tx
				.update(competitors)
				.set({
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.domains !== undefined ? { domains: input.domains } : {}),
					...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
					updatedAt: new Date(),
				})
				.where(and(eq(competitors.id, input.competitorId), eq(competitors.brandId, existing.brandId)))
				.returning();
			if (!updated) throw new OrganizationResourceNotFoundError("competitor", input.competitorId);
			return updated;
		},
	});
}
