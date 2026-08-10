import { createHash } from "node:crypto";
import { RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { providerCallReservations, type ReportProviderPlanSnapshot, reports } from "@workspace/lib/db/schema";
import { analyzeBrand } from "@workspace/lib/onboarding";
import {
	errorHasAcceptedTask,
	type ModelConfig,
	ProviderFatalError,
	parseScrapeTargets,
} from "@workspace/lib/providers";
import { getReportMaxProviderCalls } from "@workspace/lib/scheduler";
import { computeSystemTags, isPromptBranded } from "@workspace/lib/tag-utils";
import { and, eq, ne, sql } from "drizzle-orm";
import { ProviderAdmissionDeferredError } from "./scheduler/admission";
import { runReservedProviderCall } from "./scheduler/reserved-provider";
import { runReservedStructuredResearch } from "./scheduler/reserved-structured";

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

// Report constants
const TARGET_PROMPTS_COUNT = 70;
const CANDIDATE_PROMPTS_COUNT = Math.ceil(TARGET_PROMPTS_COUNT * 1.2);

function fingerprintProviderRequest(config: ModelConfig, promptValue: string): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				provider: config.provider,
				model: config.model,
				version: config.version ?? null,
				webSearch: config.webSearch,
				promptValue,
			}),
		)
		.digest("hex");
}

// Whitelabel deployments preserve the legacy asymmetric per-candidate sample
// counts used before SCRAPE_TARGETS drove dispatch. Any model outside this map
// on a whitelabel deployment is a configuration error (the legacy report flow
// only knew how to sample these three). Other deployment modes use
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
	return RUNS_PER_PROMPT;
}

type ReportProviderPlan = ReportProviderPlanSnapshot;
type ReportTargetPlan = ReportProviderPlan["targets"][number];

function plannedProviderCalls(plan: Pick<ReportProviderPlan, "candidatePromptCount" | "targets">): number {
	return 1 + plan.candidatePromptCount * plan.targets.reduce((sum, target) => sum + target.runs, 0);
}

function parseReportProviderPlan(value: unknown): ReportProviderPlan {
	if (!value || typeof value !== "object") throw new ProviderFatalError("Report provider plan is missing or invalid");
	const plan = value as Partial<ReportProviderPlan>;
	if (
		plan.version !== 1 ||
		!Number.isSafeInteger(plan.candidatePromptCount) ||
		(plan.candidatePromptCount ?? -1) < 0 ||
		!Array.isArray(plan.targets)
	) {
		throw new ProviderFatalError("Report provider plan failed validation");
	}
	for (const target of plan.targets) {
		if (
			!target ||
			!Number.isSafeInteger(target.runs) ||
			target.runs < 1 ||
			!target.config ||
			typeof target.config.model !== "string" ||
			typeof target.config.provider !== "string" ||
			typeof target.config.webSearch !== "boolean" ||
			(target.config.version !== undefined && typeof target.config.version !== "string")
		) {
			throw new ProviderFatalError("Report provider target plan failed validation");
		}
	}
	return plan as ReportProviderPlan;
}

async function getOrCreateReportProviderPlan(reportId: string, manualPromptCount: number): Promise<ReportProviderPlan> {
	return db.transaction(async (tx) => {
		const rows = await tx.execute(sql`
			SELECT provider_plan
			FROM reports
			WHERE id = ${reportId}
			FOR UPDATE
		`);
		const row = rows.rows[0] as { provider_plan: unknown | null } | undefined;
		if (!row) throw new ProviderFatalError(`Report ${reportId} does not exist`);
		if (row.provider_plan !== null) return parseReportProviderPlan(row.provider_plan);

		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);
		const targets = configs.map((config) => ({ config, runs: getReportRunsForModel(config.model) }));
		const candidatePromptCount = manualPromptCount > 0 ? manualPromptCount : CANDIDATE_PROMPTS_COUNT;
		const maxProviderCalls = getReportMaxProviderCalls();
		const plannedCalls = plannedProviderCalls({ candidatePromptCount, targets });
		if (plannedCalls > maxProviderCalls) {
			throw new ProviderFatalError(
				`Report plans ${plannedCalls} provider calls, exceeding REPORT_MAX_PROVIDER_CALLS=${maxProviderCalls}`,
			);
		}
		const plan: ReportProviderPlan = {
			version: 1,
			candidatePromptCount,
			targets,
		};
		await tx.execute(sql`
			UPDATE reports
			SET provider_plan = ${JSON.stringify(plan)}::json, updated_at = now()
			WHERE id = ${reportId} AND provider_plan IS NULL
		`);
		return plan;
	});
}

