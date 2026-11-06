import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getRunsPerPrompt } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { type Brand, brands, reports } from "@workspace/lib/db/schema";
import type { MentionConfig } from "@workspace/lib/mentions";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { getProvider, type ModelConfig } from "@workspace/lib/providers";
import { canAdvanceReport, type ReportPhase, type ReportStatus } from "@workspace/lib/reports/lifecycle";
import { computeSystemTags, isPromptBranded } from "@workspace/lib/tag-utils";
import { extractRun } from "@workspace/lib/text-extraction";
import { and, eq, inArray } from "drizzle-orm";
import { mentionAnalyzer } from "./mention-judge";

interface CompetitorResult {
	name: string;
	domain: string;
}

interface PromptData {
	brandId: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
}

const TARGET_PROMPTS_COUNT = 70;
const CANDIDATE_PROMPTS_COUNT = Math.ceil(TARGET_PROMPTS_COUNT * 1.2);
const MIN_BRAND_MENTIONS = 14;
const MAX_BRAND_MENTIONS = 28;

// Whitelabel reports use fixed asymmetric per-candidate sample counts. A model
// outside this map is a configuration error. Other deployment modes use
// RUNS_PER_PROMPT (same frequency as day-to-day prompt tracking).
const WHITELABEL_REPORT_RUNS_PER_MODEL: Record<string, number> = {
	chatgpt: 2,
	claude: 1,
	"google-ai-mode": 1,
};

function getReportRunsForModel(model: string): number {
	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		const count = WHITELABEL_REPORT_RUNS_PER_MODEL[model];
		if (count === undefined) {
			throw new Error(
				`Whitelabel report generation has no run count configured for model "${model}". ` +
					`Known models: ${Object.keys(WHITELABEL_REPORT_RUNS_PER_MODEL).join(", ")}.`,
			);
		}
		return count;
	}
	return getRunsPerPrompt();
}

export interface ReportJobData {
	reportId: string;
	brandName: string;
	/** Absent on jobs queued before reports stored brand name variants. */
	brandAliases?: string[];
	brandWebsite: string;
	manualPrompts?: string[];
}

export interface ReportJobContext {
	data: ReportJobData;
	log: (message: string) => void;
	enterPhase: (phase: ReportPhase) => void | Promise<void>;
}

interface PromptRunResult {
	promptValue: string;
	runs: Array<{
		model: string;
		version: string;
		webSearchEnabled: boolean;
		rawOutput: any;
		webQueries: string[];
		textContent: string;
		brandMentioned: boolean;
		competitorsMentioned: string[];
	}>;
}

interface ReportData {
	competitors: CompetitorResult[];
	prompts: PromptData[];
	promptRuns: PromptRunResult[];
}

