/**
 * Diagnostic script to compare v1 vs v2 row counts for a specific brand
 * 
 * Run with: pnpm tsx --env-file=.env scripts/diagnose-v2-mismatch.ts
 */

import * as v1 from "@/lib/tinybird-read";
import * as v2 from "@/lib/tinybird-read-v2";
import { queryTinybird } from "@/lib/tinybird-read-v2";

const BRAND_ID = "b1957fb2-445f-410d-b516-ddce4ebc27cb";

interface CountResult {
	count: number;
}

interface PromptCountResult {
	prompt_id: string;
	count: number;
}

async function diagnose() {
	console.log(`Diagnosing brand: ${BRAND_ID}\n`);

	// Compare total row counts (with and without FINAL)
	const [v1Total, v1TotalFinal, v2Total, v2TotalFinal] = await Promise.all([
		queryTinybird<CountResult>(`SELECT count() as count FROM prompt_runs WHERE brand_id = {brandId:String}`, { brandId: BRAND_ID }),
		queryTinybird<CountResult>(`SELECT count() as count FROM prompt_runs FINAL WHERE brand_id = {brandId:String}`, { brandId: BRAND_ID }),
		queryTinybird<CountResult>(`SELECT count() as count FROM prompt_runs_v2 WHERE brand_id = {brandId:String}`, { brandId: BRAND_ID }),
		queryTinybird<CountResult>(`SELECT count() as count FROM prompt_runs_v2 FINAL WHERE brand_id = {brandId:String}`, { brandId: BRAND_ID }),
	]);

	console.log("=== Total Row Counts ===");
	console.log(`v1 (no FINAL):   ${v1Total[0].count}`);
	console.log(`v1 (with FINAL): ${v1TotalFinal[0].count}`);
	console.log(`v2 (no FINAL):   ${v2Total[0].count}`);
	console.log(`v2 (with FINAL): ${v2TotalFinal[0].count}`);
	console.log(`\nv1 duplicates: ${v1Total[0].count - v1TotalFinal[0].count}`);
	console.log(`v2 duplicates: ${v2Total[0].count - v2TotalFinal[0].count}`);
	console.log(`Difference (v2 FINAL - v1 FINAL): ${v2TotalFinal[0].count - v1TotalFinal[0].count}`);

	// Check for IDs that exist in v2 but not v1 (or vice versa)
	const [onlyInV1, onlyInV2] = await Promise.all([
		queryTinybird<CountResult>(`
			SELECT count() as count 
			FROM prompt_runs FINAL 
			WHERE brand_id = {brandId:String}
				AND id NOT IN (SELECT id FROM prompt_runs_v2 FINAL WHERE brand_id = {brandId:String})
		`, { brandId: BRAND_ID }),
		queryTinybird<CountResult>(`
			SELECT count() as count 
			FROM prompt_runs_v2 FINAL 
			WHERE brand_id = {brandId:String}
				AND id NOT IN (SELECT id FROM prompt_runs FINAL WHERE brand_id = {brandId:String})
		`, { brandId: BRAND_ID }),
	]);

	console.log("\n=== Missing Records ===");
	console.log(`IDs only in v1 (not in v2): ${onlyInV1[0].count}`);
	console.log(`IDs only in v2 (not in v1): ${onlyInV2[0].count}`);

	// Per-prompt breakdown
	const [v1ByPrompt, v2ByPrompt] = await Promise.all([
		queryTinybird<PromptCountResult>(`
			SELECT prompt_id, count() as count 
			FROM prompt_runs FINAL 
			WHERE brand_id = {brandId:String}
			GROUP BY prompt_id
			ORDER BY count DESC
		`, { brandId: BRAND_ID }),
		queryTinybird<PromptCountResult>(`
			SELECT prompt_id, count() as count 
			FROM prompt_runs_v2 FINAL 
			WHERE brand_id = {brandId:String}
			GROUP BY prompt_id
			ORDER BY count DESC
		`, { brandId: BRAND_ID }),
	]);

	// Compare per-prompt
	const v1Map = new Map(v1ByPrompt.map(r => [r.prompt_id, r.count]));
	const v2Map = new Map(v2ByPrompt.map(r => [r.prompt_id, r.count]));

	const allPromptIds = new Set([...v1Map.keys(), ...v2Map.keys()]);
	const differences: { prompt_id: string; v1: number; v2: number; diff: number }[] = [];

	for (const promptId of allPromptIds) {
		const v1Count = v1Map.get(promptId) || 0;
		const v2Count = v2Map.get(promptId) || 0;
		if (v1Count !== v2Count) {
			differences.push({ prompt_id: promptId, v1: v1Count, v2: v2Count, diff: v2Count - v1Count });
		}
	}

	console.log("\n=== Per-Prompt Differences ===");
	if (differences.length === 0) {
		console.log("No differences found!");
	} else {
		console.log(`Found ${differences.length} prompts with different counts:`);
		differences.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
		differences.slice(0, 20).forEach(d => {
			console.log(`  ${d.prompt_id}: v1=${d.v1}, v2=${d.v2}, diff=${d.diff > 0 ? '+' : ''}${d.diff}`);
		});
	}

	// Check for duplicate IDs in v2 (same id appearing multiple times)
	const duplicateIds = await queryTinybird<{ id: string; cnt: number }>(`
		SELECT id, count() as cnt
		FROM prompt_runs_v2
		WHERE brand_id = {brandId:String}
		GROUP BY id
		HAVING cnt > 1
		ORDER BY cnt DESC
		LIMIT 10
	`, { brandId: BRAND_ID });

	console.log("\n=== Duplicate IDs in v2 (before FINAL) ===");
	if (duplicateIds.length === 0) {
		console.log("No duplicate IDs found");
	} else {
		console.log(`Found ${duplicateIds.length} IDs with duplicates:`);
		duplicateIds.forEach(d => {
			console.log(`  ${d.id}: ${d.cnt} copies`);
		});
	}
}

