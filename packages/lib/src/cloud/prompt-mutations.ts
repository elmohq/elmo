import type { DeploymentMode } from "@workspace/config/types";
import { and, count, eq } from "drizzle-orm";
import { MAX_PROMPTS } from "../constants";
import { brands, prompts } from "../db/schema";
import { computeSystemTags, sanitizeUserTags } from "../tag-utils";
import { assertCapacity, CapacityExceededError, withOrganizationEntitlementTransaction } from "./capacity";

export type PromptMutation = {
	id?: string;
	value: string;
	enabled: boolean;
	tags: string[];
};

export class InvalidPromptMutationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidPromptMutationError";
	}
}

export function calculateEnabledPromptTotal(input: {
	currentOrganizationEnabled: number;
	existingEnabledById: ReadonlyMap<string, boolean>;
	mutations: readonly PromptMutation[];
}): number {
	let total = input.currentOrganizationEnabled;
	for (const mutation of input.mutations) {
		if (!mutation.id) {
			if (mutation.enabled) total++;
			continue;
		}

		const wasEnabled = input.existingEnabledById.get(mutation.id);
		if (wasEnabled === undefined)
			throw new InvalidPromptMutationError(`Prompt ${mutation.id} does not belong to this brand.`);
		if (wasEnabled !== mutation.enabled) total += mutation.enabled ? 1 : -1;
	}
	return total;
}

/**
 * Writes prompt changes behind the organization entitlement lock. Callers are
 * responsible for creating or removing the appropriate deployment scheduler
 * only after this transaction commits.
 */
export async function saveOrganizationPrompts(input: {
	mode: DeploymentMode;
	organizationId: string;
	brandId: string;
	mutations: PromptMutation[];
	dedupeNewValues?: boolean;
}): Promise<{
	prompts: (typeof prompts.$inferSelect)[];
	insertedPromptIds: string[];
	activatedPromptIds: string[];
	deactivatedPromptIds: string[];
}> {
	return withOrganizationEntitlementTransaction({
		mode: input.mode,
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			const [brand] = await tx
				.select({ id: brands.id, name: brands.name, website: brands.website })
				.from(brands)
				.where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)))
				.limit(1);
			if (!brand) throw new InvalidPromptMutationError("Brand does not belong to this organization.");

			const existing = await tx.select().from(prompts).where(eq(prompts.brandId, input.brandId));
			const existingById = new Map(existing.map((prompt) => [prompt.id, prompt]));
			const seenIds = new Set<string>();
			for (const mutation of input.mutations) {
				if (!mutation.id) continue;
				if (seenIds.has(mutation.id))
					throw new InvalidPromptMutationError(`Prompt ${mutation.id} was submitted twice.`);
				seenIds.add(mutation.id);
				if (!existingById.has(mutation.id)) {
					throw new InvalidPromptMutationError(`Prompt ${mutation.id} does not belong to this brand.`);
				}
			}

			const existingValues = new Set(existing.map((prompt) => prompt.value.trim().toLocaleLowerCase()));
			const newValues = new Set<string>();
			const normalized = input.mutations.flatMap((mutation): PromptMutation[] => {
				const value = mutation.value.trim();
				if (!value) throw new InvalidPromptMutationError("Prompts cannot be empty.");
				if (mutation.id || !input.dedupeNewValues)
					return [{ ...mutation, value, tags: sanitizeUserTags(mutation.tags) }];

				const key = value.toLocaleLowerCase();
				if (existingValues.has(key) || newValues.has(key)) return [];
				newValues.add(key);
				return [{ ...mutation, value, tags: sanitizeUserTags(mutation.tags) }];
			});

			const newPromptCount = normalized.reduce((total, mutation) => total + (mutation.id ? 0 : 1), 0);
			if (input.mode !== "cloud" && existing.length + newPromptCount > MAX_PROMPTS) {
				throw new CapacityExceededError("prompts", MAX_PROMPTS);
			}

			const [{ value: currentOrganizationEnabled = 0 } = { value: 0 }] = await tx
				.select({ value: count() })
				.from(prompts)
				.innerJoin(brands, eq(prompts.brandId, brands.id))
				.where(and(eq(brands.organizationId, input.organizationId), eq(prompts.enabled, true)));
			const requestedTotal = calculateEnabledPromptTotal({
				currentOrganizationEnabled,
				existingEnabledById: new Map(existing.map((prompt) => [prompt.id, prompt.enabled])),
				mutations: normalized,
			});
			assertCapacity({ resolved, resource: "prompts", requestedTotal });

			const activatedPromptIds: string[] = [];
			const deactivatedPromptIds: string[] = [];
			for (const mutation of normalized) {
				if (!mutation.id) continue;
				const previous = existingById.get(mutation.id);
				if (!previous) throw new InvalidPromptMutationError(`Prompt ${mutation.id} does not belong to this brand.`);
				await tx
					.update(prompts)
					.set({
						value: mutation.value,
						enabled: mutation.enabled,
						tags: mutation.tags,
						systemTags: computeSystemTags(mutation.value, brand.name, brand.website),
					})
					.where(and(eq(prompts.id, mutation.id), eq(prompts.brandId, input.brandId)));
				if (!previous.enabled && mutation.enabled) activatedPromptIds.push(mutation.id);
				if (previous.enabled && !mutation.enabled) deactivatedPromptIds.push(mutation.id);
			}

			const toInsert = normalized.filter((mutation) => !mutation.id);
			const inserted =
				toInsert.length === 0
					? []
					: await tx
							.insert(prompts)
							.values(
								toInsert.map((mutation) => ({
									brandId: input.brandId,
									value: mutation.value,
									enabled: mutation.enabled,
									tags: mutation.tags,
									systemTags: computeSystemTags(mutation.value, brand.name, brand.website),
								})),
							)
							.returning({ id: prompts.id, enabled: prompts.enabled });

			return {
				prompts: await tx.query.prompts.findMany({ where: eq(prompts.brandId, input.brandId) }),
				insertedPromptIds: inserted.map((prompt) => prompt.id),
				activatedPromptIds: [
					...activatedPromptIds,
					...inserted.filter((prompt) => prompt.enabled).map((prompt) => prompt.id),
				],
				deactivatedPromptIds,
			};
		},
	});
}
