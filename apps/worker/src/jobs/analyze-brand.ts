import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { analyzeBrand, type OnboardingSuggestion } from "@workspace/lib/onboarding";
import { DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT } from "@workspace/lib/scheduler";
import type { Job } from "pg-boss";
import { runReservedStructuredResearch } from "../scheduler/reserved-structured";

export interface AnalyzeBrandData {
	/** Brand id (== org id) the analysis belongs to; the web app reads results back by brand. */
	brandId: string;
	website: string;
	brandName?: string;
	maxCompetitors?: number;
	maxPrompts?: number;
	requestId?: string;
	generationDeadlineAt?: string;
}

/**
 * Run brand analysis as a background job.
 *
 * The onboarding wizard used to call analyzeBrand() synchronously inside the
 * HTTP request. That call is an LLM + web-search round trip that routinely
 * takes ~1 minute, so it gets killed by reverse-proxy read timeouts (the user
 * sees a 504 even though the work finishes). Running it here lets the request
 * return immediately; the web app polls the job's `output` via getJobById.
 *
 * The queue is registered with batchSize: 1, so `jobs` always holds exactly
 * one job and the returned suggestion becomes that job's output.
 */
export async function analyzeBrandJob(jobs: Job<AnalyzeBrandData>[]): Promise<OnboardingSuggestion> {
	const [job] = jobs;
	if (!job) {
		throw new Error("analyze-brand handler received an empty batch");
	}

	const { website, brandName, maxCompetitors, maxPrompts } = job.data;
	const generationId = job.data.requestId ?? job.id;
	const workerId = `${hostname()}:${process.pid}:analyze-brand:${job.id}:${randomUUID()}`;
	return analyzeBrand({
		website,
		brandName,
		maxCompetitors,
		maxPrompts,
		structuredResearchRunner: (prompt, schema) =>
			runReservedStructuredResearch(
				{
					ownerType: "analyze-brand",
					ownerId: job.data.brandId,
					workKey: `analysis:${generationId}`,
					workerId,
					ownerMaxCalls: DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT,
					budgetScope: "work",
					exclusiveOwner: true,
					requestMetadata: {
						brandId: job.data.brandId,
						website,
						brandName: brandName ?? null,
						generationId,
					},
					signal: job.signal,
				},
				prompt,
				schema,
			),
	});
}
