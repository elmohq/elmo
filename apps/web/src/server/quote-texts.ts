import { db } from "@workspace/lib/db/db";
import { promptRuns, runExtractions, runMentions } from "@workspace/lib/db/schema";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import type { MentionAssessment } from "@workspace/lib/mentions";

export interface QuoteText {
	id: string;
	brand: MentionAssessment;
	text_content: string;
}

/** The answer text behind sentiment quotes the browser picked from its own copy of the rollups. */
export const getQuoteTextsFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), runIds: z.array(z.string().uuid()).max(50) }))
	.handler(async ({ data }): Promise<QuoteText[]> => {
		await requireBrandSession(data.brandId);
		if (data.runIds.length === 0) return [];
		const rows = await db
			.select({ id: promptRuns.id, assessments: runMentions.assessments, text: runExtractions.textContent })
			.from(promptRuns)
			.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
			.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
			.where(and(eq(promptRuns.brandId, data.brandId), inArray(promptRuns.id, data.runIds)));
		return rows.map((row) => ({
			id: row.id,
			brand: (row.assessments as { brand: MentionAssessment }).brand,
			text_content: row.text ?? "",
		}));
	});
