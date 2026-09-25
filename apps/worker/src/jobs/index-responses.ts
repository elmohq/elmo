import { db } from "@workspace/lib/db/db";
import { promptRuns } from "@workspace/lib/db/schema";
import { responseSearchVector, storableResponseText } from "@workspace/lib/response-search";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { desc, isNull, sql } from "drizzle-orm";

export interface IndexResponsesData {
	source?: string;
}

const BATCH_SIZE = 100;
// Leaves headroom under the minute between scheduled ticks.
const TIME_BUDGET_MS = 45_000;

/**
 * Fills `text_content` / `search_vector` on runs recorded before the worker
 * wrote them itself. Newest first, so recent history becomes searchable
 * soonest; once nothing is left each tick is a single empty index lookup.
 */
export async function indexResponsesJob(): Promise<void> {
	const deadline = Date.now() + TIME_BUDGET_MS;
	let indexed = 0;

	while (Date.now() < deadline) {
		const rows = await db
			.select({
				id: promptRuns.id,
				rawOutput: promptRuns.rawOutput,
				provider: promptRuns.provider,
				model: promptRuns.model,
			})
			.from(promptRuns)
			.where(isNull(promptRuns.textContent))
			.orderBy(desc(promptRuns.createdAt))
			.limit(BATCH_SIZE);
		if (rows.length === 0) break;

		const values = rows.map((row) => {
			// Same extraction the dashboard renders, so a match is always visible text.
			const text = storableResponseText(extractTextContent(row.rawOutput, row.provider ?? row.model));
			return sql`(${row.id}::uuid, ${text})`;
		});

		await db.execute(sql`
			UPDATE prompt_runs AS pr
			SET text_content = v.text, search_vector = ${responseSearchVector(sql`v.text`)}
			FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, text)
			WHERE pr.id = v.id AND pr.text_content IS NULL
		`);

		indexed += rows.length;
		if (rows.length < BATCH_SIZE) break;
	}

	if (indexed > 0) console.log(`[index-responses] Indexed ${indexed} responses`);
}
