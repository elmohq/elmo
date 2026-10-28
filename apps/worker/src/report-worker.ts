import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getRunsPerPrompt } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { type Brand, brands, reports } from "@workspace/lib/db/schema";
import type { MentionConfig } from "@workspace/lib/mentions";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { getProvider, type ModelConfig } from "@workspace/lib/providers";
import { computeSystemTags, isPromptBranded } from "@workspace/lib/tag-utils";
import { extractRun } from "@workspace/lib/text-extraction";
import { eq } from "drizzle-orm";
import { mentionAnalyzer } from "./mention-judge/analyze";

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
	updateProgress: (progress: number) => void | Promise<void>;
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

// Whitelabel uses its fixed 2+1+1 mapping; other modes match day-to-day
// tracking frequency.
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
		await db.update(reports).set({ status: "processing", updatedAt: new Date() }).where(eq(reports.id, reportId));

		job.log(`Report ${reportId} marked as processing`);
		job.updateProgress(5);

		// Analyze competitors and candidate prompts in one shared
		// LLM call (same `analyzeBrand` the onboarding flow uses; provider-
		// agnostic with native web search wired in). Manual-prompt path skips
		// the prompt generation but still needs competitors.
		job.log(`Analyzing brand: ${brandWebsite}`);
		const suggestion = await analyzeBrand({
			website: brandWebsite,
			brandName,
			maxPrompts: useManualPrompts ? 0 : CANDIDATE_PROMPTS_COUNT,
		});
		// The report renderer's CompetitorResult expects a single primary domain;
		// analyzeBrand returns the full list now. Take the first as the canonical
		// one for the report's UI (which doesn't display the rest anyway).
		// A brand name variant listed as a competitor would count the brand's own
		// mentions against it.
		const brandNames = new Set([brandName, ...brandAliases].map((name) => name.trim().toLowerCase()));
		const competitors: CompetitorResult[] = suggestion.competitors
			.filter((c) => c.domains.length > 0 && !brandNames.has(c.name.trim().toLowerCase()))
			.map((c) => ({ name: c.name, domain: c.domains[0] }));
		job.updateProgress(35);

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
		job.updateProgress(40);

		job.log(`Testing ${candidatePrompts.length} candidate prompts`);
		const candidateResults: Array<{
			promptValue: string;
			brandedPrompt: boolean;
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
		}> = [];

		const totalCandidates = candidatePrompts.length;
		let completedCandidates = 0;
		let failedCandidates = 0;

		const batchSize = 20;
		for (let i = 0; i < candidatePrompts.length; i += batchSize) {
			const batch = candidatePrompts.slice(i, i + batchSize);
			const batchPromises = batch.map(async (candidate) => {
				try {
					const result = await runPrompt(
						candidate.prompt,
						brandName,
						brandAliases,
						brandWebsite,
						competitors,
						scrapeConfigs,
						job,
					);
					completedCandidates++;
					const progress = 40 + (completedCandidates / totalCandidates) * 30;
					job.updateProgress(progress);
					return {
						promptValue: result.promptValue,
						brandedPrompt: candidate.brandedPrompt,
						runs: result.runs,
					};
				} catch (error) {
					job.log(
						`Error testing candidate "${candidate.prompt}": ${error instanceof Error ? error.message : "Unknown error"}`,
					);
					failedCandidates++;
					completedCandidates++;
					const progress = 40 + (completedCandidates / totalCandidates) * 30;
					job.updateProgress(progress);
					return {
						promptValue: candidate.prompt,
						brandedPrompt: candidate.brandedPrompt,
						runs: [],
					};
				}
			});

			const batchResults = await Promise.all(batchPromises);
			candidateResults.push(...batchResults);

			// Avoid sending a new provider burst immediately after the previous batch.
			if (i + batchSize < candidatePrompts.length) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		// A report built from no answers would read as "never mentioned"; fail it instead.
		if (failedCandidates === candidatePrompts.length)
			throw new Error("Every candidate prompt failed: are the providers or the judge (Jev) down?");

		job.updateProgress(70);

		job.log(`Selecting optimal ${TARGET_PROMPTS_COUNT} prompts from ${candidateResults.length} candidates`);
		const selectedPromptValues = selectOptimalPrompts(candidateResults, brandName, brandAliases, brandWebsite);
		job.updateProgress(75);

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
			const progress = 75 + (completedFinalRuns / totalFinalRuns) * 20;
			job.updateProgress(progress);
		}

		job.updateProgress(95);

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

		await db
			.update(reports)
			.set({
				status: "completed",
				completedAt: new Date(),
				updatedAt: new Date(),
				rawOutput: JSON.stringify(reportData),
			})
			.where(eq(reports.id, reportId));

		job.updateProgress(100);
		job.log(`Successfully completed report ${reportId}`);
		return { success: true, reportId };
	} catch (error) {
		job.log(`Error processing report ${reportId}: ${error instanceof Error ? error.message : "Unknown error"}`);

		await db.update(reports).set({ status: "failed", updatedAt: new Date() }).where(eq(reports.id, reportId));

		throw error;
	}
}
