import type { Job } from "pg-boss";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, promptRuns, prompts } from "@workspace/lib/db/schema";
import { analyzeMentions } from "@workspace/lib/mention-analysis";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq, gt } from "drizzle-orm";

export interface ReanalyzeBrandData {
	brandId: string;
}

const BATCH_SIZE = 100;

/**
 * Recompute brand_mentioned / competitors_mentioned for all of a brand's
 * prompt runs (and the branded/unbranded system tags of its prompts).
 *
 * Enqueued whenever brand identity (name, aliases, website, domains) or
 * competitors change in settings, so historical visibility numbers reflect
 * the new configuration instead of staying frozen at write time.
 *
 * Reads from the persisted text_content, falling back to extraction from
 * raw_output for rows the backfill hasn't reached yet (and populating
 * text_content along the way). Batched and idempotent.
 */
export async function reanalyzeBrandJob(jobs: Job<ReanalyzeBrandData>[]): Promise<void> {
	for (const job of jobs) {
		const { brandId } = job.data;
		console.log(`[reanalyze-brand] Starting re-analysis for brand ${brandId}`);

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
		if (!brand) {
			console.log(`[reanalyze-brand] Brand ${brandId} not found, skipping`);
			continue;
		}

		const brandCompetitors = await db.query.competitors.findMany({
			where: eq(competitors.brandId, brandId),
		});

		// Recompute branded/unbranded system tags — they depend on the brand
		// name/website, which may have changed.
		const brandPrompts = await db.query.prompts.findMany({ where: eq(prompts.brandId, brandId) });
		let retaggedPrompts = 0;
		for (const prompt of brandPrompts) {
			const systemTags = computeSystemTags(prompt.value, brand.name, brand.website);
			if (systemTags.join(",") !== (prompt.systemTags || []).join(",")) {
				await db.update(prompts).set({ systemTags }).where(eq(prompts.id, prompt.id));
				retaggedPrompts++;
			}
		}

		// Recompute mentions for all of the brand's runs.
		let processed = 0;
		let updated = 0;
		let skipped = 0;
		let lastId: string | null = null;

		for (;;) {
			const rows = await db
				.select({
					id: promptRuns.id,
					textContent: promptRuns.textContent,
					rawOutput: promptRuns.rawOutput,
					provider: promptRuns.provider,
					model: promptRuns.model,
				})
				.from(promptRuns)
				.where(and(eq(promptRuns.brandId, brandId), ...(lastId ? [gt(promptRuns.id, lastId)] : [])))
				.orderBy(asc(promptRuns.id))
				.limit(BATCH_SIZE);

			if (rows.length === 0) break;

			for (const row of rows) {
				processed++;
				const text = row.textContent ?? tryExtractTextContent(row.rawOutput, row.provider ?? row.model);
				if (text === null) {
					// No extractable answer text — leave the row untouched rather
					// than recomputing mentions against an empty string.
					skipped++;
					continue;
				}

				const { brandMentioned, competitorsMentioned } = analyzeMentions(text, brand, brandCompetitors);
				await db
					.update(promptRuns)
					.set({
						textContent: text,
						brandMentioned,
						competitorsMentioned,
						analyzedAt: new Date(),
					})
					.where(eq(promptRuns.id, row.id));
				updated++;
			}

			lastId = rows[rows.length - 1].id;
			console.log(`[reanalyze-brand] ${brandId}: processed=${processed} updated=${updated} skipped=${skipped}`);
		}

		console.log(
			`[reanalyze-brand] Done for brand ${brandId}: runs processed=${processed} updated=${updated} skipped=${skipped}, prompts retagged=${retaggedPrompts}`,
		);
	}
}
