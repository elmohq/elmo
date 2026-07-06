// Single source of prompt CRUD shared by /api/v1/prompts and the MCP server.
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@workspace/lib/db/db";
import { brands, citations, promptRuns, prompts } from "@workspace/lib/db/schema";
import { computeSystemTags, sanitizeUserTags } from "@workspace/lib/tag-utils";
import { createPromptJobScheduler, removePromptJobScheduler } from "@/lib/job-scheduler";
import { BrandNotFoundError } from "@/server/onboarding-core";

export { BrandNotFoundError };

export class PromptNotFoundError extends Error {
	constructor(public readonly promptId: string) {
		super(`Prompt "${promptId}" not found.`);
		this.name = "PromptNotFoundError";
	}
}

const PROMPT_SELECT = {
	id: prompts.id,
	brandId: prompts.brandId,
	value: prompts.value,
	enabled: prompts.enabled,
	tags: prompts.tags,
	systemTags: prompts.systemTags,
	createdAt: prompts.createdAt,
	updatedAt: prompts.updatedAt,
} as const;

export async function listPrompts(opts: { brandId?: string; enabled?: boolean; page?: number; limit?: number }) {
	const page = Math.max(1, opts.page ?? 1);
	const limit = Math.max(1, opts.limit ?? 20);
	const offset = (page - 1) * limit;

	const conditions = [];
	if (opts.brandId !== undefined) conditions.push(eq(prompts.brandId, opts.brandId));
	if (opts.enabled !== undefined) conditions.push(eq(prompts.enabled, opts.enabled));

	const whereConditions =
		conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0]! : and(...conditions);

	const [countResult] = await db.select({ count: count() }).from(prompts).where(whereConditions);
	const totalCount = countResult?.count ?? 0;
	const totalPages = Math.ceil(totalCount / limit);

	const list = await db
		.select(PROMPT_SELECT)
		.from(prompts)
		.where(whereConditions)
		.orderBy(desc(prompts.createdAt))
		.limit(limit)
		.offset(offset);

	return { prompts: list, pagination: { page, limit, total: totalCount, totalPages } };
}

export async function getPromptById(promptId: string) {
	const rows = await db.select(PROMPT_SELECT).from(prompts).where(eq(prompts.id, promptId)).limit(1);
	if (rows.length === 0) throw new PromptNotFoundError(promptId);
	return rows[0]!;
}

export async function createPrompt(input: { brandId: string; value: string; tags?: string[] }) {
	const brandInfo = await db.select().from(brands).where(eq(brands.id, input.brandId)).limit(1);
	if (brandInfo.length === 0) throw new BrandNotFoundError(input.brandId);
	const brand = brandInfo[0]!;

	const userTags = input.tags ? sanitizeUserTags(input.tags) : [];
	const systemTags = computeSystemTags(input.value, brand.name, brand.website);

	const [newPrompt] = await db
		.insert(prompts)
		.values({ brandId: input.brandId, value: input.value, tags: userTags, systemTags, enabled: true })
		.returning();

	await createPromptJobScheduler(newPrompt!.id);

	return newPrompt!;
}

export async function updatePrompt(
	promptId: string,
	input: { value?: string; enabled?: boolean; tags?: string[] },
) {
	if (input.value === undefined && input.enabled === undefined && input.tags === undefined) {
		throw new Error("At least one of value, enabled, or tags must be provided");
	}

	const existingRows = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
	if (existingRows.length === 0) throw new PromptNotFoundError(promptId);
	const existing = existingRows[0]!;

	const brandInfo = await db.select().from(brands).where(eq(brands.id, existing.brandId)).limit(1);
	if (brandInfo.length === 0) throw new BrandNotFoundError(existing.brandId);
	const brand = brandInfo[0]!;

	const updateData: Partial<typeof prompts.$inferInsert> = {};
	if (input.value !== undefined) {
		updateData.value = input.value;
		updateData.systemTags = computeSystemTags(input.value, brand.name, brand.website);
	}
	if (input.enabled !== undefined) {
		updateData.enabled = input.enabled;
	}
	if (input.tags !== undefined) {
		updateData.tags = sanitizeUserTags(input.tags);
	}

	const [updatedPrompt] = await db.update(prompts).set(updateData).where(eq(prompts.id, promptId)).returning();
	if (!updatedPrompt) throw new PromptNotFoundError(promptId);

	if (input.enabled !== undefined) {
		const wasEnabled = existing.enabled;
		if (!wasEnabled && input.enabled) {
			await createPromptJobScheduler(promptId);
		} else if (wasEnabled && !input.enabled) {
			await removePromptJobScheduler(promptId);
		}
	}

	return updatedPrompt;
}

export async function deletePrompt(promptId: string) {
	const existingRows = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
	if (existingRows.length === 0) throw new PromptNotFoundError(promptId);

	await removePromptJobScheduler(promptId);

	const result = await db.transaction(async (tx) => {
		await tx.delete(citations).where(eq(citations.promptId, promptId));
		const deletedRuns = await tx
			.delete(promptRuns)
			.where(eq(promptRuns.promptId, promptId))
			.returning({ id: promptRuns.id });
		const deletedPrompt = await tx.delete(prompts).where(eq(prompts.id, promptId)).returning();
		return { deletedRuns, deletedPrompt };
	});

	const deleted = result.deletedPrompt[0];
	if (!deleted) throw new PromptNotFoundError(promptId);

	return { ...deleted, deletedRunsCount: result.deletedRuns.length };
}
