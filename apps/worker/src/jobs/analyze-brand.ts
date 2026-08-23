import type { Job } from "pg-boss";
import { analyzeBrand, type OnboardingSuggestion } from "@workspace/lib/onboarding";

export interface AnalyzeBrandData {
	/** Brand id (== org id) the analysis belongs to; the web app reads results back by brand. */
	brandId: string;
	website: string;
	brandName?: string;
	maxCompetitors?: number;
	maxPrompts?: number;
}

/**
 * Run brand analysis as a background job.
 *
 * Brand analysis includes an LLM and web-search round trip that can outlast
 * reverse-proxy request timeouts. The web request returns after enqueueing and
 * polls the job's `output` via getJobById.
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
	return analyzeBrand({ website, brandName, maxCompetitors, maxPrompts });
}
