import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { scheduleFirstPromptRuns } from "@/lib/job-scheduler";
import { promptIdListSchema } from "@/lib/prompt-bulk";
import { promptCatalogQuerySchema } from "@/lib/prompt-catalog";
import { isPublicError, isWriteDenied, PublicError } from "@/lib/public-errors";
import {
	type BulkStatusPreview,
	commitBulkStatus,
	commitDelete,
	commitTagRemoval,
	type DeletePreview,
	listPromptIds,
	type PromptIdSelection,
	previewBulkStatus,
	previewDelete,
	previewTagRemoval,
	type TagRemovalPreview,
} from "@/server/prompt-bulk-load";

const brandScoped = z.object({ brandId: z.string() });

async function authorizedBrand(brandId: string) {
	const session = await requireAuthSession();
	await requireBrandAccess(session.user.id, brandId);
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new PublicError("brand-not-found", "Brand not found");
	return { brand, userId: session.user.id };
}

/** A database error names the SQL and its parameters; the browser gets a fixed message instead. */
async function guarded<T>(label: string, fallback: string, run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (isPublicError(error) || isWriteDenied(error)) throw error;
		console.error(`${label} failed:`, error);
		throw new PublicError(`${label}-failed`, fallback);
	}
}

export const listPromptIdsFn = createServerFn({ method: "GET" })
	.validator(brandScoped.merge(promptCatalogQuerySchema))
	.handler(async ({ data }): Promise<PromptIdSelection> => {
		const { brand } = await authorizedBrand(data.brandId);
		const { brandId: _b, ...query } = data;
		return listPromptIds(brand.id, query);
	});

export const previewBulkStatusFn = createServerFn({ method: "POST" })
	.validator(brandScoped.extend({ ids: promptIdListSchema, enabled: z.boolean() }))
	.handler(async ({ data }): Promise<BulkStatusPreview> => {
		const { brand } = await authorizedBrand(data.brandId);
		return previewBulkStatus(brand, data.ids, data.enabled);
	});

export const BULK_STATUS_FAILED = "The status change failed and nothing was changed. Try again.";

export const commitBulkStatusFn = createServerFn({ method: "POST" })
	.validator(brandScoped.extend({ ids: promptIdListSchema, enabled: z.boolean() }))
	.handler(async ({ data }) => {
		const { brand } = await authorizedBrand(data.brandId);
		const result = await guarded("bulk-status", BULK_STATUS_FAILED, () =>
			commitBulkStatus(brand, data.ids, data.enabled),
		);
		// Chains start after the commit and off the request: the rows are saved
		// whatever happens here, and maintenance revives any chain that is missed.
		if (result.enabledIds.length > 0) {
			scheduleFirstPromptRuns(result.enabledIds).catch((err) =>
				console.error("Failed to start chains for enabled prompts:", err),
			);
		}
		return { changed: result.changed, cancelledJobs: result.cancelledJobs, activeJobs: result.activeJobs };
	});

export const previewDeleteFn = createServerFn({ method: "POST" })
	.validator(brandScoped.extend({ ids: promptIdListSchema }))
	.handler(async ({ data }): Promise<DeletePreview> => {
		const { brand } = await authorizedBrand(data.brandId);
		return previewDelete(brand, data.ids);
	});

export const DELETE_FAILED = "The delete failed and nothing was removed. Review the delete again.";

export const commitDeleteFn = createServerFn({ method: "POST" })
	.validator(brandScoped.extend({ ids: promptIdListSchema, digest: z.string().min(1), phrase: z.string() }))
	.handler(async ({ data }) => {
		const { brand, userId } = await authorizedBrand(data.brandId);
		const result = await guarded("delete", DELETE_FAILED, () =>
			commitDelete(brand, data.ids, data.digest, data.phrase, { actor: userId, requestId: randomUUID() }),
		);
		return { deleted: result.counts.prompts, counts: result.counts, cancelledJobs: result.cancelledJobs };
	});

export const previewTagRemovalFn = createServerFn({ method: "POST" })
	.validator(brandScoped.extend({ tag: z.string().max(100) }))
	.handler(async ({ data }): Promise<TagRemovalPreview> => {
		const { brand } = await authorizedBrand(data.brandId);
		return previewTagRemoval(brand.id, data.tag);
	});

export const TAG_REMOVAL_FAILED = "Removing the tag failed and nothing was changed. Try again.";

export const commitTagRemovalFn = createServerFn({ method: "POST" })
	.validator(brandScoped.extend({ tag: z.string().max(100), phrase: z.string() }))
	.handler(async ({ data }) => {
		const { brand } = await authorizedBrand(data.brandId);
		return guarded("tag-removal", TAG_REMOVAL_FAILED, () => commitTagRemoval(brand.id, data.tag, data.phrase));
	});