function selectOptimalPrompts(
	candidateResults: Array<{
		promptValue: string;
		brandedPrompt: boolean;
		runs: Array<{
			brandMentioned: boolean;
			competitorsMentioned: string[];
		}>;
	}>,
	brandName: string,
	brandAliases: string[],
	brandWebsite: string,
): string[] {
	const scoredCandidates = candidateResults.map((candidate) => {
		const totalRuns = candidate.runs.length;
		const brandMentionCount = candidate.runs.filter((r) => r.brandMentioned).length;
		const competitorMentionCount = candidate.runs.filter((r) => r.competitorsMentioned.length > 0).length;

		const brandMentionRate = totalRuns > 0 ? brandMentionCount / totalRuns : 0;
		const competitorMentionRate = totalRuns > 0 ? competitorMentionCount / totalRuns : 0;

		const isActuallyBranded = isPromptBranded(candidate.promptValue, brandName, brandWebsite, brandAliases);

		return {
			promptValue: candidate.promptValue,
			brandedPrompt: candidate.brandedPrompt || isActuallyBranded,
			brandMentionRate,
			competitorMentionRate,
			hasBrandMention: brandMentionCount > 0,
			hasCompetitorMention: competitorMentionCount > 0,
		};
	});

	const nonBrandedPrompts = scoredCandidates.filter((c) => !c.brandedPrompt);
	const brandedPrompts = scoredCandidates.filter((c) => c.brandedPrompt);

	nonBrandedPrompts.sort((a, b) => {
		if (a.hasBrandMention !== b.hasBrandMention) {
			return a.hasBrandMention ? -1 : 1;
		}
		if (Math.abs(a.competitorMentionRate - b.competitorMentionRate) > 0.1) {
			return b.competitorMentionRate - a.competitorMentionRate;
		}
		return b.brandMentionRate - a.brandMentionRate;
	});

	brandedPrompts.sort((a, b) => {
		if (Math.abs(a.brandMentionRate - b.brandMentionRate) > 0.1) {
			return b.brandMentionRate - a.brandMentionRate;
		}
		return b.competitorMentionRate - a.competitorMentionRate;
	});

	const selectedPrompts: string[] = [];
	let currentBrandMentions = 0;

	for (const prompt of nonBrandedPrompts) {
		if (selectedPrompts.length >= TARGET_PROMPTS_COUNT) break;

		selectedPrompts.push(prompt.promptValue);
		if (prompt.hasBrandMention) {
			currentBrandMentions++;
		}
	}

	while (selectedPrompts.length < TARGET_PROMPTS_COUNT && brandedPrompts.length > 0) {
		const prompt = brandedPrompts.shift()!;
		selectedPrompts.push(prompt.promptValue);
		if (prompt.hasBrandMention) {
			currentBrandMentions++;
		}
	}

	console.log(`Selected ${selectedPrompts.length} prompts with estimated ${currentBrandMentions} brand mentions`);

	return selectedPrompts;
}

const JUDGE_ATTEMPTS = 3;
const JUDGE_RETRY_DELAY_MS = 5_000;

/** Judges a report's answer, retrying on its own: the answer is paid for and is never fetched again. */
async function judgeWithRetries(text: string, config: MentionConfig, question: string) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await mentionAnalyzer().analyze(text, config, null, question);
		} catch (error) {
			if (attempt >= JUDGE_ATTEMPTS) throw error;
			console.error(`Mention judge failed (attempt ${attempt} of ${JUDGE_ATTEMPTS}); retrying:`, error);
			await new Promise((resolve) => setTimeout(resolve, JUDGE_RETRY_DELAY_MS * attempt));
		}
	}
}

async function runPrompt(
	promptValue: string,
	brandName: string,
	brandAliases: string[],
	brandWebsite: string,
	competitors: CompetitorResult[],
	scrapeConfigs: ModelConfig[],
	job: ReportJobContext,
): Promise<PromptRunResult> {
	const mentionConfig = {
		brand: { name: brandName, aliases: brandAliases, domains: [brandWebsite] },
		competitors: competitors.map((competitor) => ({
			name: competitor.name,
			aliases: [],
			domains: [competitor.domain],
		})),
	};
	const callProvider = async (config: ModelConfig) => {
		const result = await getProvider(config.provider).run(config.model, promptValue, {
			webSearch: config.webSearch,
			version: config.version,
		});
		return { config, result, textContent: extractRun(result.rawOutput, config.provider).textContent ?? "" };
	};

	// Every provider call settles before any judging, so a judge failure retries only the judging.
	const answers = await Promise.all(
		scrapeConfigs.flatMap((config) =>
			Array.from({ length: getReportRunsForModel(config.model) }, () => callProvider(config)),
		),
	);
	const runResults = await Promise.all(
		answers.map(async ({ config, result, textContent }) => {
			const { brandMentioned, competitorsMentioned } = await judgeWithRetries(textContent, mentionConfig, promptValue);
			return {
				model: config.model,
				version: result.modelVersion ?? config.version ?? config.provider,
				webSearchEnabled: config.webSearch,
				rawOutput: result.rawOutput,
				webQueries: result.webQueries,
				textContent,
				brandMentioned,
				competitorsMentioned,
			};
		}),
	);

	job.log(`Completed ${runResults.length} runs for prompt: "${promptValue}"`);

	return {
		promptValue,
		runs: runResults,
	};
}

