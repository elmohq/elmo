import { createHash } from "node:crypto";
import { RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { reports, type ReportProviderPlanSnapshot } from "@workspace/lib/db/schema";
import { analyzeBrand } from "@workspace/lib/onboarding";
import { normalizeStoredProviderPayload, validateProviderResult } from "@workspace/lib/provider-payload";
import {
	errorHasAcceptedTask,
	getProvider,
	isProviderDefinitivelyRejected,
	isProviderFatalError,
	type ModelConfig,
	ProviderFatalError,
	ProviderRunRejectedError,
	ProviderTaskFailedError,
	ProviderTaskPendingError,
	parseScrapeTargets,
} from "@workspace/lib/providers";
import {
	getProviderMaxConcurrency,
	getReportMaxProviderCalls,
	DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT,
	providerCircuitKey,
	providerTaskResumeBackoffMs,
} from "@workspace/lib/scheduler";
import { computeSystemTags, isPromptBranded } from "@workspace/lib/tag-utils";
import { eq, sql } from "drizzle-orm";
import { runReservedStructuredResearch } from "./scheduler/reserved-structured";
import { ProviderAdmissionDeferredError, providerAdmissionRetryAt } from "./scheduler/admission";
import {
	beginProviderCallReservation,
	checkpointProviderReservationResult,
	checkpointProviderReservationTask,
	markProviderFailure,
	markProviderSuccess,
	recordProviderReservationError,
	releaseProviderCallReservation,
	reserveProviderCall,
	type StoredProviderPayload,
	type StoredProviderResult,
} from "./scheduler/store";

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

async function waitForReportWork(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw signal.reason;
	await new Promise<void>((resolve, reject) => {
		const cleanup = () => signal?.removeEventListener("abort", abort);
		const timeout = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		const abort = () => {
			clearTimeout(timeout);
			cleanup();
			reject(signal?.reason ?? new Error("Report generation aborted"));
		};
		signal?.addEventListener("abort", abort, { once: true });
	});
}

async function checkpointReportTask(reservationId: string, workerId: string, taskId: string): Promise<void> {
	const delays = [1000, 2000, 5000, 10_000];
	for (let attempt = 0; ; attempt++) {
		try {
			await checkpointProviderReservationTask(reservationId, workerId, taskId);
			return;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Lost provider reservation")) throw error;
			const delay = delays[attempt];
			if (delay === undefined) throw error;
			await waitForReportWork(delay);
		}
	}
}

async function checkpointReportResult(
	reservationId: string,
	workerId: string,
	result: StoredProviderPayload,
	signal?: AbortSignal,
): Promise<void> {
	const delays = [1000, 2000, 5000, 10_000, 30_000];
	for (let attempt = 0; ; attempt++) {
		try {
			await checkpointProviderReservationResult(reservationId, workerId, result);
			return;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("Lost provider reservation")) throw error;
			const delay = delays[attempt];
			if (delay === undefined) throw error;
			await waitForReportWork(delay, signal);
		}
	}
}

interface ReportProviderReservation {
	id: string;
	attemptCount: number;
	externalTaskId?: string;
	cached?: StoredProviderPayload;
	cachedReleased?: boolean;
}

