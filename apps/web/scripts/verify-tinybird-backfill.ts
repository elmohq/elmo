// Verify Tinybird backfill data integrity
// Run with: npx tsx scripts/verify-tinybird-backfill.ts
//
// Compares row counts per prompt and spot-checks random rows

import { db } from "@workspace/lib/db/db";
import { prompts, promptRuns } from "@workspace/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const SPOT_CHECK_COUNT = 20;

// Query Tinybird directly
async function queryTinybird<T>(query: string): Promise<T[]> {
	const url = `${process.env.TINYBIRD_BASE_URL}/v0/sql?q=${encodeURIComponent(query)}`;
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${process.env.TINYBIRD_TOKEN}` },
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Tinybird query failed: ${response.status} - ${text}`);
	}

	const result = await response.json();
	
	// Handle different response formats
	if (result.data) {
		return result.data as T[];
	}
	if (Array.isArray(result)) {
		return result as T[];
	}
	
	console.log("Tinybird response:", JSON.stringify(result, null, 2));
	return [];
}

async function verifyRowCounts() {
	console.log("📊 Verifying row counts by prompt...");

	// Get counts per prompt from PostgreSQL
	const pgCounts = await db
		.select({ 
			promptId: promptRuns.promptId, 
			count: sql<number>`count(*)` 
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId);

	const pgCountMap = new Map(pgCounts.map(r => [r.promptId, Number(r.count)]));
	const pgTotal = pgCounts.reduce((sum, r) => sum + Number(r.count), 0);
	
	console.log(`  PostgreSQL: ${pgTotal.toLocaleString()} rows across ${pgCounts.length} prompts`);

	// Get counts per prompt from Tinybird
	const tbCounts = await queryTinybird<{ prompt_id: string; count: string | number }>(
		"SELECT prompt_id, count() as count FROM prompt_runs GROUP BY prompt_id FORMAT JSON"
	);
	
	const tbCountMap = new Map(tbCounts.map(r => [r.prompt_id, Number(r.count)]));
	const tbTotal = tbCounts.reduce((sum, r) => sum + Number(r.count), 0);

	console.log(`  Tinybird:   ${tbTotal.toLocaleString()} rows across ${tbCounts.length} prompts`);

	// Compare
	let matching = 0;
	let pgOnly = 0;
	let tbOnly = 0;
	let countMismatch = 0;
	const mismatches: { promptId: string; pg: number; tb: number }[] = [];

	// Check all PostgreSQL prompts
	for (const [promptId, pgCount] of pgCountMap) {
		const tbCount = tbCountMap.get(promptId) || 0;
		if (tbCount === 0) {
			pgOnly++;
		} else if (pgCount === tbCount) {
			matching++;
		} else {
			countMismatch++;
			mismatches.push({ promptId, pg: pgCount, tb: tbCount });
		}
	}

	// Check for prompts only in Tinybird
	for (const [promptId] of tbCountMap) {
		if (!pgCountMap.has(promptId)) {
			tbOnly++;
		}
	}

	console.log(`\n  Prompt comparison:`);
	console.log(`    Matching counts:    ${matching}`);
	console.log(`    Count mismatches:   ${countMismatch}`);
	console.log(`    Only in PostgreSQL: ${pgOnly}`);
	console.log(`    Only in Tinybird:   ${tbOnly}`);

	// Verify ALL mismatches are due to duplicates
	let confirmedDuplicates = 0;
	let hasMissingData = 0;
	
	if (mismatches.length > 0) {
		console.log(`\n  Verifying all ${mismatches.length} mismatches...`);
		
		for (let i = 0; i < mismatches.length; i++) {
			const m = mismatches[i];
			const diff = m.tb - m.pg;
			
			process.stdout.write(`\r    Checking ${i + 1}/${mismatches.length}...`);
			
			// Get all IDs from PostgreSQL for this prompt
			const pgIds = await db
				.select({ id: promptRuns.id })
				.from(promptRuns)
				.where(eq(promptRuns.promptId, m.promptId));
			
			// Get unique IDs from Tinybird for this prompt
			const tbIds = await queryTinybird<{ id: string }>(
				`SELECT DISTINCT id FROM prompt_runs WHERE prompt_id = '${m.promptId}' FORMAT JSON`
			);
			const tbIdSet = new Set(tbIds.map(r => r.id));
			
			// Check how many PG IDs exist in Tinybird
			const tbMatchCount = pgIds.filter(({ id }) => tbIdSet.has(id)).length;
			
			const allPgExistInTb = tbMatchCount === pgIds.length;
			if (allPgExistInTb) {
				confirmedDuplicates++;
			} else {
				hasMissingData++;
				console.log(`\n    ⚠️ ${m.promptId.slice(0, 8)}...: PG=${m.pg}, TB=${m.tb} (${diff > 0 ? '+' : ''}${diff}) - missing ${pgIds.length - tbMatchCount} rows`);
			}
		}
		
		console.log(`\r    Checked ${mismatches.length} mismatches                    `);
		console.log(`    Confirmed duplicates only: ${confirmedDuplicates}`);
		if (hasMissingData > 0) {
			console.log(`    ⚠️ Has missing data: ${hasMissingData}`);
		}
	}

	const totalDiff = tbTotal - pgTotal;
	const allMatch = countMismatch === 0 && pgOnly === 0 && tbOnly === 0;
	const allMismatchesAreDuplicates = hasMissingData === 0;

	if (allMatch) {
		console.log(`\n  ✅ All prompt counts match!`);
	} else if (allMismatchesAreDuplicates && totalDiff > 0) {
		console.log(`\n  ✅ All mismatches are duplicates (${totalDiff} extra rows in Tinybird)`);
	} else if (totalDiff > 0) {
		console.log(`\n  ⚠️  Tinybird has ${totalDiff} extra rows`);
	} else if (totalDiff < 0) {
		console.log(`\n  ⚠️  Tinybird is missing ${Math.abs(totalDiff)} rows`);
	}

	return { pgTotal, tbTotal, matching, countMismatch, pgOnly, tbOnly, totalDiff, allMismatchesAreDuplicates };
}

async function spotCheckRows() {
	console.log(`\n🔍 Spot checking ${SPOT_CHECK_COUNT} random rows...`);

	// Get random rows from PostgreSQL with full data
	const pgRows = await db
		.select({ run: promptRuns, prompt: prompts })
		.from(promptRuns)
		.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
		.orderBy(sql`random()`)
		.limit(SPOT_CHECK_COUNT);

	let matchCount = 0;
	let mismatchCount = 0;
	let missingCount = 0;

	// Check each row one at a time (faster than IN query)
	for (const { run, prompt } of pgRows) {
		try {
			const tbRows = await queryTinybird<{
				id: string;
				prompt_id: string;
				brand_id: string;
				model_group: string;
				model: string;
				brand_mentioned: number;
				web_search_enabled: number;
				competitors_mentioned: string[];
				raw_output: string;
				created_at: string;
			}>(`SELECT id, prompt_id, brand_id, model_group, model, brand_mentioned, web_search_enabled, competitors_mentioned, raw_output, created_at FROM prompt_runs WHERE id = '${run.id}' LIMIT 1 FORMAT JSON`);

			const tbRow = tbRows[0];

			if (!tbRow) {
				console.log(`  ❌ Missing in Tinybird: ${run.id}`);
				missingCount++;
				continue;
			}

			// Compare key fields
			const issues: string[] = [];

			if (tbRow.prompt_id !== run.promptId) {
				issues.push(`prompt_id`);
			}
			if (tbRow.brand_id !== prompt.brandId) {
				issues.push(`brand_id`);
			}
			if (tbRow.model_group !== run.modelGroup) {
				issues.push(`model_group`);
			}
			if (tbRow.model !== run.model) {
				issues.push(`model`);
			}
			if (tbRow.brand_mentioned !== (run.brandMentioned ? 1 : 0)) {
				issues.push(`brand_mentioned`);
			}
			if (tbRow.web_search_enabled !== (run.webSearchEnabled ? 1 : 0)) {
				issues.push(`web_search_enabled`);
			}

			// Compare competitors_mentioned as sets
			const pgCompetitors = new Set(run.competitorsMentioned || []);
			const tbCompetitors = new Set(tbRow.competitors_mentioned || []);
			const competitorsMatch = 
				pgCompetitors.size === tbCompetitors.size && 
				[...pgCompetitors].every(c => tbCompetitors.has(c));
			if (!competitorsMatch) {
				issues.push(`competitors_mentioned (PG: ${[...pgCompetitors].join(",")} vs TB: ${[...tbCompetitors].join(",")})`);
			}

			// Compare raw_output (should be JSON stringified the same)
			const pgRawOutput = JSON.stringify(run.rawOutput);
			if (tbRow.raw_output !== pgRawOutput) {
				// Check if they're semantically equal (might differ in whitespace/formatting)
				try {
					const tbParsed = JSON.parse(tbRow.raw_output);
					const pgParsed = run.rawOutput;
					if (JSON.stringify(tbParsed) !== JSON.stringify(pgParsed)) {
						issues.push(`raw_output (length PG: ${pgRawOutput.length}, TB: ${tbRow.raw_output.length})`);
					}
				} catch {
					issues.push(`raw_output (parse error)`);
				}
			}

			// Compare created_at timestamps
			// PostgreSQL returns UTC, Tinybird might return without timezone suffix
			const pgDate = run.createdAt;
			const pgUtcMs = pgDate.getTime();
			
			// Tinybird returns format like "2025-08-29 19:59:27.362" - append Z to parse as UTC
			const tbDateStr = tbRow.created_at;
			const tbUtcMs = tbDateStr.endsWith('Z') 
				? new Date(tbDateStr).getTime()
				: new Date(tbDateStr + 'Z').getTime();
			
			const timeDiffMs = Math.abs(pgUtcMs - tbUtcMs);
			if (timeDiffMs > 1000) {
				issues.push(`created_at (PG: ${pgDate.toISOString()}, TB: ${tbDateStr}, diff: ${timeDiffMs}ms)`);
			}

			if (issues.length > 0) {
				console.log(`  ❌ Mismatch ${run.id.slice(0, 8)}...: ${issues.join(", ")}`);
				mismatchCount++;
			} else {
				console.log(`  ✅ ${run.id.slice(0, 8)}...`);
				matchCount++;
			}
		} catch (error: any) {
			console.log(`  ⚠️ Error checking ${run.id}: ${error.message}`);
			missingCount++;
		}
	}

	console.log(`\n  Results: ${matchCount} ✅ match, ${mismatchCount} ❌ mismatch, ${missingCount} ⚠️ missing/error`);

	return { matchCount, mismatchCount, missingCount };
}

async function verify() {
	const startTime = Date.now();

	console.log("Tinybird Backfill Verification");
	console.log("=".repeat(50));
	console.log("");

	// Verify row counts
	const { pgTotal, tbTotal, matching, countMismatch, pgOnly, tbOnly, totalDiff, allMismatchesAreDuplicates } = await verifyRowCounts();

	// Spot check random rows
	const { matchCount, mismatchCount, missingCount } = await spotCheckRows();

	// Summary
	const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

	console.log(`\n${"=".repeat(60)}`);
	console.log("SUMMARY");
	console.log("=".repeat(60));
	console.log(`  PostgreSQL total:     ${pgTotal.toLocaleString()}`);
	console.log(`  Tinybird total:       ${tbTotal.toLocaleString()}`);
	console.log(`  Prompts matching:     ${matching}`);
	console.log(`  Prompts mismatched:   ${countMismatch}`);
	console.log(`  Only in PostgreSQL:   ${pgOnly}`);
	console.log(`  Only in Tinybird:     ${tbOnly}`);
	console.log(`  Spot check:           ${matchCount}/${SPOT_CHECK_COUNT} passed`);
	console.log(`  Time:                 ${totalTime}s`);
	console.log("=".repeat(60));

	const hasRealIssues = pgOnly > 0 || tbOnly > 0 || mismatchCount > 0 || missingCount > 0 || !allMismatchesAreDuplicates;
	
	if (!hasRealIssues && countMismatch === 0) {
		console.log("\n✅ Verification PASSED!");
		return true;
	} else if (!hasRealIssues && allMismatchesAreDuplicates && mismatchCount === 0 && missingCount === 0) {
		console.log("\n✅ Data correct (has duplicates - consider deduping)");
		return true;
	} else {
		console.log("\n⚠️  Some issues found - review above for details");
		return false;
	}
}

verify()
	.then((passed) => process.exit(passed ? 0 : 1))
	.catch((e) => {
		console.error("\nFailed:", e);
		process.exit(1);
	});