diagnose().catch(console.error);

// Also compare using the actual API functions
async function compareApiFunctions() {
	console.log("\n\n=== Comparing API Functions ===");
	
	const timezone = "UTC";
	const toDate = new Date();
	const fromDate = new Date();
	fromDate.setDate(fromDate.getDate() - 7); // Last 7 days
	
	const fromDateStr = fromDate.toISOString().split("T")[0];
	const toDateStr = toDate.toISOString().split("T")[0];
	
	console.log(`Date range: ${fromDateStr} to ${toDateStr}`);
	
	// Compare getPromptsSummary
	const [v1Summary, v2Summary] = await Promise.all([
		v1.getTinybirdPromptsSummary(BRAND_ID, fromDateStr, toDateStr, timezone),
		v2.getPromptsSummary(BRAND_ID, fromDateStr, toDateStr, timezone),
	]);
	
	console.log(`\nPrompts Summary (7 days):`);
	console.log(`  v1: ${v1Summary.length} prompts, total runs: ${v1Summary.reduce((s, p) => s + Number(p.total_runs), 0)}`);
	console.log(`  v2: ${v2Summary.length} prompts, total runs: ${v2Summary.reduce((s, p) => s + Number(p.total_runs), 0)}`);
	
	// Compare per-prompt
	const v1Map = new Map(v1Summary.map(p => [p.prompt_id, p]));
	const v2Map = new Map(v2Summary.map(p => [p.prompt_id, p]));
	
	const diffs: string[] = [];
	for (const [promptId, v1Data] of v1Map) {
		const v2Data = v2Map.get(promptId);
		if (!v2Data) {
			diffs.push(`${promptId}: only in v1`);
		} else if (Number(v1Data.total_runs) !== Number(v2Data.total_runs)) {
			diffs.push(`${promptId}: v1=${v1Data.total_runs}, v2=${v2Data.total_runs}`);
		}
	}
	for (const [promptId] of v2Map) {
		if (!v1Map.has(promptId)) {
			diffs.push(`${promptId}: only in v2`);
		}
	}
	
	if (diffs.length > 0) {
		console.log(`\n  Differences found:`);
		diffs.slice(0, 10).forEach(d => console.log(`    ${d}`));
	} else {
		console.log(`\n  No differences in prompts summary!`);
	}
	
	// Compare dashboard summary
	const [v1Dashboard, v2Dashboard] = await Promise.all([
		v1.getTinybirdDashboardSummary(BRAND_ID, fromDateStr, toDateStr, timezone),
		v2.getDashboardSummary(BRAND_ID, fromDateStr, toDateStr, timezone),
	]);
	
	console.log(`\nDashboard Summary (7 days):`);
	console.log(`  v1: total_runs=${v1Dashboard[0]?.total_runs}, total_prompts=${v1Dashboard[0]?.total_prompts}, avg_visibility=${v1Dashboard[0]?.avg_visibility}`);
	console.log(`  v2: total_runs=${v2Dashboard[0]?.total_runs}, total_prompts=${v2Dashboard[0]?.total_prompts}, avg_visibility=${v2Dashboard[0]?.avg_visibility}`);
	
	// Compare visibility time series  
	const [v1Visibility, v2Visibility] = await Promise.all([
		v1.getTinybirdVisibilityTimeSeries(BRAND_ID, fromDateStr, toDateStr, timezone, []),
		v2.getVisibilityTimeSeries(BRAND_ID, fromDateStr, toDateStr, timezone, []),
	]);
	
	const v1TotalRuns = v1Visibility.reduce((s, p) => s + Number(p.total_runs), 0);
	const v2TotalRuns = v2Visibility.reduce((s, p) => s + Number(p.total_runs), 0);
	
	console.log(`\nVisibility Time Series (7 days):`);
	console.log(`  v1: ${v1Visibility.length} data points, total_runs=${v1TotalRuns}`);
	console.log(`  v2: ${v2Visibility.length} data points, total_runs=${v2TotalRuns}`);
}

compareApiFunctions().catch(console.error);