async function acquireReportProvider(input: {
	provider: string;
	circuitKey: string;
	reportId: string;
	workKey: string;
	requestFingerprint: string;
	requestMetadata: unknown;
	workerId: string;
	ownerMaxCalls: number;
	maxAttempts: number;
	signal?: AbortSignal;
}): Promise<ReportProviderReservation> {
	input.signal?.throwIfAborted();
	const providerMaxConcurrency = getProviderMaxConcurrency();
	const attempt = await reserveProviderCall({
		provider: input.provider,
		circuitKey: input.circuitKey,
		ownerType: "report",
		ownerId: input.reportId,
		workKey: input.workKey,
		requestFingerprint: input.requestFingerprint,
		requestMetadata: input.requestMetadata,
		workerId: input.workerId,
		providerMaxConcurrency,
		maxAttempts: input.maxAttempts,
		ownerMaxCalls: input.ownerMaxCalls,
	});
	if (attempt.state === "reserved" || attempt.state === "resumed") {
		return {
			id: attempt.id,
			attemptCount: attempt.attemptCount,
			externalTaskId: attempt.externalTaskId ?? undefined,
		};
	}
	if (attempt.state === "cached") {
		return {
			id: attempt.id,
			attemptCount: attempt.attemptCount,
			cached: attempt.result as StoredProviderPayload,
			cachedReleased: attempt.released,
		};
	}
	if (attempt.state === "capacity") {
		throw new ProviderAdmissionDeferredError(
			`Provider ${input.provider} is at fleet capacity`,
			providerAdmissionRetryAt({ providerMaxConcurrency }),
		);
	}
	if (attempt.state === "circuit") {
		throw new ProviderAdmissionDeferredError(
			`Provider route ${input.circuitKey} circuit is open`,
			providerAdmissionRetryAt({ reopenAt: attempt.reopenAt }),
		);
	}
	if (attempt.state === "busy") {
		throw new ProviderAdmissionDeferredError(
			`Report provider unit ${input.workKey} is leased by another worker`,
			providerAdmissionRetryAt({ retryAt: attempt.retryAt }),
		);
	}
	if (attempt.state === "budget") {
		throw new ProviderFatalError(`Report exhausted its hard provider-call budget of ${attempt.limit}`);
	}
	if (attempt.state === "ambiguous") {
		throw new ProviderFatalError(
			`Report provider unit ${input.workKey} lost its worker after submission without a durable result or task id`,
		);
	}
	if (attempt.state === "terminal") {
		throw new ProviderFatalError(
			`Report provider unit ${input.workKey} exhausted its safe attempts (${attempt.reason ?? "no reason recorded"})`,
		);
	}
	if (attempt.state === "conflict") {
		throw new ProviderFatalError(`Report provider unit ${input.workKey} changed after it was materialized`);
	}
	throw new ProviderFatalError(`Report provider unit ${input.workKey} returned an unknown admission state`);
}

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

