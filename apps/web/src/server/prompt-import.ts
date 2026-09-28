import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { scheduleFirstPromptRuns } from "@/lib/job-scheduler";
import { isPublicError, isWriteDenied, PublicError } from "@/lib/public-errors";
import {
	commitPromptImport,
	type PromptImportCommitResult,
	type PromptImportReview,
	reviewPromptImport,
} from "@/server/prompt-import-load";

const importInput = z.object({
	brandId: z.string(),
	text: z.string(),
	enabled: z.boolean().default(false),
});

export const PROMPT_IMPORT_FAILED = "The import failed and nothing was added. Your text is still here — try again.";

export const reviewPromptImportFn = createServerFn({ method: "POST" })
	.validator(importInput)
	.handler(async ({ data }): Promise<PromptImportReview> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);
		return reviewPromptImport(data.brandId, data.text, data.enabled);
	});

export const commitPromptImportFn = createServerFn({ method: "POST" })
	.validator(importInput.extend({ token: z.string().min(1) }))
	.handler(async ({ data }): Promise<Omit<PromptImportCommitResult, "insertedIds">> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);
		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new PublicError("brand-not-found", "Brand not found");

		let result: PromptImportCommitResult;
		try {
			result = await commitPromptImport(brand, data.text, data.enabled, data.token);
		} catch (error) {
			if (isPublicError(error) || isWriteDenied(error)) throw error;
			// A database error names the SQL and its parameters — the prompt text.
			// Keep that on the server; the browser gets a message it can show.
			console.error("Prompt import failed:", error);
			throw new PublicError("import-failed", PROMPT_IMPORT_FAILED);
		}

		// Disabled prompts own no chain. Enabled ones start theirs spread over
		// the cadence, after the commit and off the request: the rows are saved
		// whatever happens here, and maintenance revives any chain that is missed.
		if (result.enabled && result.insertedIds.length > 0) {
			scheduleFirstPromptRuns(result.insertedIds).catch((err) =>
				console.error("Failed to start chains for imported prompts:", err),
			);
		}
		return { inserted: result.inserted, enabled: result.enabled };
	});