export interface ReportJobData {
	reportId: string;
	brandName: string;
	brandWebsite: string;
	manualPrompts?: string[];
	generationDeadlineAt?: string;
}

export interface ReportJobContext {
	data: ReportJobData;
	workerId: string;
	log: (message: string) => void;
	updateProgress: (progress: number) => void | Promise<void>;
	signal?: AbortSignal;
	finalAttempt?: boolean;
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

// Function to select optimal prompts from candidates based on test results
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
	// Calculate metrics for each candidate
	const scoredCandidates = candidateResults.map((candidate) => {
		const totalRuns = candidate.runs.length;
		const brandMentionCount = candidate.runs.filter((r) => r.brandMentioned).length;
		const competitorMentionCount = candidate.runs.filter((r) => r.competitorsMentioned.length > 0).length;

		const brandMentionRate = totalRuns > 0 ? brandMentionCount / totalRuns : 0;
		const competitorMentionRate = totalRuns > 0 ? competitorMentionCount / totalRuns : 0;

		// Check if prompt is actually branded (contains brand name/domain)
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

	// Separate branded and non-branded prompts
	const nonBrandedPrompts = scoredCandidates.filter((c) => !c.brandedPrompt);
	const brandedPrompts = scoredCandidates.filter((c) => c.brandedPrompt);

	// Sort non-branded by: 1) has brand mention, 2) competitor mention rate, 3) brand mention rate
	nonBrandedPrompts.sort((a, b) => {
		if (a.hasBrandMention !== b.hasBrandMention) {
			return a.hasBrandMention ? -1 : 1;
		}
		if (Math.abs(a.competitorMentionRate - b.competitorMentionRate) > 0.1) {
			return b.competitorMentionRate - a.competitorMentionRate;
		}
		return b.brandMentionRate - a.brandMentionRate;
	});

	// Sort branded by: 1) brand mention rate, 2) competitor mention rate
	brandedPrompts.sort((a, b) => {
		if (Math.abs(a.brandMentionRate - b.brandMentionRate) > 0.1) {
			return b.brandMentionRate - a.brandMentionRate;
		}
		return b.competitorMentionRate - a.competitorMentionRate;
	});

	// Select prompts to meet brand mention requirements
	const selectedPrompts: string[] = [];
	let currentBrandMentions = 0;

	// First, add non-branded prompts with brand mentions
	for (const prompt of nonBrandedPrompts) {
		if (selectedPrompts.length >= TARGET_PROMPTS_COUNT) break;

		selectedPrompts.push(prompt.promptValue);
		if (prompt.hasBrandMention) {
			currentBrandMentions++;
		}
	}

	// If we need more prompts or more brand mentions, add branded prompts
	while (selectedPrompts.length < TARGET_PROMPTS_COUNT && brandedPrompts.length > 0) {
		const prompt = brandedPrompts.shift()!;
		selectedPrompts.push(prompt.promptValue);
		if (prompt.hasBrandMention) {
			currentBrandMentions++;
		}
	}

	// Log selection summary
	console.log(`Selected ${selectedPrompts.length} prompts with estimated ${currentBrandMentions} brand mentions`);

	return selectedPrompts;
}

// Function to check for brand and competitor mentions
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

	// Extract domain from brandWebsite using URL constructor
	const url = new URL(brandWebsite.startsWith("http") ? brandWebsite : `https://${brandWebsite}`);
	const domain = url.hostname.replace(/^www\./, "").toLowerCase();

	// Check for brand mention (brand name or domain)
	const brandMentioned = contentLower.includes(brandNameLower) || contentLower.includes(domain);

	// Check for competitor mentions (by name or domain)
	const competitorsMentioned = competitors
		.filter((competitor) => {
			const nameMatch = contentLower.includes(competitor.name.toLowerCase());

			// Extract domain from competitor website
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

// Function to run a prompt across different models and return results.
// Iterates SCRAPE_TARGETS; per-model run count comes from getReportRunsForModel
// (whitelabel preserves the legacy 2+1+1 mapping; other modes match day-to-day
// tracking frequency).
async function runPrompt(
	promptValue: string,
	workPrefix: string,
	brandName: string,
	brandWebsite: string,
	competitors: CompetitorResult[],
	targetPlans: ReportTargetPlan[],
	providerPlan: ReportProviderPlan,
	job: ReportJobContext,
): Promise<PromptRunResult> {
	const runOne = async (target: ReportTargetPlan, runIndex: number, targetIndex: number) => {
		const config = target.config;
		const result = await runReservedProviderCall({
			ownerType: "report",
			ownerId: job.data.reportId,
			workKey: `${workPrefix}:target:${targetIndex}:run:${runIndex}`,
			requestFingerprint: fingerprintProviderRequest(config, promptValue),
			requestMetadata: {
				prompt: promptValue,
				model: config.model,
				provider: config.provider,
				version: config.version ?? null,
				webSearch: config.webSearch,
				targetIndex,
			},
			workerId: job.workerId,
			config,
			prompt: promptValue,
			ownerMaxCalls: plannedProviderCalls(providerPlan),
			signal: job.signal,
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

	const runResults: Awaited<ReturnType<typeof runOne>>[] = [];
	for (const [targetIndex, target] of targetPlans.entries()) {
		for (let runIndex = 0; runIndex < target.runs; runIndex++) {
			job.signal?.throwIfAborted();
			runResults.push(await runOne(target, runIndex, targetIndex));
		}
	}

	job.log(`Completed ${runResults.length} runs for prompt: "${promptValue}"`);

	return {
		promptValue,
		runs: runResults,
	};
}

// Main report worker function
export async function processReportJob(job: ReportJobContext) {
	const { reportId, brandName, brandWebsite, manualPrompts } = job.data;

	job.log(`Processing report ID: ${reportId} for brand: ${brandName}`);

	// Determine if we're using manual prompts
	const useManualPrompts = Boolean(manualPrompts && manualPrompts.length > 0);
	if (useManualPrompts) {
		job.log(`Using ${manualPrompts?.length ?? 0} manual prompts - skipping auto-generation`);
	}

	try {
		const [existingReport] = await db
			.select({ status: reports.status })
			.from(reports)
			.where(eq(reports.id, reportId))
			.limit(1);
		if (!existingReport) throw new ProviderFatalError(`Report ${reportId} does not exist`);
		if (existingReport.status === "completed") {
			await job.updateProgress(100);
			job.log(`Report ${reportId} is already completed`);
			return { success: true, reportId };
		}

		const providerPlan = await getOrCreateReportProviderPlan(reportId, manualPrompts?.length ?? 0);
		job.log(`Provider-call budget: ${plannedProviderCalls(providerPlan)} planned units`);
		job.signal?.throwIfAborted();
		job.log(`Report ${reportId} claimed for processing`);
		job.updateProgress(5);

		// Step 1: Analyze brand — competitors + candidate prompts in one shared
		// LLM call (same `analyzeBrand` the onboarding flow uses; provider-
		// agnostic with native web search wired in). Manual-prompt path skips
		// the prompt generation but still needs competitors.
		job.log(`Analyzing brand: ${brandWebsite}`);
		job.signal?.throwIfAborted();
		const suggestion = await analyzeBrand({
			website: brandWebsite,
			brandName,
			maxPrompts: useManualPrompts ? 0 : providerPlan.candidatePromptCount,
			structuredResearchRunner: (prompt, schema) =>
				runReservedStructuredResearch(
					{
						ownerType: "report",
						ownerId: reportId,
						workKey: "brand-analysis",
						workerId: job.workerId,
						ownerMaxCalls: plannedProviderCalls(providerPlan),
						requestMetadata: { reportId, brandName, brandWebsite },
						signal: job.signal,
					},
					prompt,
					schema,
				),
		});
		// The report renderer's CompetitorResult expects a single primary domain;
		// analyzeBrand returns the full list now. Take the first as the canonical
		// one for the report's UI (which doesn't display the rest anyway).
		const competitors: CompetitorResult[] = suggestion.competitors
			.filter((c) => c.domains.length > 0)
			.map((c) => ({ name: c.name, domain: c.domains[0] }));
		job.updateProgress(35);

		// Step 2: Build candidate prompt list — manual override or analyzeBrand output
		const candidatePrompts: { prompt: string; brandedPrompt: boolean }[] = useManualPrompts
			? (manualPrompts ?? []).map((prompt) => ({
					prompt: prompt.toLowerCase().trim(),
					brandedPrompt: isPromptBranded(prompt, brandName, brandWebsite),
				}))
			: suggestion.suggestedPrompts.map((p) => ({
					prompt: p.prompt,
					brandedPrompt: isPromptBranded(p.prompt, brandName, brandWebsite),
				}));
		if (candidatePrompts.length > providerPlan.candidatePromptCount) {
			throw new ProviderFatalError("Report candidate set exceeds its immutable provider plan");
		}

		if (candidatePrompts.length === 0) {
			job.log(`No candidate prompts available, report cannot continue`);
			throw new Error("No candidate prompts available");
		}
		job.log(
			`${useManualPrompts ? "Using" : "Generated"} ${candidatePrompts.length} candidate prompts ` +
				`(${candidatePrompts.filter((p) => p.brandedPrompt).length} branded)`,
		);
		job.updateProgress(40);

		// Step 4: Run all candidate prompts to test them
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

		for (let i = 0; i < candidatePrompts.length; i++) {
			job.signal?.throwIfAborted();
			const candidate = candidatePrompts[i];
			if (!candidate) continue;
			const result = await runPrompt(
				candidate.prompt,
				`candidate:${i}`,
				brandName,
				brandWebsite,
				competitors,
				providerPlan.targets,
				providerPlan,
				job,
			);
			completedCandidates++;
			const progress = 40 + (completedCandidates / totalCandidates) * 30;
			job.updateProgress(progress);
			candidateResults.push({
				promptValue: result.promptValue,
				brandedPrompt: candidate.brandedPrompt,
				runs: result.runs,
			});
		}

		job.updateProgress(70);

		// Step 5: Select optimal prompts from candidates
		job.log(`Selecting optimal ${TARGET_PROMPTS_COUNT} prompts from ${candidateResults.length} candidates`);
		const selectedPromptValues = selectOptimalPrompts(candidateResults, brandName, brandWebsite);
		job.updateProgress(75);

		// Step 6: Re-run selected prompts for final data
		job.log(`Running final ${selectedPromptValues.length} selected prompts`);
		const promptRuns: PromptRunResult[] = [];
		const totalFinalRuns = selectedPromptValues.length;
		let completedFinalRuns = 0;

		// Get the results for selected prompts from candidateResults
		const selectedPromptResults = candidateResults.filter((result) =>
			selectedPromptValues.includes(result.promptValue),
		);

		// Use existing results instead of re-running
		for (const result of selectedPromptResults) {
			promptRuns.push({
				promptValue: result.promptValue,
				runs: result.runs,
			});
			completedFinalRuns++;
			const progress = 75 + (completedFinalRuns / totalFinalRuns) * 20; // 75-95%
			job.updateProgress(progress);
		}

		job.updateProgress(95);

		// Create prompts data structure for storage
		const prompts: PromptData[] = selectedPromptValues.map((promptValue) => ({
			brandId: reportId,
			value: promptValue,
			enabled: true,
			tags: [],
			systemTags: computeSystemTags(promptValue, brandName, brandWebsite),
		}));

		// Create final report data
		const reportData: ReportData = {
			competitors,
			prompts,
			promptRuns,
		};

		job.log(`Finalizing report with ${promptRuns.length} prompt run results`);

		const completedAt = new Date();
		await db.transaction(async (tx) => {
			const [completed] = await tx
				.update(reports)
				.set({
					status: "completed",
					completedAt,
					updatedAt: completedAt,
					rawOutput: JSON.stringify(reportData),
				})
				.where(eq(reports.id, reportId))
				.returning({ id: reports.id });
			if (!completed) throw new ProviderFatalError(`Report ${reportId} no longer exists`);

			await tx
				.update(providerCallReservations)
				.set({ resultPayload: null, updatedAt: completedAt })
				.where(
					and(
						eq(providerCallReservations.ownerType, "report"),
						eq(providerCallReservations.ownerId, reportId),
						eq(providerCallReservations.releaseReason, "completed"),
					),
				);
		});

		job.updateProgress(100);
		job.log(`Successfully completed report ${reportId}`);
		return { success: true, reportId };
	} catch (error) {
		job.log(`Error processing report ${reportId}: ${error instanceof Error ? error.message : "Unknown error"}`);

		const terminal = error instanceof ProviderFatalError && !errorHasAcceptedTask(error);
		if (terminal || (job.finalAttempt && !(error instanceof ProviderAdmissionDeferredError))) {
			await db
				.update(reports)
				.set({ status: "failed", updatedAt: new Date() })
				.where(and(eq(reports.id, reportId), ne(reports.status, "completed")));
		} else {
			job.log("Leaving durable report state in processing for a safe retry");
		}

		throw error;
	}
}
