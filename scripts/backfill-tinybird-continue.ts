// Continue backfill from a specific ID (for rows added after bulk import)
// Run with: npx tsx scripts/backfill-tinybird-continue.ts --after "uuid-here"
//
// Use this after running `tb datasource append` with the bulk export

import { db } from "../src/lib/db/db";
import { prompts, promptRuns } from "../src/lib/db/schema";
import { eq, gt } from "drizzle-orm";
import {
	ingestPromptRuns,
	type TinybirdPromptRunEvent,
	type TinybirdCitationItem,
} from "../src/lib/tinybird";
import { extractTextContent, extractCitations } from "../src/lib/text-extraction";

const BATCH_SIZE = 100;

// Parse --after argument
const afterArg = process.argv.find((arg) => arg.startsWith("--after"));
const afterId = afterArg ? process.argv[process.argv.indexOf(afterArg) + 1] : "";

if (!afterId) {
	console.error("Usage: npx tsx scripts/backfill-tinybird-continue.ts --after <last-id>");
	console.error("\nThe last ID is printed by the convert script after bulk export.");
	process.exit(1);
}

console.log("Tinybird Backfill - Continuation Mode");
console.log(`  Starting after ID: ${afterId}`);
console.log(`  Batch size: ${BATCH_SIZE}`);
console.log("");

async function continueBackfill() {
	const startTime = Date.now();
	let lastId = afterId;
	let totalProcessed = 0;
	let totalQuarantined = 0;

	while (true) {
		const runs = await db
			.select({ run: promptRuns, prompt: prompts })
			.from(promptRuns)
			.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
			.where(gt(promptRuns.id, lastId))
			.orderBy(promptRuns.id)
			.limit(BATCH_SIZE);

		if (runs.length === 0) break;

		const events: TinybirdPromptRunEvent[] = runs.map(({ run, prompt }) => {
			const extractedCitations = extractCitations(run.rawOutput, run.modelGroup);
			const citations: TinybirdCitationItem[] = extractedCitations.map((c) => ({
				url: c.url,
				domain: c.domain,
				title: c.title || null,
			}));

			return {
				id: run.id,
				prompt_id: run.promptId,
				brand_id: prompt.brandId,
				model_group: run.modelGroup,
				model: run.model,
				web_search_enabled: run.webSearchEnabled ? 1 : 0,
				brand_mentioned: run.brandMentioned ? 1 : 0,
				competitors_mentioned: run.competitorsMentioned || [],
				web_queries: run.webQueries || [],
				text_content: extractTextContent(run.rawOutput, run.modelGroup),
				raw_output: JSON.stringify(run.rawOutput),
				citations,
				created_at: run.createdAt.toISOString(),
				competitor_count: (run.competitorsMentioned || []).length,
				has_competitor_mention: (run.competitorsMentioned || []).length > 0 ? 1 : 0,
			};
		});

		try {
			const result = await ingestPromptRuns(events);
			totalQuarantined += result.quarantined_rows;
			if (result.quarantined_rows > 0) {
				console.warn(`  ${result.quarantined_rows} quarantined`);
			}
		} catch (error: any) {
			console.error(`\nError after ID ${lastId}: ${error.message}`);
			throw error;
		}

		totalProcessed += events.length;
		lastId = runs[runs.length - 1].run.id;

		const elapsed = (Date.now() - startTime) / 1000;
		const rate = Math.round(totalProcessed / elapsed);
		process.stdout.write(`\r${totalProcessed} rows | ${rate}/s    `);
	}

	const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

	if (totalProcessed === 0) {
		console.log("No new rows found after the specified ID.");
	} else {
		console.log(`\n\n${"=".repeat(50)}`);
		console.log(`Done! ${totalProcessed.toLocaleString()} rows in ${totalTime}s`);
		console.log(`Quarantined: ${totalQuarantined}`);
		console.log("=".repeat(50));
	}
}

continueBackfill()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("\nFailed:", e);
		process.exit(1);
	});

