import { db } from "@workspace/lib/db/db";
import { type Brand, type Prompt, prompts } from "@workspace/lib/db/schema";
import { assertPromptSaveAllowed, promptSaveDelta, reserveBrandPromptCapacity } from "@workspace/lib/entitlements";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { and, eq, inArray } from "drizzle-orm";
import { expeditePromptRuns } from "@/lib/expedite-prompts";
import { scheduleFirstPromptRuns } from "@/lib/job-scheduler";
import { promptsGainingPremium } from "@/lib/run-config-changes";
import { planPromptSave, type SubmittedPrompt } from "@/server/prompt-save";

export interface SavePromptsDeps {
	/** Enqueues the first job of every prompt that is enabled and has no chain yet, after the commit. */
	scheduleNewPrompts: (promptIds: string[]) => Promise<unknown>;
}

const defaultDeps: SavePromptsDeps = { scheduleNewPrompts: scheduleFirstPromptRuns };

/**
 * Persist the submitted rows of a brand's prompt list — the rows the editor
 * changed plus the ones it added — in one transaction, then hand the prompts
 * that now need a chain to the scheduler.
 *
 * Only the submitted ids are read and written, so a page of edits costs a page
 * of rows, never the whole catalog. The cap is reserved under the brand's
 * insert lock inside the same transaction, which is what stops two saves at
 * 9 999 from both landing.
 *
 * Scheduling runs after the commit and its failure is logged, not thrown: the
 * rows are already saved, and telling the caller otherwise would make them
 * re-submit a list that is already in the database. Schedule maintenance
 * picks up any prompt that ended up without a job.
 *
 * Callers must have authenticated the user and checked brand access already.
 */
export async function savePromptsForBrand(
	brand: Brand,
	submitted: readonly SubmittedPrompt[],
	deps: SavePromptsDeps = defaultDeps,
): Promise<Prompt[]> {
	const submittedIds = submitted.flatMap((p) => (p.id === undefined ? [] : [p.id]));
	const inserting = submitted.length - submittedIds.length;

	const { saved, existingById } = await db.transaction(async (tx) => {
		await reserveBrandPromptCapacity(tx, brand.id, inserting);

		const existingRows =
			submittedIds.length === 0
				? []
				: await tx
						.select({ id: prompts.id, enabled: prompts.enabled, premiumModels: prompts.premiumModels })
						.from(prompts)
						.where(and(eq(prompts.brandId, brand.id), inArray(prompts.id, submittedIds)));
		const existingById = new Map(existingRows.map((p) => [p.id, p]));

		const { updates, inserts } = planPromptSave(submitted, existingRows);
		await assertPromptSaveAllowed(brand.organizationId, promptSaveDelta({ updates, inserts }));

		const saved: Prompt[] = [];
		for (const { id, prompt, after } of updates) {
			const [row] = await tx
				.update(prompts)
				.set({
					value: prompt.value,
					enabled: prompt.enabled,
					tags: after.tags,
					systemTags: computeSystemTags(prompt.value, brand.name, brand.website),
					premiumModels: after.premiumModels,
				})
				.where(and(eq(prompts.id, id), eq(prompts.brandId, brand.id)))
				.returning();
			if (row) saved.push(row);
		}

		if (inserts.length > 0) {
			const rows = await tx
				.insert(prompts)
				.values(
					inserts.map(({ prompt, after }) => ({
						brandId: brand.id,
						value: prompt.value,
						enabled: prompt.enabled,
						tags: after.tags,
						systemTags: computeSystemTags(prompt.value, brand.name, brand.website),
						premiumModels: after.premiumModels,
					})),
				)
				.returning();
			saved.push(...rows);
		}

		return { saved, existingById };
	});

	// A disabled prompt owns no chain: it gets one when it is enabled, whether
	// that is this save (an existing row flipped on) or a later one.
	const needChain = saved.filter((p) => p.enabled && !(existingById.get(p.id)?.enabled ?? false)).map((p) => p.id);
	if (needChain.length > 0) {
		deps
			.scheduleNewPrompts(needChain)
			.catch((err) => console.error("Failed to create job schedulers for new prompts:", err));
	}

	// A grounded target added to a prompt that already runs has no history of
	// its own, so it is due immediately — but the prompt's next job is a whole
	// cadence away, and the customer has just paid for the slot.
	await expeditePromptRuns(promptsGainingPremium(existingById, saved));

	return saved;
}
