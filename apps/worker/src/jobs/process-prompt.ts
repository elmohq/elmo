import * as Sentry from "@sentry/node";
import type { Job } from "pg-boss";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	citations,
	competitors,
	promptRuns,
	prompts,
	type Brand,
	type Competitor,
} from "@workspace/lib/db/schema";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { ASSIGNABLE_MODELS } from "@workspace/config/plans";
import {
	type BrandResolution,
	countAssignableModelUsage,
	type EffectiveTarget,
	resolveBrandTargets,
	resolvePromptTargets,
} from "@workspace/lib/config/resolve";
import { getProvider, type ModelConfig, type Provider } from "@workspace/lib/providers";
import type { Citation } from "@workspace/lib/text-extraction";
import boss from "../boss";
import { trackWorkerEvent } from "../telemetry";
import {
	isAssignableModel,
	orgAssignableBudget,
	rescheduleCadenceHours,
	RUN_WINDOW_MS,
	selectRunnableTargets,
	targetIdentityKey,
} from "./run-policy";

export interface ProcessPromptData {
	promptId: string;
	cadenceHours?: number; // advisory/back-compat; the job recomputes cadence each firing from resolved targets
	force?: boolean; // admin "run now": bypass the per-target due check (never the budgets)
}

interface PromptContext {
	prompt: typeof prompts.$inferSelect;
	brand: Brand;
	competitors: Competitor[];
}

/**
 * Schedule the next run for a prompt after the specified cadence.
 */
async function scheduleNextRun(promptId: string, cadenceHours: number): Promise<void> {
	const startAfterSeconds = cadenceHours * 60 * 60;

	try {
		await boss.send(
			"process-prompt",
			{ promptId, cadenceHours },
			{
				singletonKey: `prompt-${promptId}`,
				singletonSeconds: startAfterSeconds, // Prevent duplicates for the cadence period
				startAfter: startAfterSeconds,
				retryLimit: 3,
				retryDelay: 60,
				retryBackoff: true,
				expireInSeconds: 60 * 15,
			},
		);
		console.log(`Scheduled next run for prompt ${promptId} in ${cadenceHours}h`);
	} catch (error) {
		console.error(`Failed to schedule next run for prompt ${promptId}:`, error);
		// Don't throw - we don't want to fail the job just because rescheduling failed
	}
}

async function getPromptContext(promptId: string): Promise<PromptContext | null> {
	const prompt = await db.query.prompts.findFirst({
		where: eq(prompts.id, promptId),
	});

	if (!prompt) {
		console.error(`Prompt not found: ${promptId}`);
		return null;
	}

	// Brand and competitors both key only off prompt.brandId — fetch together.
	const [brand, brandCompetitors] = await Promise.all([
		db.query.brands.findFirst({ where: eq(brands.id, prompt.brandId) }),
		db.query.competitors.findMany({ where: eq(competitors.brandId, prompt.brandId) }),
	]);

	if (!brand) {
		console.error(`Brand not found: ${prompt.brandId}`);
		return null;
	}

	return {
		prompt,
		brand,
		competitors: brandCompetitors,
	};
}

/**
 * Per-target run history for one prompt: the last run time (dueness) and the
 * trailing-24h count (per-target budget), both keyed by target identity. One
 * grouped query — indexed by `prompt_runs_prompt_id_created_at_idx`.
 */
async function loadPromptRunHistory(
	promptId: string,
	windowStart: Date,
): Promise<{ lastRunAtMsByKey: Map<string, number>; recentCountByKey: Map<string, number> }> {
	const rows = await db
		.select({
			model: promptRuns.model,
			provider: promptRuns.provider,
			webSearch: promptRuns.webSearchEnabled,
			lastRunAt: sql<string>`MAX(${promptRuns.createdAt})`,
			recent: sql<string>`COUNT(*) FILTER (WHERE ${promptRuns.createdAt} > ${windowStart})`,
		})
		.from(promptRuns)
		.where(eq(promptRuns.promptId, promptId))
		.groupBy(promptRuns.model, promptRuns.provider, promptRuns.webSearchEnabled);

	const lastRunAtMsByKey = new Map<string, number>();
	const recentCountByKey = new Map<string, number>();
	for (const row of rows) {
		const key = targetIdentityKey({ model: row.model, provider: row.provider, webSearch: row.webSearch });
		if (row.lastRunAt) lastRunAtMsByKey.set(key, new Date(row.lastRunAt).getTime());
		recentCountByKey.set(key, Number(row.recent));
	}
	return { lastRunAtMsByKey, recentCountByKey };
}

