/**
 * No `Request`, session, or status codes: each edge maps these domain errors to
 * its own vocabulary. Callers decide the brand is theirs before calling in.
 */

import { selectPremiumModels } from "@workspace/config/plans";
import { db } from "@workspace/lib/db/db";
import { citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { assertPromptSaveAllowed, withQuotaLock } from "@workspace/lib/entitlements";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
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

export const createPromptInputSchema = z.object({
	brandId: brandIdSchema,
	value: promptValueSchema,
	tags: promptTagsSchema.optional(),
});

export const bulkPromptInputSchema = z.object({
	brandId: brandIdSchema,
	prompts: z
		.array(
			z.object({
				value: promptValueSchema,
				tags: promptTagsSchema.optional(),
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
	premiumModels: z.array(z.string()).optional().describe("Replaces the prompt's premium engine pairings."),
};

export const updatePromptInputSchema = z
	.object(promptUpdateFields)
	.refine(
		(body) => Object.keys(body).length > 0,
		"At least one of value, enabled, tags, or premiumModels must be provided",
	);

export type CreatePromptInput = z.infer<typeof createPromptInputSchema>;
export type BulkPromptInput = z.infer<typeof bulkPromptInputSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptInputSchema>;

export interface PromptBrand {
	id: string;
	name: string;
	website: string;
	organizationId: string;
}

export type Prompt = typeof prompts.$inferSelect;

const PROMPT_COLUMNS = {
	id: prompts.id,
	brandId: prompts.brandId,
	value: prompts.value,
	enabled: prompts.enabled,
	tags: prompts.tags,
	systemTags: prompts.systemTags,
	premiumModels: prompts.premiumModels,
	createdAt: prompts.createdAt,
	updatedAt: prompts.updatedAt,
} as const;

export type PromptSummary = {
	[K in keyof typeof PROMPT_COLUMNS]: Prompt[K];
};

export interface ListPromptsFilters {
	brandId?: string;
	enabled?: boolean;
	tags?: string[];
	q?: string;
	limit: number;
	offset: number;
	scope?: SQL;
}

export async function listPrompts(filters: ListPromptsFilters): Promise<{ data: PromptSummary[]; total: number }> {
	const conditions: (SQL | undefined)[] = [filters.scope];
	if (filters.brandId) conditions.push(eq(prompts.brandId, filters.brandId));
	if (filters.enabled !== undefined) conditions.push(eq(prompts.enabled, filters.enabled));
	const tags = (filters.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
	if (tags.length > 0) conditions.push(arrayOverlaps(prompts.tags, tags));
	if (filters.q?.trim()) conditions.push(ilike(prompts.value, `%${filters.q.trim()}%`));

	const where = and(...conditions.filter(Boolean));
	const [totals] = await db.select({ count: count() }).from(prompts).where(where);
	const data = await db
		.select(PROMPT_COLUMNS)
		.from(prompts)
		.where(where)
		.orderBy(desc(prompts.createdAt))
		.limit(filters.limit)
		.offset(filters.offset);

	return { data, total: totals?.count ?? 0 };
}

export async function findPrompt(promptId: string): Promise<PromptSummary | null> {
	const [prompt] = await db.select(PROMPT_COLUMNS).from(prompts).where(eq(prompts.id, promptId)).limit(1);
	return prompt ?? null;
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

export async function createPrompt(brand: PromptBrand, input: Omit<CreatePromptInput, "brandId">): Promise<Prompt> {
	const [created] = await createPrompts(brand, { prompts: [{ value: input.value, tags: input.tags }] });
	return created;
}

/** One delta against both pools in one transaction, so a batch that would
 * overrun a limit creates nothing. */
export async function createPrompts(brand: PromptBrand, input: Omit<BulkPromptInput, "brandId">): Promise<Prompt[]> {
	const parsed = bulkPromptInputSchema.omit({ brandId: true }).parse(input);
	const rows = parsed.prompts.map((prompt) => ({
		brandId: brand.id,
		value: prompt.value,
		enabled: prompt.enabled ?? true,
		tags: sanitizeUserTags(prompt.tags ?? []),
		systemTags: computeSystemTags(prompt.value, brand.name, brand.website),
		premiumModels: selectPremiumModels(prompt.premiumModels),
	}));

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

function promptUpdateData(
	input: UpdatePromptInput,
	brand: Pick<PromptBrand, "name" | "website">,
	nextPremium: string[],
): Partial<typeof prompts.$inferInsert> {
	const update: Partial<typeof prompts.$inferInsert> = {};
	if (input.value !== undefined) {
		update.value = input.value;
		update.systemTags = computeSystemTags(input.value, brand.name, brand.website);
	}
	if (input.enabled !== undefined) update.enabled = input.enabled;
	if (input.tags !== undefined) update.tags = sanitizeUserTags(input.tags);
	if (input.premiumModels !== undefined) update.premiumModels = nextPremium;
	return update;
}

export async function updatePrompt(brand: PromptBrand, promptId: string, changes: UpdatePromptInput): Promise<Prompt> {
	const input = updatePromptInputSchema.parse(changes);
	const updated = await withQuotaLock(brand.organizationId, async (tx, afterCommit) => {
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
			.set(promptUpdateData(input, brand, nextPremium))
			.where(eq(prompts.id, promptId))
			.returning();
		if (input.enabled !== undefined && wasEnabled !== input.enabled) {
			afterCommit(() => (input.enabled ? createPromptJobScheduler(promptId) : removePromptJobScheduler(promptId)));
		}
		return row;
	});

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
