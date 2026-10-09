import { type OnboardingPrompt, type SuggestPromptsOptions, suggestPrompts } from "@workspace/lib/onboarding";
import type { Job } from "pg-boss";

export interface SuggestPromptsData extends SuggestPromptsOptions {
	/** The web app reads results back, and counts runs against the limit, by brand. */
	brandId: string;
}

export interface SuggestPromptsResult {
	prompts: OnboardingPrompt[];
}

/**
 * Runs in the worker for the same reason brand analysis does: the LLM and
 * web-search round trip can outlast reverse-proxy timeouts. Registered with
 * batchSize: 1 so the return value is that one job's output.
 */
export async function suggestPromptsJob(jobs: Job<SuggestPromptsData>[]): Promise<SuggestPromptsResult> {
	const [job] = jobs;
	if (!job) {
		throw new Error("suggest-prompts handler received an empty batch");
	}

	return { prompts: await suggestPrompts(job.data) };
}