/**
 * Org-wide trailing-24h run counts per assignable model, for the pool × runs/day
 * budget (A5). Only queries when a capped assignable target is actually present,
 * so unlimited (non-cloud) deployments do no extra work.
 */
async function loadOrgAssignableUsage(
	organizationId: string,
	targets: EffectiveTarget[],
	entitlements: BrandResolution["entitlements"],
	windowStart: Date,
): Promise<Map<string, number>> {
	const models = new Set<string>();
	for (const target of targets) {
		if (isAssignableModel(target.model) && orgAssignableBudget(entitlements, target.model) !== null) {
			models.add(target.model);
		}
	}
	if (models.size === 0) return new Map();

	const rows = await db
		.select({ model: promptRuns.model, n: count() })
		.from(promptRuns)
		.innerJoin(brands, eq(brands.id, promptRuns.brandId))
		.where(
			and(
				eq(brands.organizationId, organizationId),
				inArray(promptRuns.model, [...models]),
				gt(promptRuns.createdAt, windowStart),
			),
		)
		.groupBy(promptRuns.model);

	return new Map(rows.map((row) => [row.model, Number(row.n)]));
}

function extractDomainFromUrl(urlOrDomain: string): string {
	try {
		const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return urlOrDomain.replace(/^www\./, "").toLowerCase();
	}
}

function analyzeMentions(
	content: string,
	brand: Brand,
	competitorsList: Competitor[],
): {
	brandMentioned: boolean;
	competitorsMentioned: string[];
} {
	const contentLower = content.toLowerCase();

	const brandNames = [brand.name, ...(brand.aliases || [])].map((n) => n.toLowerCase());
	const brandDomains = [
		extractDomainFromUrl(brand.website),
		...(brand.additionalDomains || []).map(extractDomainFromUrl),
	];
	const brandMentioned =
		brandNames.some((n) => contentLower.includes(n)) || brandDomains.some((d) => contentLower.includes(d));

	const competitorsMentioned = competitorsList
		.filter((competitor) => {
			const names = [competitor.name, ...(competitor.aliases || [])].map((n) => n.toLowerCase());
			const nameMatch = names.some((n) => contentLower.includes(n));
			const domainMatch = (competitor.domains || []).some((d) => contentLower.includes(extractDomainFromUrl(d)));
			return nameMatch || domainMatch;
		})
		.map((competitor) => competitor.name);

	return { brandMentioned, competitorsMentioned };
}

async function savePromptRun(
	promptId: string,
	brandId: string,
	model: string,
	provider: string | null,
	version: string,
	webSearchEnabled: boolean,
	rawOutput: unknown,
	webQueries: string[],
	brandMentioned: boolean,
	competitorsMentioned: string[],
): Promise<{ id: string; createdAt: Date }> {
	const [result] = await db
		.insert(promptRuns)
		.values({
			promptId,
			brandId,
			model,
			provider,
			version,
			webSearchEnabled,
			rawOutput,
			webQueries,
			brandMentioned,
			competitorsMentioned,
		})
		.returning({ id: promptRuns.id, createdAt: promptRuns.createdAt });

	return result;
}

async function saveCitations(
	promptRunId: string,
	promptId: string,
	brandId: string,
	model: string,
	extracted: Citation[],
	createdAt: Date,
): Promise<void> {
	if (extracted.length === 0) return;

	await db.insert(citations).values(
		extracted.map((c) => ({
			promptRunId,
			promptId,
			brandId,
			model,
			url: c.url,
			domain: c.domain,
			title: c.title || null,
			citationIndex: c.citationIndex,
			createdAt,
		})),
	);
}