function parseReportProviderPlan(value: unknown): ReportProviderPlan {
	if (!value || typeof value !== "object") throw new ProviderFatalError("Report provider plan is missing or invalid");
	const plan = value as Partial<ReportProviderPlan>;
	if (
		plan.version !== 1 ||
		!Number.isSafeInteger(plan.candidatePromptCount) ||
		(plan.candidatePromptCount ?? -1) < 0 ||
		!Number.isSafeInteger(plan.plannedProviderCalls) ||
		(plan.plannedProviderCalls ?? 0) < 1 ||
		!Number.isSafeInteger(plan.maxProviderCalls) ||
		(plan.maxProviderCalls ?? -1) < 0 ||
		!Number.isSafeInteger(plan.maxAttemptsPerUnit) ||
		(plan.maxAttemptsPerUnit ?? 0) < 1 ||
		!Array.isArray(plan.targets)
	) {
		throw new ProviderFatalError("Report provider plan failed validation");
	}
	for (const target of plan.targets) {
		if (
			!target ||
			typeof target.key !== "string" ||
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
	const parsed = plan as ReportProviderPlan;
	if (parsed.plannedProviderCalls > parsed.maxProviderCalls) {
		throw new ProviderFatalError("Stored report plan exceeds its durable provider-call budget");
	}
	return parsed;
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
		const targets = configs.map((config, index) => ({
			key: `${index}:${fingerprintProviderRequest(config, "report-plan-route")}`,
			config,
			runs: getReportRunsForModel(config.model),
		}));
		const candidatePromptCount = manualPromptCount > 0 ? manualPromptCount : CANDIDATE_PROMPTS_COUNT;
		const callsPerPrompt = targets.reduce((sum, target) => sum + target.runs, 0);
		const plannedProviderCalls = 1 + candidatePromptCount * callsPerPrompt;
		const maxProviderCalls = getReportMaxProviderCalls();
		if (plannedProviderCalls > maxProviderCalls) {
			throw new ProviderFatalError(
				`Report plans ${plannedProviderCalls} provider calls, exceeding REPORT_MAX_PROVIDER_CALLS=${maxProviderCalls}`,
			);
		}
		const plan: ReportProviderPlan = {
			version: 1,
			candidatePromptCount,
			targets,
			plannedProviderCalls,
			maxProviderCalls,
			maxAttemptsPerUnit: DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT,
		};
		await tx.execute(sql`
			UPDATE reports
			SET provider_plan = ${JSON.stringify(plan)}::json,
			    provider_call_budget = ${maxProviderCalls}, updated_at = now()
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
	const runOne = async (target: ReportTargetPlan, runIndex: number) => {
		const config = target.config;
		const providerImpl = getProvider(config.provider);
		const circuitKey = providerCircuitKey({
			provider: config.provider,
			model: config.model,
			version: config.version,
			webSearch: config.webSearch,
		});
		const reservation = await acquireReportProvider({
			provider: config.provider,
			circuitKey,
			reportId: job.data.reportId,
			workKey: `${workPrefix}:target:${target.key}:run:${runIndex}`,
			requestFingerprint: fingerprintProviderRequest(config, promptValue),
			requestMetadata: {
				prompt: promptValue,
				model: config.model,
				provider: config.provider,
				version: config.version ?? null,
				webSearch: config.webSearch,
				targetKey: target.key,
			},
			workerId: job.workerId,
			ownerMaxCalls: providerPlan.maxProviderCalls,
			maxAttempts: providerPlan.maxAttemptsPerUnit,
			signal: job.signal,
		});
		const reservationId = reservation.id;
		let externalTaskId = reservation.externalTaskId;
		let result: StoredProviderResult;
		if (reservation.cached) {
			try {
				result = normalizeStoredProviderPayload(config.provider, reservation.cached);
			} catch (error) {
				await recordProviderReservationError(reservationId, job.workerId, error);
				const circuit = await markProviderFailure({ circuitKey, runId: reservationId, kind: "transient", error });
				if (reservation.cachedReleased) {
					throw new ProviderFatalError("Released report response failed durable validation", { cause: error });
				}
				await releaseProviderCallReservation(reservationId, job.workerId, "invalid cached provider response", {
					retryAllowed: true,
				});
				throw new ProviderAdmissionDeferredError(
					"Stored report response failed validation",
					providerAdmissionRetryAt({ reopenAt: circuit.reopenAt }),
					{ cause: error },
				);
			}
			if (!reservation.cachedReleased) {
				await markProviderSuccess(circuitKey, reservationId);
				await releaseProviderCallReservation(reservationId, job.workerId, "result checkpoint recovered");
			}
		} else {
			job.signal?.throwIfAborted();
			await beginProviderCallReservation(reservationId, job.workerId);
			let rawResponseCheckpointed = false;
			try {
				result = validateProviderResult(
					await providerImpl.run(config.model, promptValue, {
						webSearch: config.webSearch,
						version: config.version,
						idempotencyKey: reservationId,
						externalTaskId,
						checkpointExternalTask: async (taskId) => {
							await checkpointReportTask(reservationId, job.workerId, taskId);
							externalTaskId = taskId;
						},
						checkpointRawResponse: async (response) => {
							await checkpointReportResult(
								reservationId,
								job.workerId,
								{ rawResponseOnly: true, ...response },
								job.signal,
							);
							rawResponseCheckpointed = true;
						},
					}),
				);
			} catch (error) {
				await recordProviderReservationError(reservationId, job.workerId, error);
				if (error instanceof ProviderTaskPendingError && externalTaskId) {
					throw new ProviderAdmissionDeferredError(
						"Accepted report task is still pending",
						providerAdmissionRetryAt({
							retryAt: new Date(
								Date.now() + Math.max(error.retryAfterMs, providerTaskResumeBackoffMs(reservation.attemptCount)),
							),
						}),
						{ cause: error },
					);
				}
				if (error instanceof ProviderRunRejectedError) {
					await releaseProviderCallReservation(reservationId, job.workerId, "provider rejected request");
					throw new ProviderFatalError(error.message, { cause: error });
				}

				const kind = isProviderFatalError(error) ? "fatal" : "transient";
				const circuit = await markProviderFailure({ circuitKey, runId: reservationId, kind, error });
				if (rawResponseCheckpointed || error instanceof ProviderTaskFailedError) {
					await releaseProviderCallReservation(
						reservationId,
						job.workerId,
						"provider task settled without usable output",
						{
							retryAllowed: true,
						},
					);
					throw new ProviderAdmissionDeferredError(
						"Provider attempt settled and will be retried within the report budget",
						providerAdmissionRetryAt({ reopenAt: circuit.reopenAt }),
						{ cause: error },
					);
				}
				if (externalTaskId) {
					throw new ProviderAdmissionDeferredError(
						"Accepted report task will be resumed from its durable provider id",
						providerAdmissionRetryAt({
							retryAt: new Date(Date.now() + providerTaskResumeBackoffMs(reservation.attemptCount)),
						}),
						{ cause: error },
					);
				}
				if (errorHasAcceptedTask(error)) throw error;

				if (isProviderDefinitivelyRejected(error)) {
					if (kind === "fatal") {
						await releaseProviderCallReservation(
							reservationId,
							job.workerId,
							"provider definitively rejected credentials or billing",
						);
						throw error instanceof ProviderFatalError
							? error
							: new ProviderFatalError(error instanceof Error ? error.message : String(error), { cause: error });
					}
					await releaseProviderCallReservation(reservationId, job.workerId, "provider response error", {
						retryAllowed: true,
					});
					throw new ProviderAdmissionDeferredError(
						"Provider rejected report work and a bounded retry was recorded",
						providerAdmissionRetryAt({ reopenAt: circuit.reopenAt }),
						{ cause: error },
					);
				}
				throw error;
			}

			try {
				await checkpointReportResult(reservationId, job.workerId, result, job.signal);
				await markProviderSuccess(circuitKey, reservationId);
				await releaseProviderCallReservation(reservationId, job.workerId, "completed");
			} catch (error) {
				throw new ProviderAdmissionDeferredError(
					"Report result finalization will resume from its durable checkpoint",
					providerAdmissionRetryAt({ retryAt: new Date(Date.now() + 60_000) }),
					{
						cause: error,
					},
				);
			}
		}

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
	for (const target of targetPlans) {
		for (let runIndex = 0; runIndex < target.runs; runIndex++) {
			job.signal?.throwIfAborted();
			runResults.push(await runOne(target, runIndex));
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
		const providerPlan = await getOrCreateReportProviderPlan(reportId, manualPrompts?.length ?? 0);
		job.log(`Provider-call budget: ${providerPlan.plannedProviderCalls}/${providerPlan.maxProviderCalls}`);
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
						ownerMaxCalls: providerPlan.maxProviderCalls,
						maxAttempts: providerPlan.maxAttemptsPerUnit,
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

			// Small delay between batches
			if (i + 1 < candidatePrompts.length) {
				await waitForReportWork(1000, job.signal);
			}
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

		// Update report status to completed
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

		const terminal = error instanceof ProviderFatalError && !errorHasAcceptedTask(error);
		if (terminal || (job.finalAttempt && !(error instanceof ProviderAdmissionDeferredError))) {
			await db.update(reports).set({ status: "failed", updatedAt: new Date() }).where(eq(reports.id, reportId));
		} else {
			job.log("Leaving durable report state in processing for a safe retry");
		}

		throw error;
	}
}
