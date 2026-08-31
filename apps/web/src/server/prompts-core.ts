/**
 * Prompt create / update / delete, as edge-agnostic functions.
 *
 * Server-only, and deliberately ignorant of how it was reached: no `Request`,
 * no session, no HTTP status codes. `/api/v1/prompts*` and the MCP tools are
 * both thin wrappers over these, which is the only way the two surfaces can be
 * kept from disagreeing about what "create a prompt" means — the plan limits it
 * spends, the scheduler it starts, the tags it derives.
 *
 * Failures are domain errors. Each edge maps them to its own vocabulary:
 * a status code for REST, a tool error for MCP. Entitlement failures are the
 * exception — `assertPromptSaveAllowed` throws `WriteDeniedError`, which
 * already carries everything both edges need, so it is left to travel.
 *
 * Callers are responsible for deciding that the brand is theirs *before*
 * calling in; nothing here knows who is asking.
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

// ============================================================================
// Errors
// ============================================================================

export class PromptNotFoundError extends Error {
	constructor(public readonly promptId: string) {
		super(`Prompt with ID '${promptId}' not found`);
		this.name = "PromptNotFoundError";
	}
}

// ============================================================================
// Schemas
// ============================================================================

/**
 * The descriptions are on the schemas rather than on any one edge's copy of
 * them: MCP publishes them to the model in `tools/list`, and having a second
 * set of words for the same field is how the two surfaces come to describe a
 * prompt differently.
 */
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

/** The fields an update may carry, before the "at least one" rule is applied. */
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

/** The brand fields prompt writes need — whatever loaded it, however it did. */
export interface PromptBrand {
	id: string;
	name: string;
	website: string;
	organizationId: string;
}

export type Prompt = typeof prompts.$inferSelect;

/** The columns every prompt read answers with; excludes nothing but is explicit. */
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

// ============================================================================
// Reads
// ============================================================================

export interface ListPromptsFilters {
	/** Restricts to one brand; combine with `scope` for the tenancy rule. */
	brandId?: string;
	enabled?: boolean;
	/** Matched with overlap, so a prompt carrying any of them is included. */
	tags?: string[];
	/** Substring match on the prompt text. */
	q?: string;
	limit: number;
	offset: number;
	/** The caller's tenancy condition, from `brandScopeCondition`. */
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

/** One prompt, or null. Whether the caller may see it is decided outside. */
export async function findPrompt(promptId: string): Promise<PromptSummary | null> {
	const [prompt] = await db.select(PROMPT_COLUMNS).from(prompts).where(eq(prompts.id, promptId)).limit(1);
	return prompt ?? null;
}

/**
 * Just the brand a prompt belongs to — what a caller needs to decide whether
 * the prompt is theirs before doing anything with it.
 */
export async function findPromptBrandId(promptId: string): Promise<string | null> {
	const [prompt] = await db.select({ brandId: prompts.brandId }).from(prompts).where(eq(prompts.id, promptId)).limit(1);
	return prompt?.brandId ?? null;
}

/** The same lookup for a write path, which needs the row's current state. */
export async function requirePrompt(promptId: string): Promise<Prompt> {
	const [prompt] = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
	if (!prompt) throw new PromptNotFoundError(promptId);
	return prompt;
}

// ============================================================================
// Writes
// ============================================================================

export async function createPrompt(brand: PromptBrand, input: Omit<CreatePromptInput, "brandId">): Promise<Prompt> {
	const [created] = await createPrompts(brand, { prompts: [{ value: input.value, tags: input.tags }] });
	return created;
}

/**
 * All-or-nothing. The batch is checked against the organization's prompt and
 * premium pools as a single delta and applied in one transaction, so a batch
 * that would overrun a limit creates nothing rather than part of itself and
 * leaves the caller guessing how far it got.
 */
export async function createPrompts(brand: PromptBrand, input: Omit<BulkPromptInput, "brandId">): Promise<Prompt[]> {
	// Parsed here, not merely typed. `BulkPromptInput` says "output of the
	// schema", but TypeScript cannot tell a trimmed non-empty string from any
	// string — so an edge that built its own shape would slip an empty prompt
	// past a signature that claims to forbid one.
	const parsed = bulkPromptInputSchema.omit({ brandId: true }).parse(input);
	const rows = parsed.prompts.map((prompt) => ({
		brandId: brand.id,
		value: prompt.value,
		enabled: prompt.enabled ?? true,
		tags: sanitizeUserTags(prompt.tags ?? []),
		systemTags: computeSystemTags(prompt.value, brand.name, brand.website),
		premiumModels: selectPremiumModels(prompt.premiumModels),
	}));

	// One decision for the whole batch, against both pools it can spend, and the
	// insert under the same lock so two batches can't both spend the last slot.
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

	// Scheduling is deliberately outside the transaction: a queue hiccup must not
	// roll back prompts the customer can see, and the worker's self-healing
	// scheduler picks up anything that failed to enqueue.
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
	// Same reason as createPrompts: the "at least one field" rule and the
	// non-empty value live on the schema, so they are applied from it.
	const input = updatePromptInputSchema.parse(changes);
	const updated = await withQuotaLock(brand.organizationId, async (tx, afterCommit) => {
		const [existing] = await tx.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
		if (!existing || existing.brandId !== brand.id) throw new PromptNotFoundError(promptId);

		const wasEnabled = existing.enabled;
		const willBeEnabled = input.enabled ?? wasEnabled;
		const nextPremium = input.premiumModels ? selectPremiumModels(input.premiumModels) : existing.premiumModels;

		// Re-enabling a prompt re-spends its premium pairings, so the delta is
		// computed against what the row costs now, not against zero.
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

	// The existence check above can race with a concurrent delete; the update's
	// returning() is the source of truth.
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

	// Any existence check the caller made can race with a concurrent delete; the
	// transaction's returning() is the source of truth.
	if (!result.deletedPrompt) throw new PromptNotFoundError(promptId);
	return { prompt: result.deletedPrompt, deletedRunsCount: result.deletedRuns.length };
}