async function runModelIteration({
	promptId,
	promptValue,
	brand,
	competitorsList,
	config,
	providerImpl,
	runIndex,
}: {
	promptId: string;
	promptValue: string;
	brand: Brand;
	competitorsList: Competitor[];
	config: ModelConfig;
	providerImpl: Provider;
	runIndex: number;
}): Promise<void> {
	const logPrefix = `[${config.model}_${runIndex}]`;

	try {
		const result = await providerImpl.run(config.model, promptValue, {
			webSearch: config.webSearch,
			version: config.version,
		});

		// `webQueries` is stored exactly as the provider reported it — engines do
		// sometimes genuinely search the prompt verbatim, and that's real data. The
		// fan-out page excludes verbatim repeats at read time as a display rule;
		// providers whose query field is fabricated (DataForSEO) write the
		// `unavailable` sentinel in their own extractor instead.
		const { rawOutput, textContent, webQueries, citations: extractedCitations, modelVersion } = result;
		console.log(`${logPrefix} AI call completed, textContent length: ${textContent?.length ?? "null"}`);

		const safeTextContent = typeof textContent === "string" ? textContent : "";

		const { brandMentioned, competitorsMentioned } = analyzeMentions(safeTextContent, brand, competitorsList);

		const recordedVersion = modelVersion ?? config.version ?? config.provider;

		const { id: promptRunId, createdAt } = await savePromptRun(
			promptId,
			brand.id,
			config.model,
			config.provider,
			recordedVersion,
			config.webSearch,
			rawOutput,
			webQueries,
			brandMentioned,
			competitorsMentioned,
		);
		console.log(`${logPrefix} Saved prompt run ${promptRunId}`);

		await saveCitations(promptRunId, promptId, brand.id, config.model, extractedCitations, createdAt);
	} catch (error) {
		// A single run's failure doesn't fail the job (only an all-runs failure
		// does), so report it here to keep per-provider failure rates visible.
		Sentry.withScope((scope) => {
			scope.setTag("queue", "process-prompt");
			scope.setTag("provider", config.provider);
			scope.setTag("model", config.model);
			scope.setContext("run", { promptId, brandId: brand.id, runIndex });
			Sentry.captureException(error);
		});
		throw error;
	}
}

/** An effective target is dispatched through the provider layer as a ModelConfig. */
function toModelConfig(target: EffectiveTarget): ModelConfig {
	return { model: target.model, provider: target.provider, version: target.version, webSearch: target.webSearch };
}

/**
 * Process a prompt - runs AI models and saves results.
 * This is a pg-boss job handler, called when a scheduled job fires.
 *
 * Targets, replication, and cadence all come from the config resolver (catalog ∩
 * entitlements ∩ resolved selections). Each firing runs every effective target
 * that is both due at its resolved cadence and within its runnable budget, then
 * reschedules at the fastest of the prompt's target cadences. A prompt that
 * resolves to zero targets completes WITHOUT rescheduling (A8b) — maintenance
 * revives it when the catalog/config changes.
 */
const CLAUDE = ASSIGNABLE_MODELS[0];

