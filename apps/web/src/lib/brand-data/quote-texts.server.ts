import { db } from "@workspace/lib/db/db";
import { promptRuns, runExtractions, runMentions } from "@workspace/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { QuoteText } from "@/lib/brand-data/memory-entity-reads";

export async function loadQuoteTexts(brandId: string, runIds: string[]): Promise<QuoteText[]> {
	const rows = await db
		.select({ id: promptRuns.id, assessments: runMentions.assessments, text: runExtractions.textContent })
		.from(promptRuns)
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.where(and(eq(promptRuns.brandId, brandId), inArray(promptRuns.id, runIds)));
	return rows.flatMap((row) =>
		row.assessments?.brand ? [{ id: row.id, brand: row.assessments.brand, text_content: row.text ?? "" }] : [],
	);
}
