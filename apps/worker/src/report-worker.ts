import { getRunsPerPrompt } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { type Brand, brands, reports } from "@workspace/lib/db/schema";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { getProvider, type ModelConfig, parseScrapeTargets } from "@workspace/lib/providers";
import { computeSystemTags, isPromptBranded } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";

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
	brandWebsite: string,
): string[] {
	const scoredCandidates = candidateResults.map((candidate) => {
		const totalRuns = candidate.runs.length;
		const brandMentionCount = candidate.runs.filter((r) => r.brandMentioned).length;
		const competitorMentionCount = candidate.runs.filter((r) => r.competitorsMentioned.length > 0).length;

		const brandMentionRate = totalRuns > 0 ? brandMentionCount / totalRuns : 0;
		const competitorMentionRate = totalRuns > 0 ? competitorMentionCount / totalRuns : 0;

		const isActuallyBranded = isPromptBranded(candidate.promptValue, brandName, brandWebsite);

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

function analyzeMentions(
	content: string,
	brandName: string,
	brandWebsite: string,
	competitors: CompetitorResult[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();
	const brandNameLower = brandName.toLowerCase();

	const url = new URL(brandWebsite.startsWith("http") ? brandWebsite : `https://${brandWebsite}`);
	const domain = url.hostname.replace(/^www\./, "").toLowerCase();

	const brandMentioned = contentLower.includes(brandNameLower) || contentLower.includes(domain);

	const competitorsMentioned = competitors
		.filter((competitor) => {
			const nameMatch = contentLower.includes(competitor.name.toLowerCase());

			const competitorUrl = new URL(
				competitor.domain.startsWith("http") ? competitor.domain : `https://${competitor.domain}`,
			);
			const competitorDomain = competitorUrl.hostname.replace(/^www\./, "").toLowerCase();

			const domainMatch = contentLower.includes(competitorDomain);
			return nameMatch || domainMatch;
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}

// Whitelabel uses its fixed 2+1+1 mapping; other modes match day-to-day
// tracking frequency.
async function runPrompt(
	promptValue: string,
	brandName: string,
	brandWebsite: string,
	competitors: CompetitorResult[],
	scrapeConfigs: ModelConfig[],
	job: ReportJobContext,
): Promise<PromptRunResult> {
	const runOne = async (config: ModelConfig) => {
		const providerImpl = getProvider(config.provider);
		const result = await providerImpl.run(config.model, promptValue, {
			webSearch: config.webSearch,
			version: config.version,
		});
		const { brandMentioned, competitorsMentioned } = analyzeMentions(
			result.textContent,
			brandName,
			brandWebsite,
			competitors,
		);
		return {
			model: config.model,
			version: result.modelVersion ?? config.version ?? config.provider,
			webSearchEnabled: config.webSearch,
			rawOutput: result.rawOutput,
			webQueries: result.webQueries,
			textContent: result.textContent,
			brandMentioned,
			competitorsMentioned,
		};
	};

	const runPromises = scrapeConfigs.flatMap((config) => {
		const count = getReportRunsForModel(config.model);
		return Array.from({ length: count }, () => runOne(config));
	});

	const runResults = await Promise.all(runPromises);

	job.log(`Completed ${runResults.length} runs for prompt: "${promptValue}"`);

	return {
		promptValue,
		runs: runResults,
	};
}

export async function processReportJob(job: ReportJobContext) {
	const { reportId, brandName, brandWebsite, manualPrompts } = job.data;

	job.log(`Processing report ID: ${reportId} for brand: ${brandName}`);

	const scrapeConfigs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

	const useManualPrompts = manualPrompts && manualPrompts.length > 0;
	if (useManualPrompts) {
		job.log(`Using ${manualPrompts.length} manual prompts - skipping auto-generation`);
	}

	try {
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
		const competitors: CompetitorResult[] = suggestion.competitors
			.filter((c) => c.domains.length > 0)
			.map((c) => ({ name: c.name, domain: c.domains[0] }));
		job.updateProgress(35);

		const candidatePrompts: { prompt: string; brandedPrompt: boolean }[] = useManualPrompts
			? manualPrompts.map((prompt) => ({
					prompt: prompt.toLowerCase().trim(),
					brandedPrompt: isPromptBranded(prompt, brandName, brandWebsite),
				}))
			: suggestion.suggestedPrompts.map((p) => ({
					prompt: p.prompt,
					brandedPrompt: isPromptBranded(p.prompt, brandName, brandWebsite),
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

		const batchSize = 20;
		for (let i = 0; i < candidatePrompts.length; i += batchSize) {
			const batch = candidatePrompts.slice(i, i + batchSize);
			const batchPromises = batch.map(async (candidate) => {
				try {
					const result = await runPrompt(candidate.prompt, brandName, brandWebsite, competitors, scrapeConfigs, job);
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

		job.updateProgress(70);

		job.log(`Selecting optimal ${TARGET_PROMPTS_COUNT} prompts from ${candidateResults.length} candidates`);
		const selectedPromptValues = selectOptimalPrompts(candidateResults, brandName, brandWebsite);
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
			systemTags: computeSystemTags(promptValue, brandName, brandWebsite),
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