export async function processPromptJob(jobs: Job<ProcessPromptData>[]): Promise<void> {
	// The assignable (Claude) pool count is org-scoped and stable across this
	// batch — the job only reads and runs, never mutates assignments — so compute
	// it once per org and reuse it for every prompt in that org.
	const assignablePoolByOrg = new Map<string, number>();
	// pg-boss v12 passes an array of jobs - process each one
	for (const job of jobs) {
		const { promptId, force = false } = job.data;
		console.log(`Processing prompt ${promptId}`);

		// Get prompt context
		const context = await getPromptContext(promptId);
		if (!context) {
			console.log(`Prompt ${promptId} not found, skipping (no reschedule)`);
			continue; // Job completes successfully - prompt was deleted, don't reschedule
		}

		const { prompt, brand, competitors: competitorsList } = context;

		// Check if prompt and brand are enabled
		if (!prompt.enabled || !brand.enabled) {
			console.log(`Prompt ${promptId} or brand ${brand.id} is disabled, skipping but rescheduling`);
			// Still reschedule - the prompt might be enabled later; targets are
			// recomputed on the firing after re-enable.
			await scheduleNextRun(promptId, getDefaultDelayHours());
			continue;
		}

		// Resolve effective targets from the DB config hierarchy.
		const brandResolution = await resolveBrandTargets(brand, brand.organizationId);
		let assignablePoolUsage = assignablePoolByOrg.get(brand.organizationId);
		if (assignablePoolUsage === undefined) {
			assignablePoolUsage = await countAssignableModelUsage(brand.organizationId, CLAUDE);
			assignablePoolByOrg.set(brand.organizationId, assignablePoolUsage);
		}
		const { targets, excluded } = await resolvePromptTargets(prompt, brandResolution, { assignablePoolUsage });

		for (const ex of excluded) {
			console.debug(
				`[process-prompt] ${promptId} target ${ex.target.model}:${ex.target.provider} excluded: ${ex.reasons.join(", ")}`,
			);
		}

		const nextCadenceHours = rescheduleCadenceHours(targets, getDefaultDelayHours());
		if (nextCadenceHours === null) {
			// A8b: a zero-target prompt must NOT self-reschedule (avoids idle churn);
			// maintenance revives it once the catalog/config makes a target eligible.
			console.log(`Prompt ${promptId} resolved to zero effective targets — completing without reschedule`);
			continue;
		}

		const now = new Date();
		const windowStart = new Date(now.getTime() - RUN_WINDOW_MS);
		const [{ lastRunAtMsByKey, recentCountByKey }, orgAssignableUsedByModel] = await Promise.all([
			loadPromptRunHistory(promptId, windowStart),
			loadOrgAssignableUsage(brand.organizationId, targets, brandResolution.entitlements, windowStart),
		]);

		const { runnable, skipped } = selectRunnableTargets({
			targets,
			bypassDue: force,
			nowMs: now.getTime(),
			lastRunAtMsByKey,
			recentCountByKey,
			entitlements: brandResolution.entitlements,
			orgAssignableUsedByModel,
		});

		for (const s of skipped) {
			console.log(`[process-prompt] ${promptId} skipping ${s.target.model}:${s.target.provider} (${s.reason})`);
		}

		console.log(`Processing prompt "${prompt.value}" for brand "${brand.name}"`);

		// Run all runnable model iterations in parallel, each at its replication.
		const runPromises: Promise<void>[] = [];
		for (const target of runnable) {
			const providerImpl = getProvider(target.provider);
			const config = toModelConfig(target);
			for (let i = 0; i < target.runPolicy.replication; i++) {
				runPromises.push(
					runModelIteration({
						promptId,
						promptValue: prompt.value,
						brand,
						competitorsList,
						config,
						providerImpl,
						runIndex: i + 1,
					}),
				);
			}
		}

		if (runPromises.length === 0) {
			// Everything was skipped (not-due / budget) — a quiet, successful cycle.
			console.log(`Prompt ${promptId}: all ${targets.length} target(s) skipped this cycle (not-due/budget)`);
		} else {
			const results = await Promise.allSettled(runPromises);
			const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

			if (failures.length > 0) {
				const errorMessages = failures
					.map((f, i) => `Run ${i + 1}: ${f.reason instanceof Error ? f.reason.message : String(f.reason)}`)
					.join("; ");

				// Log failures but don't throw if some succeeded
				console.error(`Prompt ${promptId} had ${failures.length}/${runPromises.length} failed runs: ${errorMessages}`);

				// If ALL attempted runs failed, throw to trigger retry
				if (failures.length === runPromises.length) {
					throw new Error(`All runs failed for prompt ${promptId}: ${errorMessages}`);
				}
			}

			const successCount = runPromises.length - failures.length;
			console.log(`Completed prompt ${promptId}: ${successCount}/${runPromises.length} successful runs`);

			trackWorkerEvent("prompt_processed", {
				brand_id: brand.id,
				models: [...new Set(runnable.map((t) => t.model))],
				providers: [...new Set(runnable.map((t) => t.provider))],
				total_runs: runPromises.length,
				successful_runs: successCount,
				failed_runs: failures.length,
			});
		}

		// Reschedule against the fastest resolved cadence so mixed-cadence prompts
		// fire often enough for their tightest target; the due check gates which
		// targets actually run on each firing.
		await scheduleNextRun(promptId, nextCadenceHours);
	}
}