interface CandidateResult {
	promptValue: string;
	brandedPrompt: boolean;
	runs: PromptRunResult["runs"];
}

const CANDIDATE_BATCH_SIZE = 20;
const CANDIDATE_BATCH_PAUSE_MS = 1000;

// Failed candidates are kept with no runs so "all failed" can be told apart from "some did".
async function testCandidates(args: {
	candidatePrompts: { prompt: string; brandedPrompt: boolean }[];
	brandName: string;
	brandAliases: string[];
	brandWebsite: string;
	competitors: CompetitorResult[];
	scrapeConfigs: ModelConfig[];
	job: ReportJobContext;
}): Promise<CandidateResult[]> {
	const { candidatePrompts, brandName, brandAliases, brandWebsite, competitors, scrapeConfigs, job } = args;
	const total = candidatePrompts.length;
	const results: CandidateResult[] = [];
	let completed = 0;
	let failed = 0;

	await job.enterPhase({ kind: "testing-candidates", completed: 0, total });

	const testOne = async (candidate: { prompt: string; brandedPrompt: boolean }): Promise<CandidateResult> => {
		let runs: PromptRunResult["runs"] = [];
		try {
			runs = (await runPrompt(candidate.prompt, brandName, brandAliases, brandWebsite, competitors, scrapeConfigs, job))
				.runs;
		} catch (error) {
			job.log(
				`Error testing candidate "${candidate.prompt}": ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			failed++;
		}
		completed++;
		await job.enterPhase({ kind: "testing-candidates", completed, total });
		return { promptValue: candidate.prompt, brandedPrompt: candidate.brandedPrompt, runs };
	};

	for (let i = 0; i < candidatePrompts.length; i += CANDIDATE_BATCH_SIZE) {
		results.push(...(await Promise.all(candidatePrompts.slice(i, i + CANDIDATE_BATCH_SIZE).map(testOne))));
		// Avoid sending a new provider burst immediately after the previous batch.
		if (i + CANDIDATE_BATCH_SIZE < candidatePrompts.length)
			await new Promise((resolve) => setTimeout(resolve, CANDIDATE_BATCH_PAUSE_MS));
	}

	// A report built from no answers would read as "never mentioned"; fail it instead.
	if (total > 0 && failed === total)
		throw new Error("Every candidate prompt failed: are the providers or the judge (Jev) down?");

	return results;
}

// The status WHERE is the claim: a duplicate worker or a retry of a finished report becomes a no-op.
async function advanceReportStatus(
	reportId: string,
	next: ReportStatus,
	extra: Partial<typeof reports.$inferInsert> = {},
): Promise<boolean> {
	const claimable = (["pending", "processing"] as ReportStatus[]).filter((from) => canAdvanceReport(from, next));
	const claimed = await db
		.update(reports)
		.set({ status: next, updatedAt: new Date(), ...extra })
		.where(and(eq(reports.id, reportId), inArray(reports.status, claimable)))
		.returning({ id: reports.id });
	return claimed.length > 0;
}

export async function processReportJob(job: ReportJobContext) {
	const { reportId, brandName, brandWebsite, manualPrompts } = job.data;
	const brandAliases = job.data.brandAliases ?? [];

	job.log(`Processing report ID: ${reportId} for brand: ${brandName}`);

	const scrapeConfigs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

	const useManualPrompts = manualPrompts && manualPrompts.length > 0;
	if (useManualPrompts) {
		job.log(`Using ${manualPrompts.length} manual prompts - skipping auto-generation`);
	}

	try {
		// Before anything is spent: the answers a report pays for can't be judged without it.
		mentionAnalyzer();
		if (!(await advanceReportStatus(reportId, "processing"))) {
			job.log(`Report ${reportId} is already finished; not running it again`);
			return { success: false, reportId };
		}

		job.log(`Report ${reportId} marked as processing`);
		await job.enterPhase({ kind: "analyzing-brand" });

		// Manual prompts skip prompt generation but still need competitors.
		job.log(`Analyzing brand: ${brandWebsite}`);
		const suggestion = await analyzeBrand({
			website: brandWebsite,
			brandName,
			maxPrompts: useManualPrompts ? 0 : CANDIDATE_PROMPTS_COUNT,
		});
		// The report shows one domain per competitor. A brand name variant listed as
		// a competitor would count the brand's own mentions against it.
		const brandNames = new Set([brandName, ...brandAliases].map((name) => name.trim().toLowerCase()));
		const competitors: CompetitorResult[] = suggestion.competitors
			.filter((c) => c.domains.length > 0 && !brandNames.has(c.name.trim().toLowerCase()))
			.map((c) => ({ name: c.name, domain: c.domains[0] }));

		const candidatePrompts: { prompt: string; brandedPrompt: boolean }[] = useManualPrompts
			? manualPrompts.map((prompt) => ({
					prompt: prompt.toLowerCase().trim(),
					brandedPrompt: isPromptBranded(prompt, brandName, brandWebsite, brandAliases),
				}))
			: suggestion.suggestedPrompts.map((p) => ({
					prompt: p.prompt,
					brandedPrompt: isPromptBranded(p.prompt, brandName, brandWebsite, brandAliases),
				}));

		if (candidatePrompts.length === 0) {
			job.log(`No candidate prompts available, report cannot continue`);
			throw new Error("No candidate prompts available");
		}
		job.log(
			`${useManualPrompts ? "Using" : "Generated"} ${candidatePrompts.length} candidate prompts ` +
				`(${candidatePrompts.filter((p) => p.brandedPrompt).length} branded)`,
		);

		job.log(`Testing ${candidatePrompts.length} candidate prompts`);
		const candidateResults = await testCandidates({
			candidatePrompts,
			brandName,
			brandAliases,
			brandWebsite,
			competitors,
			scrapeConfigs,
			job,
		});

		await job.enterPhase({ kind: "selecting" });

		job.log(`Selecting optimal ${TARGET_PROMPTS_COUNT} prompts from ${candidateResults.length} candidates`);
		const selectedPromptValues = selectOptimalPrompts(candidateResults, brandName, brandAliases, brandWebsite);

		job.log(`Running final ${selectedPromptValues.length} selected prompts`);
		const promptRuns: PromptRunResult[] = [];
		const totalFinalRuns = selectedPromptValues.length;
		let completedFinalRuns = 0;

		const selectedPromptResults = candidateResults.filter((result) =>
			selectedPromptValues.includes(result.promptValue),
		);

		// Reuse the paid candidate runs when assembling the final report.
		for (const result of selectedPromptResults) {
			promptRuns.push({
				promptValue: result.promptValue,
				runs: result.runs,
			});
			completedFinalRuns++;
			await job.enterPhase({ kind: "assembling", completed: completedFinalRuns, total: totalFinalRuns });
		}

		await job.enterPhase({ kind: "finalizing" });

		const prompts: PromptData[] = selectedPromptValues.map((promptValue) => ({
			brandId: reportId,
			value: promptValue,
			enabled: true,
			tags: [],
			systemTags: computeSystemTags(promptValue, brandName, brandWebsite, brandAliases),
		}));

		const reportData: ReportData = {
			competitors,
			prompts,
			promptRuns,
		};

		job.log(`Finalizing report with ${promptRuns.length} prompt run results`);

		await advanceReportStatus(reportId, "completed", {
			completedAt: new Date(),
			rawOutput: JSON.stringify(reportData),
		});

		await job.enterPhase({ kind: "completed" });
		job.log(`Successfully completed report ${reportId}`);
		return { success: true, reportId };
	} catch (error) {
		job.log(`Error processing report ${reportId}: ${error instanceof Error ? error.message : "Unknown error"}`);

		await advanceReportStatus(reportId, "failed");

		throw error;
	}
}
