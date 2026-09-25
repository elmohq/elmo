/**
 * No `Request`, session, or status codes: each edge maps these domain errors to
 * its own vocabulary. Callers decide the brand is theirs before calling in.
 */

import { selectPremiumModels } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { assertPromptSaveAllowed, withQuotaLock } from "@workspace/lib/entitlements";
import {
	type BrandedSource,
	type BrandIdentity,
	matchesPromptFilter,
	type PromptType,
	parsePromptFilter,
	promptTypeOf,
	resolvePromptType,
} from "@workspace/lib/prompt-type";
import { readTagsInput } from "@workspace/lib/tag-utils";
import { and, arrayOverlaps, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import { createPromptJobScheduler, removePromptJobScheduler } from "@/lib/job-scheduler";

export const MAX_PROMPT_BATCH = 100;

export class PromptNotFoundError extends Error {
	constructor(public readonly promptId: string) {
		super(`Prompt with ID '${promptId}' not found`);
		this.name = "PromptNotFoundError";
	}
}

/** Published to the model by MCP in `tools/list`. */
const brandIdSchema = z.string().trim().min(1, "brandId is required");

const promptValueSchema = z
	.string()
	.trim()
	.min(1, "value must be a non-empty string")
	.describe("The question to ask, as a person would type it.");

const promptTagsSchema = z.array(z.string()).describe("Free-form labels used for filtering analytics.");

const brandedOverrideSchema = z
	.boolean()
	.nullable()
	.describe(
		"Pin the prompt as branded (true) or unbranded (false). Null goes back to detecting it from whether the prompt names the brand.",
	);

export const bulkPromptInputSchema = z.object({
	brandId: brandIdSchema,
	prompts: z
		.array(
			z.object({
				value: promptValueSchema,
				tags: promptTagsSchema.optional(),
				branded: brandedOverrideSchema.optional(),
				enabled: z.boolean().optional().describe("Whether to start sampling it. Defaults to true."),
				premiumModels: z.array(z.string()).optional().describe("Premium engines to pair this prompt with."),
			}),
		)
		.min(1, "prompts must contain at least one entry")
		.max(MAX_PROMPT_BATCH, `prompts may contain at most ${MAX_PROMPT_BATCH} entries`)
		.describe("The prompts to add."),
});

export const promptUpdateFields = {
	value: promptValueSchema.optional().describe("Replacement text."),
	enabled: z.boolean().optional().describe("Whether to keep sampling it."),
	tags: promptTagsSchema.optional().describe("Replaces the prompt's tags outright."),
	branded: brandedOverrideSchema.optional(),
	premiumModels: z.array(z.string()).optional().describe("Replaces the prompt's premium engine pairings."),
};

export const updatePromptInputSchema = z
	.object(promptUpdateFields)
	.refine(
		(body) => Object.keys(body).length > 0,
		"At least one of value, enabled, tags, branded, or premiumModels must be provided",
	);

export type BulkPromptInput = z.infer<typeof bulkPromptInputSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptInputSchema>;

export interface PromptBrand extends BrandIdentity {
	id: string;
	organizationId: string;
}

export type Prompt = typeof prompts.$inferSelect;

export interface PromptSummary {
	id: string;
	brandId: string;
	value: string;
	enabled: boolean;
	tags: string[];
	/** Whether the prompt names the brand, as of the brand's current names. */
	branded: boolean;
	/** `manual` when `branded` is pinned rather than detected. */
	brandedSource: BrandedSource;
	/** @deprecated `[branded ? "branded" : "unbranded"]`; read `branded`. */
	systemTags: PromptType[];
	premiumModels: string[];
	createdAt: Date;
	updatedAt: Date;
}

/** The public shape of a prompt, so every edge that hands a prompt to a client
 *  answers the same fields. */
export function toPromptSummary(prompt: Prompt, brand: BrandIdentity): PromptSummary {
	const { branded, brandedSource } = resolvePromptType(prompt, brand);
	return {
		id: prompt.id,
		brandId: prompt.brandId,
		value: prompt.value,
		enabled: prompt.enabled,
		tags: prompt.tags,
		branded,
		brandedSource,
		systemTags: [promptTypeOf(branded)],
		premiumModels: prompt.premiumModels,
		createdAt: prompt.createdAt,
		updatedAt: prompt.updatedAt,
	};
}

export interface ListPromptsFilters {
	brandId?: string;
	enabled?: boolean;
	tags?: string[];
	/** `branded` or `unbranded`. */
	type?: string;
	q?: string;
	limit: number;
	offset: number;
	scope?: SQL;
}

export async function listPrompts(filters: ListPromptsFilters): Promise<{ data: PromptSummary[]; total: number }> {
	const filter = parsePromptFilter(filters);
	const conditions: (SQL | undefined)[] = [filters.scope];
	if (filters.brandId) conditions.push(eq(prompts.brandId, filters.brandId));
	if (filters.enabled !== undefined) conditions.push(eq(prompts.enabled, filters.enabled));
	if (filter.tags.length > 0) conditions.push(arrayOverlaps(prompts.tags, filter.tags));
	if (filters.q?.trim()) conditions.push(ilike(prompts.value, `%${filters.q.trim()}%`));
	const where = and(...conditions.filter(Boolean));

	const query = db
		.select({
			prompt: prompts,
			brand: {
				name: brands.name,
				website: brands.website,
				aliases: brands.aliases,
				additionalDomains: brands.additionalDomains,
			},
		})
		.from(prompts)
		.innerJoin(brands, eq(brands.id, prompts.brandId))
		.where(where)
		.orderBy(desc(prompts.createdAt));

	// The type is resolved in code, not SQL, so paging it has to happen after.
	if (filter.type) {
		const matching = (await query)
			.map((row) => toPromptSummary(row.prompt, row.brand))
			.filter((prompt) => matchesPromptFilter(prompt, filter));
		return { data: matching.slice(filters.offset, filters.offset + filters.limit), total: matching.length };
	}

	const [totals] = await db.select({ count: count() }).from(prompts).where(where);
	const rows = await query.limit(filters.limit).offset(filters.offset);
	return { data: rows.map((row) => toPromptSummary(row.prompt, row.brand)), total: totals?.count ?? 0 };
}

export async function findPromptBrandId(promptId: string): Promise<string | null> {
	const [prompt] = await db.select({ brandId: prompts.brandId }).from(prompts).where(eq(prompts.id, promptId)).limit(1);
	return prompt?.brandId ?? null;
}

export async function requirePrompt(promptId: string): Promise<Prompt> {
	const [prompt] = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
	if (!prompt) throw new PromptNotFoundError(promptId);
	return prompt;
}

/** One delta against both pools in one transaction, so a batch that would
 * overrun a limit creates nothing. */
export async function createPrompts(brand: PromptBrand, input: Omit<BulkPromptInput, "brandId">): Promise<Prompt[]> {
	const parsed = bulkPromptInputSchema.omit({ brandId: true }).parse(input);
	const rows = parsed.prompts.map((prompt) => {
		const { tags, brandedOverride } = readTagsInput(prompt.tags ?? [], prompt.branded);
		return {
			brandId: brand.id,
			value: prompt.value,
			enabled: prompt.enabled ?? true,
			tags,
			brandedOverride: brandedOverride ?? null,
			premiumModels: selectPremiumModels(prompt.premiumModels),
		};
	});

	// Under the lock, so two batches cannot both spend the last slot.
	const enabled = rows.filter((row) => row.enabled);
	const created = await withQuotaLock(brand.organizationId, async (tx) => {
		await assertPromptSaveAllowed(
			brand.organizationId,
			{
				prompts: enabled.length,
				premiumPairings: enabled.reduce((sum, row) => sum + row.premiumModels.length, 0),
			},
			tx,
		);
		return tx.insert(prompts).values(rows).returning();
	});

	// Outside the transaction: a queue hiccup must not roll back prompts the
	// customer can see; the worker's scheduler picks up what failed.
	for (const prompt of created) {
		if (prompt.enabled) await createPromptJobScheduler(prompt.id);
	}

	return created;
}

function promptUpdateData(input: UpdatePromptInput, nextPremium: string[]): Partial<typeof prompts.$inferInsert> {
	const update: Partial<typeof prompts.$inferInsert> = {};
	if (input.value !== undefined) update.value = input.value;
	if (input.enabled !== undefined) update.enabled = input.enabled;
	if (input.tags !== undefined) {
		const { tags, brandedOverride } = readTagsInput(input.tags);
		update.tags = tags;
		if (brandedOverride !== undefined) update.brandedOverride = brandedOverride;
	}
	if (input.branded !== undefined) update.brandedOverride = input.branded;
	if (input.premiumModels !== undefined) update.premiumModels = nextPremium;
	return update;
}

/** The quota-checked half of an update: re-read the row under the lock, charge
 *  the plan for the change, then write. */
async function applyPromptUpdate(
	tx: DbConnection,
	afterCommit: (task: () => Promise<unknown>) => void,
	brand: PromptBrand,
	promptId: string,
	input: UpdatePromptInput,
): Promise<Prompt | undefined> {
	const [existing] = await tx.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
	if (!existing || existing.brandId !== brand.id) throw new PromptNotFoundError(promptId);

	const wasEnabled = existing.enabled;
	const willBeEnabled = input.enabled ?? wasEnabled;
	const nextPremium = input.premiumModels ? selectPremiumModels(input.premiumModels) : existing.premiumModels;

	// Re-enabling re-spends the premium pairings, so the delta is against what
	// the row costs now, not zero.
	await assertPromptSaveAllowed(
		brand.organizationId,
		{
			prompts: (willBeEnabled ? 1 : 0) - (wasEnabled ? 1 : 0),
			premiumPairings: (willBeEnabled ? nextPremium.length : 0) - (wasEnabled ? existing.premiumModels.length : 0),
		},
		tx,
	);

	const [row] = await tx
		.update(prompts)
		.set(promptUpdateData(input, nextPremium))
		.where(eq(prompts.id, promptId))
		.returning();
	if (input.enabled !== undefined && wasEnabled !== input.enabled) {
		afterCommit(() => (input.enabled ? createPromptJobScheduler(promptId) : removePromptJobScheduler(promptId)));
	}
	return row;
}

export async function updatePrompt(brand: PromptBrand, promptId: string, changes: UpdatePromptInput): Promise<Prompt> {
	const input = updatePromptInputSchema.parse(changes);
	const updated = await withQuotaLock(brand.organizationId, (tx, afterCommit) =>
		applyPromptUpdate(tx, afterCommit, brand, promptId, input),
	);

	// The check above can race with a concurrent delete; returning() decides.
	if (!updated) throw new PromptNotFoundError(promptId);
	return updated;
}

export async function deletePrompt(promptId: string): Promise<{ prompt: Prompt; deletedRunsCount: number }> {
	await removePromptJobScheduler(promptId);

	const result = await db.transaction(async (tx) => {
		await tx.delete(citations).where(eq(citations.promptId, promptId));
		const deletedRuns = await tx
			.delete(promptRuns)
			.where(eq(promptRuns.promptId, promptId))
			.returning({ id: promptRuns.id });
		const [deletedPrompt] = await tx.delete(prompts).where(eq(prompts.id, promptId)).returning();
		return { deletedRuns, deletedPrompt };
	});

	// The caller's check can race with a concurrent delete; returning() decides.
	if (!result.deletedPrompt) throw new PromptNotFoundError(promptId);
	return { prompt: result.deletedPrompt, deletedRunsCount: result.deletedRuns.length };
}
